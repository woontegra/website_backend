import { Prisma, NavigationMenuItemType } from '@prisma/client'
import { prisma } from '../lib/prisma'

const includeNav = {
  product: { select: { id: true, slug: true, isActive: true, name: true } },
  category: { select: { id: true, slug: true, isActive: true, name: true } },
  page: { select: { id: true, slug: true, status: true } },
} as const

type NavRow = {
  id: string
  label: string
  type: NavigationMenuItemType
  url: string | null
  productId: string | null
  categoryId: string | null
  pageId: string | null
  parentId: string | null
  sortOrder: number
  isActive: boolean
  openInNewTab: boolean
  createdAt: Date
  updatedAt: Date
  product: { id: string; slug: string; isActive: boolean; name: string } | null
  category: { id: string; slug: string; isActive: boolean; name: string } | null
  page: { id: string; slug: string; status: string } | null
}

export type NavigationMenuAdminDto = {
  id: string
  label: string
  type: NavigationMenuItemType
  url: string | null
  productId: string | null
  categoryId: string | null
  pageId: string | null
  parentId: string | null
  sortOrder: number
  isActive: boolean
  openInNewTab: boolean
  createdAt: string
  updatedAt: string
  /** Hedefin public sitedeki yolu (veya tam URL) */
  resolvedUrl: string
}

export type NavigationMenuPublicItem = {
  id: string
  label: string
  /** Geriye dönük uyumluluk — resolvedUrl ile aynı */
  href: string
  resolvedUrl: string
  openInNewTab: boolean
  sortOrder: number
  children: NavigationMenuPublicItem[]
}

function mapAdmin(row: NavRow): NavigationMenuAdminDto {
  return {
    id: row.id,
    label: row.label,
    type: row.type,
    url: row.url,
    productId: row.productId,
    categoryId: row.categoryId,
    pageId: row.pageId,
    parentId: row.parentId,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    openInNewTab: row.openInNewTab,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedUrl: resolveHref(row),
  }
}

export function resolveHref(row: NavRow): string {
  switch (row.type) {
    case 'CUSTOM_URL': {
      const u = (row.url && row.url.trim()) || ''
      return u || '#'
    }
    case 'PRODUCT':
      if (row.product?.isActive) return `/urun/${row.product.slug}`
      return '#'
    case 'CATEGORY':
      if (row.category?.isActive) return `/kategori/${row.category.slug}`
      return '#'
    case 'PAGE':
      if (row.page?.status === 'published') return `/${row.page.slug}`
      return '#'
    default:
      return '#'
  }
}

function buildPublicTree(rows: NavRow[]): NavigationMenuPublicItem[] {
  const roots = rows.filter((r) => !r.parentId).sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
  const byParent = new Map<string | null, NavRow[]>()
  for (const r of rows) {
    const k = r.parentId
    if (!byParent.has(k)) byParent.set(k, [])
    byParent.get(k)!.push(r)
  }
  for (const [, list] of byParent) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
  }

  const mapNode = (row: NavRow): NavigationMenuPublicItem => {
    const kids = (byParent.get(row.id) ?? []).map(mapNode)
    const resolvedUrl = resolveHref(row)
    return {
      id: row.id,
      label: row.label,
      href: resolvedUrl,
      resolvedUrl,
      openInNewTab: row.openInNewTab,
      sortOrder: row.sortOrder,
      children: kids,
    }
  }

  return roots.map(mapNode)
}

export type CreateNav = {
  label: string
  type: NavigationMenuItemType
  url?: string | null
  productId?: string | null
  categoryId?: string | null
  pageId?: string | null
  parentId?: string | null
  sortOrder?: number
  isActive?: boolean
  openInNewTab?: boolean
}

function parseType(v: unknown): NavigationMenuItemType {
  if (v === 'CUSTOM_URL' || v === 'PRODUCT' || v === 'CATEGORY' || v === 'PAGE') return v
  return 'CUSTOM_URL'
}

async function assertNavTargetsValid(m: CreateNav): Promise<void> {
  const t = parseType(m.type)
  if (t === 'CUSTOM_URL') {
    const u = (m.url ?? '').trim()
    if (!u) throw new Error('Özel URL türü için adres zorunludur')
    if (!/^https?:\/\//i.test(u) && !u.startsWith('/')) {
      throw new Error('Adres http(s) veya / ile başlayan bir yol olmalıdır')
    }
    return
  }
  if (t === 'PRODUCT') {
    if (!m.productId?.trim()) throw new Error('Ürün seçimi zorunludur')
    const p = await prisma.product.findUnique({ where: { id: m.productId } })
    if (!p) throw new Error('Ürün bulunamadı')
    return
  }
  if (t === 'CATEGORY') {
    if (!m.categoryId?.trim()) throw new Error('Kategori seçimi zorunludur')
    const c = await prisma.productCategory.findUnique({ where: { id: m.categoryId } })
    if (!c) throw new Error('Kategori bulunamadı')
    return
  }
  if (t === 'PAGE') {
    if (!m.pageId?.trim()) throw new Error('Sayfa seçimi zorunludur')
    const pg = await prisma.page.findUnique({ where: { id: m.pageId } })
    if (!pg) throw new Error('Sayfa bulunamadı')
    return
  }
}

