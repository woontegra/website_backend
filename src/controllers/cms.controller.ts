import type { Request, Response } from 'express'
import * as cms from '../services/cms.service'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isPageId(param: string) {
  return UUID_RE.test(param)
}

export async function getPageBySlug(req: Request, res: Response) {
  try {
    const payload = await cms.resolvePublicPage(req.params.slug)
    if (!payload) return res.status(404).json({ success: false, message: 'Sayfa bulunamadı' })
    res.json({ success: true, data: payload })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: 'Sunucu hatası' })
  }
}

export async function adminListPages(_req: Request, res: Response) {
  try {
    const pages = await cms.listPagesAdmin()
    res.json({ success: true, data: pages })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: 'Veritabanı kullanılamıyor. DATABASE_URL ayarlayın.' })
  }
}

export async function adminGetPage(req: Request, res: Response) {
  try {
    const page = await cms.getPageAdmin(req.params.id)
    if (!page) return res.status(404).json({ success: false, message: 'Sayfa yok' })
    res.json({
      success: true,
      data: {
        ...page,
        content: page.content ?? '',
      },
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: 'Sunucu hatası' })
  }
}

/** POST /api/pages — admin */
export async function adminCreatePage(req: Request, res: Response) {
  try {
    const { slug, title, content, status } = req.body
    if (!slug || !title) return res.status(400).json({ success: false, message: 'slug ve title gerekli' })
    const page = await cms.createPage({
      slug,
      title,
      content: typeof content === 'string' ? content : '',
      status,
    })
    res.status(201).json({ success: true, data: page })
  } catch (e: unknown) {
    const msg =
      e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002'
        ? 'Bu slug zaten kullanılıyor'
        : 'Oluşturulamadı'
    res.status(400).json({ success: false, message: msg })
  }
}

/** PUT /api/pages/:id veya /api/admin/cms/pages/:id — admin */
export async function adminUpdatePage(req: Request, res: Response) {
  try {
    const id = req.params.id
    if (!isPageId(id)) return res.status(400).json({ success: false, message: 'Geçersiz sayfa id' })
    const { slug, title, content, status } = req.body
    const page = await cms.updatePage(id, {
      slug,
      title,
      content,
      status,
    })
    res.json({ success: true, data: page })
  } catch {
    res.status(400).json({ success: false, message: 'Güncellenemedi' })
  }
}

export async function adminDeletePage(req: Request, res: Response) {
  try {
    if (!isPageId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Geçersiz sayfa id' })
    }
    await cms.deletePage(req.params.id)
    res.json({ success: true })
  } catch {
    res.status(400).json({ success: false, message: 'Silinemedi' })
  }
}
