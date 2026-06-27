import { Request, Response } from 'express'
import { Prisma, ProductType } from '@prisma/client'
import { productsService, slugifyName, type AdminProductListQuery } from '../services/products.service'

function parsePrice(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v).replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

function parseListQuery(req: Request): AdminProductListQuery {
  const q: AdminProductListQuery = {}
  const search = typeof req.query.search === 'string' ? req.query.search : undefined
  if (search) q.search = search
  const isActive = req.query.isActive
  if (isActive === 'true' || isActive === 'false' || isActive === 'all') q.isActive = isActive
  const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined
  if (categoryId) q.categoryId = categoryId
  const pt = req.query.productType
  if (pt === 'DOWNLOAD' || pt === 'SAAS' || pt === 'SERVICE') q.productType = pt as ProductType
  return q
}

function validateCreateBody(body: Record<string, unknown>): string | null {
  const name = String(body.name ?? '').trim()
  if (name.length < 2) return 'Ürün adı en az 2 karakter olmalıdır'

  const price = parsePrice(body.price)
  if (price === null) return 'Geçerli bir fiyat girin'

  if (body.compareAtPrice !== null && body.compareAtPrice !== undefined && body.compareAtPrice !== '') {
    const compare = parsePrice(body.compareAtPrice)
    if (compare === null) return 'Geçersiz eski fiyat'
    if (compare !== null && compare < price) return 'Eski fiyat, satış fiyatından küçük olamaz'
  }

  const slug = body.slug !== undefined && body.slug !== null ? String(body.slug).trim() : ''
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return 'Slug yalnızca küçük harf, rakam ve tire içerebilir'

  const downloadUrl = body.downloadUrl !== undefined ? String(body.downloadUrl ?? '').trim() : ''
  if (downloadUrl && !/^https?:\/\//i.test(downloadUrl) && !downloadUrl.startsWith('/')) {
    return 'İndirme linki http(s) veya / ile başlayan bir yol olmalıdır'
  }

  const cover = body.coverImage !== undefined ? String(body.coverImage ?? '').trim() : ''
  if (cover && cover.length > 2000) return 'Kapak görseli URL çok uzun'

  if (Object.prototype.hasOwnProperty.call(body, 'galleryMediaIds')) {
    const v = body.galleryMediaIds
    if (v !== null && !Array.isArray(v)) return 'galleryMediaIds dizi olmalıdır'
  }

  return null
}

function validatePatchBody(body: Record<string, unknown>): string | null {
  if (body.name !== undefined) {
    const name = String(body.name ?? '').trim()
    if (name.length < 2) return 'Ürün adı en az 2 karakter olmalıdır'
  }
  if (body.price !== undefined) {
    const price = parsePrice(body.price)
    if (price === null) return 'Geçerli bir fiyat girin'
  }
  if (body.compareAtPrice !== undefined && body.compareAtPrice !== null && body.compareAtPrice !== '') {
    const c = parsePrice(body.compareAtPrice)
    if (c === null) return 'Geçersiz eski fiyat'
  }
  if (body.slug !== undefined && body.slug !== null && String(body.slug).trim() !== '') {
    const slug = String(body.slug).trim()
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return 'Slug yalnızca küçük harf, rakam ve tire içerebilir'
  }
  if (body.downloadUrl !== undefined) {
    const d = String(body.downloadUrl ?? '').trim()
    if (d && !/^https?:\/\//i.test(d) && !d.startsWith('/')) {
      return 'İndirme linki http(s) veya / ile başlayan bir yol olmalıdır'
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, 'galleryMediaIds')) {
    const v = body.galleryMediaIds
    if (v !== null && !Array.isArray(v)) return 'galleryMediaIds dizi olmalıdır'
  }
  return null
}

export async function adminList(req: Request, res: Response) {
  try {
    const data = await productsService.listAdmin(parseListQuery(req))
    res.json({ success: true, data })
  } catch {
    res.status(500).json({ success: false, message: 'Ürünler yüklenemedi' })
  }
}