function toPrismaCreateData(m: CreateNav): Prisma.NavigationMenuItemCreateInput {
  const t = parseType(m.type)
  const base: Prisma.NavigationMenuItemCreateInput = {
    label: m.label.trim(),
    type: t,
    url: t === 'CUSTOM_URL' ? (m.url ?? '').trim() : null,
    sortOrder: typeof m.sortOrder === 'number' && Number.isFinite(m.sortOrder) ? m.sortOrder : 0,
    isActive: m.isActive !== false,
    openInNewTab: m.openInNewTab === true,
  }
  if (t === 'PRODUCT' && m.productId) base.product = { connect: { id: m.productId } }
  if (t === 'CATEGORY' && m.categoryId) base.category = { connect: { id: m.categoryId } }
  if (t === 'PAGE' && m.pageId) base.page = { connect: { id: m.pageId } }
  if (m.parentId?.trim()) base.parent = { connect: { id: m.parentId.trim() } }
  return base
}

function toPrismaUpdateData(m: CreateNav): Prisma.NavigationMenuItemUpdateInput {
  const t = parseType(m.type)
  return {
    label: m.label.trim(),
    type: t,
    url: t === 'CUSTOM_URL' ? (m.url ?? '').trim() || null : null,
    sortOrder: typeof m.sortOrder === 'number' && Number.isFinite(m.sortOrder) ? m.sortOrder : 0,
    isActive: m.isActive !== false,
    openInNewTab: m.openInNewTab === true,
    product: t === 'PRODUCT' && m.productId ? { connect: { id: m.productId } } : { disconnect: true },
    category: t === 'CATEGORY' && m.categoryId ? { connect: { id: m.categoryId } } : { disconnect: true },
    page: t === 'PAGE' && m.pageId ? { connect: { id: m.pageId } } : { disconnect: true },
    parent: m.parentId?.trim() ? { connect: { id: m.parentId.trim() } } : { disconnect: true },
  }
}

async function mergeExisting(id: string, data: Partial<CreateNav>): Promise<CreateNav> {
  const ex = await prisma.navigationMenuItem.findUnique({ where: { id } })
  if (!ex) throw new Error('Kayıt bulunamadı')
  return {
    label: data.label !== undefined ? String(data.label).trim() : ex.label,
    type: data.type !== undefined ? parseType(data.type) : ex.type,
    url: data.url !== undefined ? (data.url === null ? null : String(data.url)) : ex.url,
    productId: data.productId !== undefined ? data.productId : ex.productId,
    categoryId: data.categoryId !== undefined ? data.categoryId : ex.categoryId,
    pageId: data.pageId !== undefined ? data.pageId : ex.pageId,
    parentId: data.parentId !== undefined ? data.parentId : ex.parentId,
    sortOrder: data.sortOrder !== undefined ? data.sortOrder! : ex.sortOrder,
    isActive: data.isActive !== undefined ? data.isActive! : ex.isActive,
    openInNewTab: data.openInNewTab !== undefined ? data.openInNewTab! : ex.openInNewTab,
  }
}

export const navigationMenuService = {
  async listAdminFlat(): Promise<NavigationMenuAdminDto[]> {
    const rows = await prisma.navigationMenuItem.findMany({
      include: includeNav,
      orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    })
    return rows.map((r) => mapAdmin(r as NavRow))
  },

  async getAdminById(id: string): Promise<NavigationMenuAdminDto | null> {
    const row = await prisma.navigationMenuItem.findUnique({
      where: { id },
      include: includeNav,
    })
    return row ? mapAdmin(row as NavRow) : null
  },

  async listPublic(): Promise<NavigationMenuPublicItem[]> {
    const rows = await prisma.navigationMenuItem.findMany({
      where: { isActive: true },
      include: includeNav,
      orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }],
    })
    return buildPublicTree(rows as NavRow[])
  },

  async create(data: CreateNav): Promise<NavigationMenuAdminDto> {
    await assertNavTargetsValid(data)
    const row = await prisma.navigationMenuItem.create({
      data: toPrismaCreateData(data),
    })
    const full = await prisma.navigationMenuItem.findUniqueOrThrow({
      where: { id: row.id },
      include: includeNav,
    })
    return mapAdmin(full as NavRow)
  },

  async update(id: string, data: Partial<CreateNav>): Promise<NavigationMenuAdminDto> {
    const merged = await mergeExisting(id, data)
    if (merged.parentId === id) throw new Error('Menü öğesi kendi alt öğesi olamaz')
    await assertNavTargetsValid(merged)
    const row = await prisma.navigationMenuItem.update({
      where: { id },
      data: toPrismaUpdateData(merged),
      include: includeNav,
    })
    return mapAdmin(row as NavRow)
  },

  async delete(id: string): Promise<void> {
    await prisma.navigationMenuItem.delete({ where: { id } })
  },
}
