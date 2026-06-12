import type { Request, Response } from 'express'
import { navigationMenuService, type CreateNav } from '../services/navigationMenu.service'

function validateNav(body: Record<string, unknown>, isPatch: boolean): string | null {
  if (!isPatch || body.label !== undefined) {
    const label = String(body.label ?? '').trim()
    if (label.length < 1) return 'Etiket gerekli'
  }
  return null
}

function bodyToCreateNav(body: Record<string, unknown>): CreateNav {
  return {
    label: String(body.label ?? '').trim(),
    type: (body.type as CreateNav['type']) ?? 'CUSTOM_URL',
    url: body.url !== undefined ? (body.url === null || body.url === '' ? null : String(body.url)) : null,
    productId:
      body.productId === undefined || body.productId === null || body.productId === ''
        ? null
        : String(body.productId),
    categoryId:
      body.categoryId === undefined || body.categoryId === null || body.categoryId === ''
        ? null
        : String(body.categoryId),
    pageId:
      body.pageId === undefined || body.pageId === null || body.pageId === '' ? null : String(body.pageId),
    parentId:
      body.parentId === undefined || body.parentId === null || body.parentId === ''
        ? null
        : String(body.parentId),
    sortOrder:
      typeof body.sortOrder === 'number'
        ? body.sortOrder
        : Number.parseInt(String(body.sortOrder ?? '0'), 10) || 0,
    isActive: body.isActive !== false,
    openInNewTab: body.openInNewTab === true,
  }
}

export async function adminList(_req: Request, res: Response) {
  try {
    const data = await navigationMenuService.listAdminFlat()
    res.json({ success: true, data })
  } catch {
    res.status(500).json({ success: false, message: 'Menü yüklenemedi' })
  }
}

export async function adminGetById(req: Request, res: Response) {
  try {
    const row = await navigationMenuService.getAdminById(req.params.id)
    if (!row) return res.status(404).json({ success: false, message: 'Kayıt bulunamadı' })
    res.json({ success: true, data: row })
  } catch {
    res.status(500).json({ success: false, message: 'Menü yüklenemedi' })
  }
}

export async function adminCreate(req: Request, res: Response) {
  const err = validateNav(req.body as Record<string, unknown>, false)
  if (err) return res.status(400).json({ success: false, message: err })
  const body = req.body as Record<string, unknown>
  try {
    const row = await navigationMenuService.create(bodyToCreateNav(body))
    res.status(201).json({ success: true, data: row })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Kayıt oluşturulamadı'
    if (
      msg.includes('zorunlu') ||
      msg.includes('Geçerli') ||
      msg.includes('bulunamadı') ||
      msg.includes('Adres') ||
      msg.includes('http')
    ) {
      return res.status(400).json({ success: false, message: msg })
    }
    if (msg.includes('alt öğesi')) return res.status(400).json({ success: false, message: msg })
    res.status(500).json({ success: false, message: 'Kayıt oluşturulamadı' })
  }
}

export async function adminPatch(req: Request, res: Response) {
  const err = validateNav(req.body as Record<string, unknown>, true)
  if (err) return res.status(400).json({ success: false, message: err })
  const body = req.body as Record<string, unknown>
  try {
    const patch: Partial<CreateNav> = {}
    if (body.label !== undefined) patch.label = String(body.label).trim()
    if (body.type !== undefined) patch.type = body.type as CreateNav['type']
    if (body.url !== undefined) patch.url = body.url === null || body.url === '' ? null : String(body.url)
    if (body.productId !== undefined) {
      patch.productId =
        body.productId === null || body.productId === '' ? null : String(body.productId)
    }
    if (body.categoryId !== undefined) {
      patch.categoryId =
        body.categoryId === null || body.categoryId === '' ? null : String(body.categoryId)
    }
    if (body.pageId !== undefined) {
      patch.pageId = body.pageId === null || body.pageId === '' ? null : String(body.pageId)
    }
    if (body.parentId !== undefined) {
      patch.parentId =
        body.parentId === null || body.parentId === '' ? null : String(body.parentId)
    }
    if (body.sortOrder !== undefined) {
      patch.sortOrder =
        typeof body.sortOrder === 'number'
          ? body.sortOrder
          : Number.parseInt(String(body.sortOrder), 10)
    }
    if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive)
    if (body.openInNewTab !== undefined) patch.openInNewTab = Boolean(body.openInNewTab)

    const row = await navigationMenuService.update(req.params.id, patch)
    res.json({ success: true, data: row })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Kayıt güncellenemedi'
    if (msg === 'Kayıt bulunamadı') return res.status(404).json({ success: false, message: msg })
    if (
      msg.includes('zorunlu') ||
      msg.includes('Geçerli') ||
      msg.includes('bulunamadı') ||
      msg.includes('Adres') ||
      msg.includes('http')
    ) {
      return res.status(400).json({ success: false, message: msg })
    }
    if (msg.includes('alt öğesi')) return res.status(400).json({ success: false, message: msg })
    res.status(500).json({ success: false, message: 'Kayıt güncellenemedi' })
  }
}

export async function adminDelete(req: Request, res: Response) {
  try {
    await navigationMenuService.delete(req.params.id)
    res.json({ success: true, message: 'Silindi' })
  } catch {
    res.status(500).json({ success: false, message: 'Silinemedi' })
  }
}

export async function publicList(_req: Request, res: Response) {
  try {
    const data = await navigationMenuService.listPublic()
    res.json({ success: true, data })
  } catch {
    res.status(500).json({ success: false, message: 'Menü yüklenemedi' })
  }
}