export async function adminGetById(req: Request, res: Response) {
  try {
    const row = await productsService.getAdminById(req.params.id)
    if (!row) return res.status(404).json({ success: false, message: 'Ürün bulunamadı' })
    res.json({ success: true, data: row })
  } catch {
    res.status(500).json({ success: false, message: 'Ürün yüklenemedi' })
  }
}

export async function adminCreate(req: Request, res: Response) {
  const err = validateCreateBody(req.body as Record<string, unknown>)
  if (err) return res.status(400).json({ success: false, message: err })

  const body = req.body as Record<string, unknown>
  const name = String(body.name).trim()
  const slugRaw = body.slug !== undefined && body.slug !== null ? String(body.slug).trim() : ''
  const slug = slugRaw || slugifyName(name, 'urun')

  try {
    const row = await productsService.create({
      name,
      slug,
      productType: body.productType as never,
      shortDescription: String(body.shortDescription ?? ''),
      description: String(body.description ?? ''),
      price: parsePrice(body.price)!,
      compareAtPrice:
        body.compareAtPrice === null || body.compareAtPrice === ''
          ? null
          : parsePrice(body.compareAtPrice),
      currency: String(body.currency ?? 'TRY'),
      isActive: body.isActive !== false,
      purchaseEnabled: body.purchaseEnabled !== false,
      licenseMonths: (() => {
        const raw = body.licenseMonths
        const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? '12'), 10)
        return Number.isFinite(n) && n > 0 ? Math.min(120, Math.floor(n)) : 12
      })(),
      licenseRequired: body.licenseRequired === true,
      licenseAppCode:
        body.licenseRequired === true && body.licenseAppCode
          ? String(body.licenseAppCode).trim()
          : null,
      licenseDays:
        body.licenseRequired === true
          ? (() => {
              const raw = body.licenseDays
              const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? '365'), 10)
              return Number.isFinite(n) && n > 0 ? Math.min(3650, Math.floor(n)) : 365
            })()
          : null,
      licenseMaxDevices:
        body.licenseRequired === true
          ? (() => {
              const raw = body.licenseMaxDevices
              const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? '1'), 10)
              return Number.isFinite(n) && n > 0 ? Math.min(50, Math.floor(n)) : 1
            })()
          : null,
      featureBullets: String(body.featureBullets ?? ''),
      isFeatured: body.isFeatured === true,
      sortOrder: (() => {
        const s =
          typeof body.sortOrder === 'number' ? body.sortOrder : Number.parseInt(String(body.sortOrder ?? '0'), 10)
        return Number.isFinite(s) ? s : 0
      })(),
      version: body.version !== undefined ? String(body.version ?? '') : undefined,
      coverImage: body.coverImage !== undefined ? String(body.coverImage ?? '') : undefined,
      downloadUrl: body.downloadUrl !== undefined ? String(body.downloadUrl ?? '') : undefined,
      categoryId: body.categoryId !== undefined ? (body.categoryId === '' ? null : String(body.categoryId)) : undefined,
      seoTitle: body.seoTitle !== undefined ? String(body.seoTitle ?? '') : undefined,
      seoDescription: body.seoDescription !== undefined ? String(body.seoDescription ?? '') : undefined,
      coverImageMediaId:
        body.coverImageMediaId !== undefined
          ? body.coverImageMediaId === null || body.coverImageMediaId === ''
            ? null
            : String(body.coverImageMediaId)
          : undefined,
      downloadMediaId:
        body.downloadMediaId !== undefined
          ? body.downloadMediaId === null || body.downloadMediaId === ''
            ? null
            : String(body.downloadMediaId)
          : undefined,
      ...(Object.prototype.hasOwnProperty.call(body, 'galleryMediaIds')
        ? {
            galleryMediaIds:
              body.galleryMediaIds === null
                ? []
                : (body.galleryMediaIds as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean),
          }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(body, 'downloadFiles') ? { downloadFiles: body.downloadFiles } : {}),
    })
    res.status(201).json({ success: true, data: row })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ürün oluşturulamadı'
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'Bu slug zaten kullanılıyor' })
    }
    if (
      msg.includes('medya') ||
      msg.includes('Kapak') ||
      msg.includes('İndirme') ||
      msg.includes('İndirilebilir') ||
      msg.includes('Dijital') ||
      msg.includes('Galeri') ||
      msg.includes('Lisans') ||
      msg.includes('Merkezi') ||
      msg.includes('zorunludur') ||
      msg.includes('R2 indirme')
    ) {
      return res.status(400).json({ success: false, message: msg })
    }
    res.status(500).json({ success: false, message: 'Ürün oluşturulamadı' })
  }
}

