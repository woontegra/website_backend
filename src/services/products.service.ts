import { Prisma, ProductType } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { sanitizeImageUrl } from '../utils/sanitizeImageFields'
import { slugifyName } from '../utils/slugify'

const categorySelect = { id: true, name: true, slug: true, isActive: true } as const
const mediaTiny = { id: true, url: true, fileType: true, originalName: true, fileSize: true } as const

export type ProductCategoryBrief = {
  id: string
  name: string
  slug: string
}

export type CatalogMediaBrief = {
  id: string
  url: string
  fileType: string
  originalName: string
  fileSize: number
}

export type AdminProductGalleryImage = {
  id: string
  sortOrder: number
  mediaId: string
  url: string
  fileType: string
  originalName: string
  fileSize: number
}

export type AdminProductDto = {
  id: string
  name: string
  slug: string
  productType: ProductType
  shortDescription: string
  description: string
  price: number
  compareAtPrice: number | null
  currency: string
  isActive: boolean
  isFeatured: boolean
  sortOrder: number
  version: string | null
  coverImage: string | null
  downloadUrl: string | null
  categoryId: string | null
  category: ProductCategoryBrief | null
  seoTitle: string | null
  seoDescription: string | null
  coverImageMediaId: string | null
  downloadMediaId: string | null
  coverMedia: { id: string; url: string; fileType: string } | null
  downloadMedia: CatalogMediaBrief | null
  galleryImages: AdminProductGalleryImage[]
  createdAt: string
  updatedAt: string
}

export type PublicProductGalleryImage = {
  id: string
  url: string
  sortOrder: number
}

export type PublicProductListItem = {
  id: string
  name: string
  slug: string
  productType: ProductType
  shortDescription: string
  price: number
  compareAtPrice: number | null
  currency: string
  isFeatured: boolean
  sortOrder: number
  version: string | null
  coverImage: string | null
  category: ProductCategoryBrief | null
}

export type PublicProductDetail = PublicProductListItem & {
  description: string
  seoTitle: string | null
  seoDescription: string | null
  galleryImages: PublicProductGalleryImage[]
}

function toNumber(d: Prisma.Decimal | null | undefined): number | null {
  if (d === null || d === undefined) return null
  return Number(d)
}

type ProductRow = {
  id: string
  name: string
  slug: string
  productType: ProductType
  shortDescription: string
  description: string
  price: Prisma.Decimal
  compareAtPrice: Prisma.Decimal | null
  currency: string
  isActive: boolean
  isFeatured: boolean
  sortOrder: number
  version: string | null
  coverImage: string | null
  downloadUrl: string | null
  categoryId: string | null
  seoTitle: string | null
  seoDescription: string | null
  coverImageMediaId: string | null
  downloadMediaId: string | null
  createdAt: Date
  updatedAt: Date
  category: { id: string; name: string; slug: string; isActive: boolean } | null
  coverImageMedia: { id: string; url: string; fileType: string } | null
  downloadMedia: {
    id: string
    url: string
    fileType: string
    originalName: string
    fileSize: number
  } | null
  galleryImages: {
    id: string
    sortOrder: number
    media: {
      id: string
      url: string
      fileType: string
      originalName: string
      fileSize: number
    }
  }[]
}

function mapAdmin(p: ProductRow): AdminProductDto {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    productType: p.productType,
    shortDescription: p.shortDescription,
    description: p.description,
    price: toNumber(p.price)!,
    compareAtPrice: toNumber(p.compareAtPrice),
    currency: p.currency,
    isActive: p.isActive,
    isFeatured: p.isFeatured,
    sortOrder: p.sortOrder,
    version: p.version,
    coverImage: p.coverImage,
    downloadUrl: p.downloadUrl,
    categoryId: p.categoryId,
    category: p.category ? { id: p.category.id, name: p.category.name, slug: p.category.slug } : null,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    coverImageMediaId: p.coverImageMediaId,
    downloadMediaId: p.downloadMediaId,
    coverMedia: p.coverImageMedia
      ? { id: p.coverImageMedia.id, url: p.coverImageMedia.url, fileType: p.coverImageMedia.fileType }
      : null,
    downloadMedia: p.downloadMedia
      ? {
          id: p.downloadMedia.id,
          url: p.downloadMedia.url,
          fileType: p.downloadMedia.fileType,
          originalName: p.downloadMedia.originalName,
          fileSize: p.downloadMedia.fileSize,
        }
      : null,
    galleryImages: (p.galleryImages ?? []).map((g) => ({
      id: g.id,
      sortOrder: g.sortOrder,
      mediaId: g.media.id,
      url: g.media.url,
      fileType: g.media.fileType,
      originalName: g.media.originalName,
      fileSize: g.media.fileSize,
    })),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}

