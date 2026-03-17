import type { Request, Response } from 'express'
import * as cms from '../services/cms.service'

export async function getPageBySlug(req: Request, res: Response) {
  try {
    const page = await cms.getPublicPageBySlug(req.params.slug)
    if (!page) return res.status(404).json({ success: false, message: 'Sayfa bulunamadı' })
    res.json({ success: true, data: page })
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
    res.json({ success: true, data: page })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: 'Sunucu hatası' })
  }
}

export async function adminCreatePage(req: Request, res: Response) {
  try {
    const { slug, title, isActive } = req.body
    if (!slug || !title) return res.status(400).json({ success: false, message: 'slug ve title gerekli' })
    const page = await cms.createPage({ slug, title, isActive })
    res.status(201).json({ success: true, data: page })
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002'
      ? 'Bu slug zaten kullanılıyor'
      : 'Oluşturulamadı'
    res.status(400).json({ success: false, message: msg })
  }
}

export async function adminUpdatePage(req: Request, res: Response) {
  try {
    const page = await cms.updatePage(req.params.id, req.body)
    res.json({ success: true, data: page })
  } catch {
    res.status(400).json({ success: false, message: 'Güncellenemedi' })
  }
}

export async function adminDeletePage(req: Request, res: Response) {
  try {
    await cms.deletePage(req.params.id)
    res.json({ success: true })
  } catch {
    res.status(400).json({ success: false, message: 'Silinemedi' })
  }
}

export async function adminCreateSection(req: Request, res: Response) {
  try {
    const { pageId, type, title, content, order, isActive } = req.body
    if (!pageId || !type) return res.status(400).json({ success: false, message: 'pageId ve type gerekli' })
    const section = await cms.createSection({ pageId, type, title, content, order, isActive })
    res.status(201).json({ success: true, data: section })
  } catch (e) {
    console.error(e)
    res.status(400).json({ success: false, message: 'Section oluşturulamadı' })
  }
}

export async function adminUpdateSection(req: Request, res: Response) {
  try {
    const section = await cms.updateSection(req.params.id, req.body)
    res.json({ success: true, data: section })
  } catch {
    res.status(400).json({ success: false, message: 'Güncellenemedi' })
  }
}

export async function adminDeleteSection(req: Request, res: Response) {
  try {
    await cms.deleteSection(req.params.id)
    res.json({ success: true })
  } catch {
    res.status(400).json({ success: false, message: 'Silinemedi' })
  }
}

export async function adminReorderSections(req: Request, res: Response) {
  try {
    const { pageId, orderedIds } = req.body
    if (!pageId || !Array.isArray(orderedIds)) return res.status(400).json({ success: false, message: 'pageId ve orderedIds gerekli' })
    await cms.reorderSections(pageId, orderedIds)
    res.json({ success: true })
  } catch {
    res.status(400).json({ success: false, message: 'Sıralama başarısız' })
  }
}

export async function adminCreateItem(req: Request, res: Response) {
  try {
    const { sectionId, title, description, icon, image, extraData, order, isActive } = req.body
    if (!sectionId) return res.status(400).json({ success: false, message: 'sectionId gerekli' })
    const item = await cms.createSectionItem({ sectionId, title, description, icon, image, extraData, order, isActive })
    res.status(201).json({ success: true, data: item })
  } catch (e) {
    console.error(e)
    res.status(400).json({ success: false, message: 'Öğe oluşturulamadı' })
  }
}

export async function adminUpdateItem(req: Request, res: Response) {
  try {
    const item = await cms.updateSectionItem(req.params.id, req.body)
    res.json({ success: true, data: item })
  } catch {
    res.status(400).json({ success: false, message: 'Güncellenemedi' })
  }
}

export async function adminDeleteItem(req: Request, res: Response) {
  try {
    await cms.deleteSectionItem(req.params.id)
    res.json({ success: true })
  } catch {
    res.status(400).json({ success: false, message: 'Silinemedi' })
  }
}

export async function adminReorderItems(req: Request, res: Response) {
  try {
    const { sectionId, orderedIds } = req.body
    if (!sectionId || !Array.isArray(orderedIds)) return res.status(400).json({ success: false, message: 'sectionId ve orderedIds gerekli' })
    await cms.reorderSectionItems(sectionId, orderedIds)
    res.json({ success: true })
  } catch {
    res.status(400).json({ success: false, message: 'Sıralama başarısız' })
  }
}

export async function adminCreateFaq(req: Request, res: Response) {
  try {
    const { pageId, question, answer, order } = req.body
    if (!pageId || !question || !answer) return res.status(400).json({ success: false, message: 'pageId, question, answer gerekli' })
    const faq = await cms.createFaq({ pageId, question, answer, order })
    res.status(201).json({ success: true, data: faq })
  } catch {
    res.status(400).json({ success: false, message: 'FAQ oluşturulamadı' })
  }
}

export async function adminUpdateFaq(req: Request, res: Response) {
  try {
    const faq = await cms.updateFaq(req.params.id, req.body)
    res.json({ success: true, data: faq })
  } catch {
    res.status(400).json({ success: false, message: 'Güncellenemedi' })
  }
}

export async function adminDeleteFaq(req: Request, res: Response) {
  try {
    await cms.deleteFaq(req.params.id)
    res.json({ success: true })
  } catch {
    res.status(400).json({ success: false, message: 'Silinemedi' })
  }
}

export async function adminReorderFaqs(req: Request, res: Response) {
  try {
    const { pageId, orderedIds } = req.body
    if (!pageId || !Array.isArray(orderedIds)) return res.status(400).json({ success: false, message: 'pageId ve orderedIds gerekli' })
    await cms.reorderFaqs(pageId, orderedIds)
    res.json({ success: true })
  } catch {
    res.status(400).json({ success: false, message: 'Sıralama başarısız' })
  }
}