export async function adminPatch(req: Request, res: Response) {
  const err = validatePatchBody(req.body as Record<string, unknown>)
  if (err) return res.status(400).json({ success: false, message: err })

  const body = req.body as Record<string, unknown>
  const patch: Parameters<typeof productsService.update>[1] = {}

  if (body.name !== undefined) patch.name = String(body.name).trim()
  if (body.slug !== undefined) patch.slug = String(body.slug ?? '').trim()
  if (body.productType !== undefined) patch.productType = body.productType as never
  if (body.shortDescription !== undefined) patch.shortDescription = String(body.shortDescription ?? '')
  if (body.description !== undefined) patch.description = String(body.description ?? '')
  if (body.price !== undefined) {
    const p = parsePrice(body.price)
    if (p !== null) patch.price = p
  }
  if (body.compareAtPrice !== undefined) {
    patch.compareAtPrice =
      body.compareAtPrice === null || body.compareAtPrice === ''
        ? null
        : parsePrice(body.compareAtPrice)
  }
  if (body.currency !== undefined) patch.currency = String(body.currency ?? 'TRY')
  if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive)
  if (body.purchaseEnabled !== undefined) patch.purchaseEnabled = Boolean(body.purchaseEnabled)
  if (body.licenseMonths !== undefined) {
    const raw = body.licenseMonths
    const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
    patch.licenseMonths = Number.isFinite(n) && n > 0 ? Math.min(120, Math.floor(n)) : 12
  }
  if (body.licenseRequired !== undefined) patch.licenseRequired = body.licenseRequired === true
  if (body.licenseAppCode !== undefined) {
    patch.licenseAppCode =
      body.licenseAppCode === null || body.licenseAppCode === '' ? null : String(body.licenseAppCode).trim()
  }
  if (body.licenseDays !== undefined) {
    if (body.licenseDays === null || body.licenseDays === '') patch.licenseDays = null
    else {
      const n = typeof body.licenseDays === 'number' ? body.licenseDays : Number.parseInt(String(body.licenseDays), 10)
      patch.licenseDays = Number.isFinite(n) && n > 0 ? Math.min(3650, Math.floor(n)) : 365
    }
  }
  if (body.licenseMaxDevices !== undefined) {
    if (body.licenseMaxDevices === null || body.licenseMaxDevices === '') patch.licenseMaxDevices = null
    else {
      const n =
        typeof body.licenseMaxDevices === 'number'
          ? body.licenseMaxDevices
          : Number.parseInt(String(body.licenseMaxDevices), 10)
      patch.licenseMaxDevices = Number.isFinite(n) && n > 0 ? Math.min(50, Math.floor(n)) : 1
    }
  }
  if (body.featureBullets !== undefined) patch.featureBullets = String(body.featureBullets ?? '')
  if (body.isFeatured !== undefined) patch.isFeatured = Boolean(body.isFeatured)
  if (body.sortOrder !== undefined) {
    const s = typeof body.sortOrder === 'number' ? body.sortOrder : Number.parseInt(String(body.sortOrder), 10)
    if (Number.isFinite(s)) patch.sortOrder = s
  }
  if (body.version !== undefined) patch.version = String(body.version ?? '')
  if (body.coverImage !== undefined) patch.coverImage = String(body.coverImage ?? '')
  if (body.downloadUrl !== undefined) patch.downloadUrl = String(body.downloadUrl ?? '')
  if (body.categoryId !== undefined) {
    patch.categoryId = body.categoryId === null || body.categoryId === '' ? null : String(body.categoryId)
  }
  if (body.seoTitle !== undefined) patch.seoTitle = String(body.seoTitle ?? '')
  if (body.seoDescription !== undefined) patch.seoDescription = String(body.seoDescription ?? '')
  if (body.coverImageMediaId !== undefined) {
    patch.coverImageMediaId =
      body.coverImageMediaId === null || body.coverImageMediaId === ''
        ? null
        : String(body.coverImageMediaId)
  }
  if (body.downloadMediaId !== undefined) {
    patch.downloadMediaId =
      body.downloadMediaId === null || body.downloadMediaId === '' ? null : String(body.downloadMediaId)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'galleryMediaIds')) {
    patch.galleryMediaIds =
      body.galleryMediaIds === null
        ? []
        : (body.galleryMediaIds as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'downloadFiles')) {
    patch.downloadFiles = body.downloadFiles
  }

  try {
    const row = await productsService.update(req.params.id, patch)
    res.json({ success: true, data: row })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ürün güncellenemedi'
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Ürün bulunamadı' })
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'Bu slug zaten kullanılıyor' })
    }
    if (
      msg.includes('medya') ||
      msg.includes('Kapak') ||
      msg.includes('İndirme') ||
      msg.includes('İndirilebilir') ||
      msg.includes('Dijital') ||
      msg.includes('Galeri') ||
      msg.includes('Lisans') ||
      msg.includes('Merkezi') ||
      msg.includes('zorunludur') ||
      msg.includes('R2 indirme')
    ) {
      return res.status(400).json({ success: false, message: msg })
    }
    res.status(500).json({ success: false, message: 'Ürün güncellenemedi' })
  }
}

