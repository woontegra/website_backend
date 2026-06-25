import type { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { productCategoriesService } from '../services/productCategories.service'

function validateCatBody(body: Record<string, unknown>, isPatch: boolean): string | null {
  if (!isPatch || body.name !== undefined) {
    const name = String(body.name ?? '').trim()
    if (name.length < 2) return 'Kategori adı en az 2 karakter olmalıdır'
  }
  if (body.slug !== undefined && body.slug !== null && String(body.slug).trim() !== '') {
    const slug = String(body.slug).trim().toLowerCase()
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return 'Slug yalnızca küçük harf, rakam ve tire içerebilir'
  }
  return null
}

export async function adminList(_req: Request, res: Response) {
  try {
    const data = await productCategoriesService.listAdmin()
    res.json({ success: true, data })
  } catch {
    res.status(500).json({ success: false, message: 'Kategoriler yüklenemedi' })
  }
}

export async function adminGetById(req: Request, res: Response) {
  try {
    const row = await productCategoriesService.getAdminById(req.params.id)
    if (!row) return res.status(404).json({ success: false, message: 'Kategori bulunamadı' })
    res.json({ success: true, data: row })
  } catch {
    res.status(500).json({ success: false, message: 'Kategori yüklenemedi' })
  }
}

export async function adminCreate(req: Request, res: Response) {
  const err = validateCatBody(req.body as Record<string, unknown>, false)
  if (err) return res.status(400).json({ success: false, message: err })
  const body = req.body as Record<string, unknown>
  try {
    const row = await productCategoriesService.create({
      name: String(body.name).trim(),
      slug: body.slug !== undefined && body.slug !== null ? String(body.slug).trim() : undefined,
      description: body.description !== undefined ? String(body.description ?? '') : undefined,
      parentId:
        body.parentId === undefined || body.parentId === null || body.parentId === ''
          ? null
          : String(body.parentId),
      isActive: body.isActive !== false,
      sortOrder:
        typeof body.sortOrder === 'number'
          ? body.sortOrder
          : Number.parseInt(String(body.sortOrder ?? '0'), 10) || 0,
    })
    res.status(201).json({ success: true, data: row })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'Bu slug zaten kullanılıyor' })
    }
    res.status(500).json({ success: false, message: 'Kategori oluşturulamadı' })
  }
}

export async function adminPatch(req: Request, res: Response) {
  const err = validateCatBody(req.body as Record<string, unknown>, true)
  if (err) return res.status(400).json({ success: false, message: err })
  const body = req.body as Record<string, unknown>
  try {
    const row = await productCategoriesService.update(req.params.id, {
      name: body.name !== undefined ? String(body.name).trim() : undefined,
      slug: body.slug !== undefined ? String(body.slug ?? '').trim() : undefined,
      description: body.description !== undefined ? String(body.description ?? '') : undefined,
      parentId:
        body.parentId === undefined
          ? undefined
          : body.parentId === null || body.parentId === ''
            ? null
            : String(body.parentId),
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
      sortOrder:
        body.sortOrder !== undefined
          ? typeof body.sortOrder === 'number'
            ? body.sortOrder
            : Number.parseInt(String(body.sortOrder), 10)
          : undefined,
    })
    res.json({ success: true, data: row })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Kategori bulunamadı' })
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'Bu slug zaten kullanılıyor' })
    }
    if (msg.includes('alt kategorisi')) return res.status(400).json({ success: false, message: msg })
    res.status(500).json({ success: false, message: 'Kategori güncellenemedi' })
  }
}

export async function adminDelete(req: Request, res: Response) {
  try {
    const result = await productCategoriesService.deleteOrDeactivate(req.params.id)
    const message = result.hadProducts
      ? 'Kategori pasife alındı (bağlı ürünler vardı).'
      : 'Kategori pasife alındı.'
    res.json({ success: true, message, data: result })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Kategori bulunamadı' })
    }
    res.status(500).json({ success: false, message: 'İşlem başarısız' })
  }
}

export async function publicList(_req: Request, res: Response) {
  try {
    const data = await productCategoriesService.listPublic()
    res.json({ success: true, data })
  } catch {
    res.status(500).json({ success: false, message: 'Kategoriler yüklenemedi' })
  }
}