function publicCategory(
  c: { id: string; name: string; slug: string; isActive: boolean } | null | undefined,
): ProductCategoryBrief | null {
  if (!c || !c.isActive) return null
  return { id: c.id, name: c.name, slug: c.slug }
}

function mapPublicList(p: ProductRow): PublicProductListItem {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    productType: p.productType,
    shortDescription: p.shortDescription,
    price: toNumber(p.price)!,
    compareAtPrice: toNumber(p.compareAtPrice),
    currency: p.currency,
    isFeatured: p.isFeatured,
    sortOrder: p.sortOrder,
    version: p.version,
    coverImage: p.coverImage,
    category: publicCategory(p.category ?? undefined),
  }
}

function mapPublicDetail(p: ProductRow): PublicProductDetail {
  const gallery: PublicProductGalleryImage[] = (p.galleryImages ?? [])
    .filter((g) => g.media.fileType === 'IMAGE')
    .map((g) => ({
      id: g.id,
      url: g.media.url,
      sortOrder: g.sortOrder,
    }))
  return {
    ...mapPublicList(p),
    description: p.description,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    galleryImages: gallery,
  }
}

const galleryArgs = {
  orderBy: { sortOrder: 'asc' as const },
  select: {
    id: true,
    sortOrder: true,
    media: { select: { id: true, url: true, fileType: true, originalName: true, fileSize: true } },
  },
} as const

const productInclude = {
  category: { select: categorySelect },
  coverImageMedia: { select: { id: true, url: true, fileType: true } },
  downloadMedia: { select: mediaTiny },
  galleryImages: galleryArgs,
} as const

/** Public API: indirme alanları DB’den okunmaz (yanlışlıkla JSON’a sızmaz). */
const productPublicSelect = {
  id: true,
  name: true,
  slug: true,
  productType: true,
  shortDescription: true,
  description: true,
  price: true,
  compareAtPrice: true,
  currency: true,
  isActive: true,
  isFeatured: true,
  sortOrder: true,
  version: true,
  coverImage: true,
  categoryId: true,
  seoTitle: true,
  seoDescription: true,
  coverImageMediaId: true,
  createdAt: true,
  updatedAt: true,
  category: { select: categorySelect },
  coverImageMedia: { select: { id: true, url: true, fileType: true } },
  galleryImages: galleryArgs,
} as const satisfies Prisma.ProductSelect

export type AdminProductListQuery = {
  search?: string
  isActive?: 'true' | 'false' | 'all'
  categoryId?: string
  productType?: ProductType
}

type CreateInput = {
  name: string
  slug?: string
  productType?: ProductType
  shortDescription?: string
  description?: string
  price: number
  compareAtPrice?: number | null
  currency?: string
  isActive?: boolean
  isFeatured?: boolean
  sortOrder?: number
  version?: string | null
  coverImage?: string | null
  downloadUrl?: string | null
  categoryId?: string | null
  seoTitle?: string | null
  seoDescription?: string | null
  coverImageMediaId?: string | null
  downloadMediaId?: string | null
  galleryMediaIds?: string[] | null
}

type PatchInput = Partial<CreateInput>

