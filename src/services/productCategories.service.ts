import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { slugifyName } from '../utils/slugify'

export type ProductCategoryDto = {
  id: string
  name: string
  slug: string
  description: string | null
  parentId: string | null
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

function mapCat(c: {
  id: string
  name: string
  slug: string
  description: string | null
  parentId: string | null
  isActive: boolean
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}): ProductCategoryDto {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    parentId: c.parentId,
    isActive: c.isActive,
    sortOrder: c.sortOrder,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

type CreateCat = {
  name: string
  slug?: string
  description?: string | null
  parentId?: string | null
  isActive?: boolean
  sortOrder?: number
}

export const productCategoriesService = {
  async listAdmin(): Promise<ProductCategoryDto[]> {
    const rows = await prisma.productCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
    return rows.map(mapCat)
  },

  async getAdminById(id: string): Promise<ProductCategoryDto | null> {
    const c = await prisma.productCategory.findUnique({ where: { id } })
    return c ? mapCat(c) : null
  },

  async listPublic(): Promise<ProductCategoryDto[]> {
    const rows = await prisma.productCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
    return rows.map(mapCat)
  },

  async create(data: CreateCat): Promise<ProductCategoryDto> {
    const slug = (data.slug?.trim() || slugifyName(data.name, 'kategori')).toLowerCase()
    const row = await prisma.productCategory.create({
      data: {
        name: data.name.trim(),
        slug,
        description: data.description?.trim() || null,
        parentId: data.parentId ?? null,
        isActive: data.isActive !== false,
        sortOrder: typeof data.sortOrder === 'number' && Number.isFinite(data.sortOrder) ? data.sortOrder : 0,
      },
    })
    return mapCat(row)
  },

  async update(id: string, data: Partial<CreateCat>): Promise<ProductCategoryDto> {
    const patch: Prisma.ProductCategoryUpdateInput = {}
    if (data.name !== undefined) patch.name = data.name.trim()
    if (data.slug !== undefined) patch.slug = data.slug.trim().toLowerCase()
    if (data.description !== undefined) patch.description = data.description?.trim() || null
    if (data.parentId !== undefined) {
      if (data.parentId === id) throw new Error('Kategori kendisinin alt kategorisi olamaz')
      patch.parent =
        data.parentId === null ? { disconnect: true } : { connect: { id: data.parentId } }
    }
    if (data.isActive !== undefined) patch.isActive = data.isActive
    if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder

    const row = await prisma.productCategory.update({ where: { id }, data: patch })
    return mapCat(row)
  },

  /** Bağlı ürün varsa pasifleştir; yoksa pasifleştir (hard delete yok). */
  async deleteOrDeactivate(id: string): Promise<{ deactivated: boolean; hadProducts: boolean }> {
    const count = await prisma.product.count({ where: { categoryId: id } })
    await prisma.productCategory.update({
      where: { id },
      data: { isActive: false },
    })
    return { deactivated: true, hadProducts: count > 0 }
  },

  async getPublicBySlug(slug: string): Promise<ProductCategoryDto | null> {
    const c = await prisma.productCategory.findFirst({
      where: { slug, isActive: true },
    })
    return c ? mapCat(c) : null
  },
}