export async function adminDelete(req: Request, res: Response) {
  try {
    await productsService.deactivate(req.params.id)
    res.json({ success: true, message: 'Ürün pasife alındı' })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Ürün bulunamadı' })
    }
    res.status(500).json({ success: false, message: 'İşlem başarısız' })
  }
}

export async function publicList(_req: Request, res: Response) {
  try {
    const data = await productsService.listPublic()
    res.json({ success: true, data })
  } catch {
    res.status(500).json({ success: false, message: 'Ürünler yüklenemedi' })
  }
}

export async function publicGetBySlug(req: Request, res: Response) {
  try {
    const row = await productsService.getPublicBySlug(req.params.slug)
    if (!row) return res.status(404).json({ success: false, message: 'Ürün bulunamadı' })
    res.json({ success: true, data: row })
  } catch {
    res.status(500).json({ success: false, message: 'Ürün yüklenemedi' })
  }
}

export async function publicListByCategorySlug(req: Request, res: Response) {
  try {
    const slug = req.params.slug
    const data = await productsService.listPublicByCategorySlug(slug)
    res.json({ success: true, data })
  } catch {
    res.status(500).json({ success: false, message: 'Ürünler yüklenemedi' })
  }
}

export async function publicCartPreview(req: Request, res: Response) {
  try {
    const body = req.body as { productIds?: unknown }
    const ids = Array.isArray(body.productIds) ? body.productIds.map((x) => String(x ?? '').trim()).filter(Boolean) : []
    if (ids.length === 0) {
      return res.status(400).json({ success: false, message: 'productIds dizi olmalıdır' })
    }
    const data = await productsService.cartPreview(ids)
    res.json({ success: true, data })
  } catch {
    res.status(500).json({ success: false, message: 'Ürünler yüklenemedi' })
  }
}