async function syncProductGallery(productId: string, mediaIds: string[]): Promise<void> {
  const ordered = [...new Set(mediaIds.map((id) => id.trim()).filter(Boolean))]
  await prisma.$transaction(async (tx) => {
    await tx.productGalleryImage.deleteMany({ where: { productId } })
    if (ordered.length === 0) return
    const mediaRows = await tx.catalogMedia.findMany({
      where: { id: { in: ordered }, fileType: 'IMAGE' },
    })
    if (mediaRows.length !== ordered.length) {
      throw new Error('Galeri için yalnızca geçerli görsel (IMAGE) medya seçilebilir')
    }
    await tx.productGalleryImage.createMany({
      data: ordered.map((mediaId, i) => ({
        productId,
        mediaId,
        sortOrder: i,
      })),
    })
  })
}

function parseProductType(v: unknown): ProductType {
  if (v === 'SAAS' || v === 'SERVICE' || v === 'DOWNLOAD') return v
  return 'DOWNLOAD'
}

function normalizeUrl(url: string | null | undefined): string | null {
  if (url === undefined || url === null) return null
  const t = url.trim()
  return t === '' ? null : t
}

async function resolveMediaIds(data: {
  coverImageMediaId?: string | null
  downloadMediaId?: string | null
}): Promise<{
  coverImageMediaId?: string | null
  coverImage?: string | null
  downloadMediaId?: string | null
  downloadUrl?: string | null
}> {
  const out: {
    coverImageMediaId?: string | null
    coverImage?: string | null
    downloadMediaId?: string | null
    downloadUrl?: string | null
  } = {}

  if (Object.prototype.hasOwnProperty.call(data, 'coverImageMediaId')) {
    const v = data.coverImageMediaId
    if (v === null || v === '') {
      out.coverImageMediaId = null
      out.coverImage = null
    } else {
      const m = await prisma.catalogMedia.findUnique({ where: { id: v } })
      if (!m) throw new Error('Kapak medyası bulunamadı')
      if (m.fileType !== 'IMAGE') throw new Error('Kapak için yalnızca görsel (IMAGE) seçilebilir')
      out.coverImageMediaId = m.id
      out.coverImage = m.url
    }
  }

  if (Object.prototype.hasOwnProperty.call(data, 'downloadMediaId')) {
    const v = data.downloadMediaId
    if (v === null || v === '') {
      out.downloadMediaId = null
      out.downloadUrl = null
    } else {
      const m = await prisma.catalogMedia.findUnique({ where: { id: v } })
      if (!m) throw new Error('İndirme medyası bulunamadı')
      if (m.fileType !== 'DOWNLOAD' && m.fileType !== 'DOCUMENT') {
        throw new Error('İndirme dosyası için DOWNLOAD veya DOCUMENT tipi seçin')
      }
      out.downloadMediaId = m.id
      out.downloadUrl = m.url
    }
  }

  return out
}

const publicListWhere: Prisma.ProductWhereInput = {
  isActive: true,
  OR: [{ categoryId: null }, { category: { isActive: true } }],
}

