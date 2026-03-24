import type { Request, Response } from 'express'
import * as menu from '../services/menu.service'

export async function getPublicMenu(req: Request, res: Response) {
  try {
    const loc = String(req.params.location || '')
    if (loc !== 'header' && loc !== 'footer') {
      return res.status(400).json({ success: false, message: 'Geçersiz menü' })
    }
    const data = await menu.getPublicMenu(loc)
    res.json({ success: true, data })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: 'Sunucu hatası' })
  }
}

export async function adminListMenus(_req: Request, res: Response) {
  try {
    const data = await menu.adminListMenus()
    res.json({ success: true, data })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: 'Sunucu hatası' })
  }
}

export async function adminGetMenuItems(req: Request, res: Response) {
  try {
    const loc = String(req.params.location || '')
    if (loc !== 'header' && loc !== 'footer') {
      return res.status(400).json({ success: false, message: 'Geçersiz menü' })
    }
    const data = await menu.adminGetMenuItems(loc)
    if (!data) return res.status(404).json({ success: false, message: 'Menü yok' })
    res.json({ success: true, data })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: 'Sunucu hatası' })
  }
}

export async function adminSetMenuItems(req: Request, res: Response) {
  try {
    const loc = String(req.params.location || '')
    if (loc !== 'header' && loc !== 'footer') {
      return res.status(400).json({ success: false, message: 'Geçersiz menü' })
    }
    const { items } = req.body as { items?: unknown }
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'items[] gerekli' })
    }
    const normalized = items.map((row: unknown, i: number) => {
      const r = row as Record<string, unknown>
      return {
        label: String(r.label ?? ''),
        url: r.url != null ? String(r.url) : null,
        pageId: r.pageId != null ? String(r.pageId) : null,
        order: typeof r.order === 'number' ? r.order : i,
      }
    })
    const data = await menu.adminSetMenuItems(loc, normalized)
    res.json({ success: true, data })
  } catch (e) {
    console.error(e)
    res.status(400).json({ success: false, message: 'Kaydedilemedi' })
  }
}