export const productsService = {
  async listAdmin(q?: AdminProductListQuery): Promise<AdminProductDto[]> {
    const where: Prisma.ProductWhereInput = {}
    if (q?.search?.trim()) {
      const s = q.search.trim()
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { slug: { contains: s, mode: 'insensitive' } },
      ]
    }
    if (q?.isActive === 'true') where.isActive = true
    else if (q?.isActive === 'false') where.isActive = false
    if (q?.categoryId) where.categoryId = q.categoryId
    if (q?.productType) where.productType = q.productType

    const rows = await prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    })
    return rows.map((r) => mapAdmin(r as unknown as ProductRow))
  },

  async getAdminById(id: string): Promise<AdminProductDto | null> {
    const p = await prisma.product.findUnique({
      where: { id },
      include: productInclude,
    })
    return p ? mapAdmin(p as unknown as ProductRow) : null
  },

  async listPublic(): Promise<PublicProductListItem[]> {
    const rows = await prisma.product.findMany({
      where: publicListWhere,
      select: productPublicSelect,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    })
    return rows.map((r) => mapPublicList(r as unknown as ProductRow))
  },

  async listPublicByCategorySlug(categorySlug: string): Promise<PublicProductListItem[]> {
    const cat = await prisma.productCategory.findFirst({
      where: { slug: categorySlug, isActive: true },
    })
    if (!cat) return []

    const rows = await prisma.product.findMany({
      where: {
        ...publicListWhere,
        categoryId: cat.id,
      },
      select: productPublicSelect,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    })
    return rows.map((r) => mapPublicList(r as unknown as ProductRow))
  },

  async getPublicBySlug(slug: string): Promise<PublicProductDetail | null> {
    const p = await prisma.product.findFirst({
      where: { slug, ...publicListWhere },
      select: productPublicSelect,
    })
    return p ? mapPublicDetail(p as unknown as ProductRow) : null
  },

  async create(data: CreateInput): Promise<AdminProductDto> {
    const slug = (data.slug?.trim() || slugifyName(data.name, 'urun')).toLowerCase()

    const mediaPayload: { coverImageMediaId?: string | null; downloadMediaId?: string | null } = {}
    if (Object.prototype.hasOwnProperty.call(data, 'coverImageMediaId')) {
      mediaPayload.coverImageMediaId = data.coverImageMediaId ?? null
    }
    if (Object.prototype.hasOwnProperty.call(data, 'downloadMediaId')) {
      mediaPayload.downloadMediaId = data.downloadMediaId ?? null
    }
    const mediaPatch =
      Object.keys(mediaPayload).length > 0 ? await resolveMediaIds(mediaPayload) : {}

    let coverImage: string | null = null
    if (mediaPatch.coverImage !== undefined) coverImage = mediaPatch.coverImage
    else if (data.coverImage !== undefined) {
      const c = sanitizeImageUrl(data.coverImage ?? '')
      coverImage = c && c !== '' ? c : null
    }

    let downloadUrl: string | null = null
    if (mediaPatch.downloadUrl !== undefined) downloadUrl = mediaPatch.downloadUrl
    else if (data.downloadUrl !== undefined) downloadUrl = normalizeUrl(data.downloadUrl)

    const row = await prisma.product.create({
      data: {
        name: data.name.trim(),
        slug,
        productType: parseProductType(data.productType),
        shortDescription: (data.shortDescription ?? '').trim(),
        description: (data.description ?? '').trim(),
        price: new Prisma.Decimal(data.price),
        compareAtPrice:
          data.compareAtPrice === null || data.compareAtPrice === undefined
            ? null
            : new Prisma.Decimal(data.compareAtPrice),
        currency: (data.currency ?? 'TRY').trim() || 'TRY',
        isActive: data.isActive !== false,
        isFeatured: data.isFeatured === true,
        sortOrder: typeof data.sortOrder === 'number' && Number.isFinite(data.sortOrder) ? data.sortOrder : 0,
        version: data.version?.trim() || null,
        coverImage,
        downloadUrl,
        categoryId: data.categoryId ?? null,
        seoTitle: data.seoTitle?.trim() || null,
        seoDescription: data.seoDescription?.trim() || null,
        coverImageMediaId: mediaPatch.coverImageMediaId ?? null,
        downloadMediaId: mediaPatch.downloadMediaId ?? null,
      },
      include: productInclude,
    })
    if (Object.prototype.hasOwnProperty.call(data, 'galleryMediaIds')) {
      await syncProductGallery(row.id, data.galleryMediaIds ?? [])
    }
    const full = await prisma.product.findUniqueOrThrow({
      where: { id: row.id },
      include: productInclude,
    })
    return mapAdmin(full as unknown as ProductRow)
  },

  async update(id: string, data: PatchInput): Promise<AdminProductDto> {
    const patch: Prisma.ProductUpdateInput = {}
    if (data.name !== undefined) patch.name = data.name.trim()
    if (data.slug !== undefined) patch.slug = data.slug.trim().toLowerCase()
    if (data.productType !== undefined) patch.productType = parseProductType(data.productType)
    if (data.shortDescription !== undefined) patch.shortDescription = data.shortDescription.trim()
    if (data.description !== undefined) patch.description = data.description.trim()
    if (data.price !== undefined) patch.price = new Prisma.Decimal(data.price)
    if (data.compareAtPrice !== undefined) {
      patch.compareAtPrice =
        data.compareAtPrice === null ? null : new Prisma.Decimal(data.compareAtPrice)
    }
    if (data.currency !== undefined) patch.currency = data.currency.trim() || 'TRY'
    if (data.isActive !== undefined) patch.isActive = data.isActive
    if (data.isFeatured !== undefined) patch.isFeatured = data.isFeatured
    if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder
    if (data.version !== undefined) patch.version = data.version?.trim() || null
    if (data.categoryId !== undefined) {
      patch.category =
        data.categoryId === null ? { disconnect: true } : { connect: { id: data.categoryId } }
    }
    if (data.seoTitle !== undefined) patch.seoTitle = data.seoTitle?.trim() || null
    if (data.seoDescription !== undefined) patch.seoDescription = data.seoDescription?.trim() || null

    const mediaPayload: { coverImageMediaId?: string | null; downloadMediaId?: string | null } = {}
    if (Object.prototype.hasOwnProperty.call(data, 'coverImageMediaId')) {
      mediaPayload.coverImageMediaId = data.coverImageMediaId ?? null
    }
    if (Object.prototype.hasOwnProperty.call(data, 'downloadMediaId')) {
      mediaPayload.downloadMediaId = data.downloadMediaId ?? null
    }
    if (Object.keys(mediaPayload).length > 0) {
      const mediaPatch = await resolveMediaIds(mediaPayload)
      if (mediaPatch.coverImageMediaId !== undefined) {
        patch.coverImageMedia =
          mediaPatch.coverImageMediaId === null
            ? { disconnect: true }
            : { connect: { id: mediaPatch.coverImageMediaId } }
      }
      if (mediaPatch.coverImage !== undefined) patch.coverImage = mediaPatch.coverImage
      if (mediaPatch.downloadMediaId !== undefined) {
        patch.downloadMedia =
          mediaPatch.downloadMediaId === null
            ? { disconnect: true }
            : { connect: { id: mediaPatch.downloadMediaId } }
      }
      if (mediaPatch.downloadUrl !== undefined) patch.downloadUrl = mediaPatch.downloadUrl
    } else {
      if (data.coverImage !== undefined) {
        const c = sanitizeImageUrl(data.coverImage ?? '')
        patch.coverImage = c && c !== '' ? c : null
      }
      if (data.downloadUrl !== undefined) patch.downloadUrl = normalizeUrl(data.downloadUrl)
    }

    await prisma.product.update({
      where: { id },
      data: patch,
    })
    if (Object.prototype.hasOwnProperty.call(data, 'galleryMediaIds')) {
      await syncProductGallery(id, data.galleryMediaIds ?? [])
    }
    const full = await prisma.product.findUniqueOrThrow({
      where: { id },
      include: productInclude,
    })
    return mapAdmin(full as unknown as ProductRow)
  },

  /** Sepet/checkout: aktif DOWNLOAD ürün özeti (indirme URL dönmez). */
  async cartPreview(productIds: string[]) {
    const ids = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))]
    if (ids.length === 0) return []
    const rows = await prisma.product.findMany({
      where: { id: { in: ids }, isActive: true, productType: ProductType.DOWNLOAD },
      select: {
        id: true,
        name: true,
        slug: true,
        price: true,
        currency: true,
        coverImage: true,
        downloadUrl: true,
        downloadMedia: { select: { url: true } },
      },
    })
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: toNumber(p.price)!,
      currency: p.currency,
      coverImage: p.coverImage,
      hasDownload: !!(p.downloadUrl?.trim() || p.downloadMedia?.url?.trim()),
    }))
  },

  /** Ödeme sonrası uyumluluk için hard delete yok — ürün pasife alınır. */
  async deactivate(id: string): Promise<void> {
    await prisma.product.update({
      where: { id },
      data: { isActive: false },
    })
  },
}

// Geriye dönük: controller slugify import
export { slugifyName } from '../utils/slugify'
