import type { Request, Response } from 'express'
import { CatalogMediaFileType } from '@prisma/client'
import { catalogMediaService } from '../services/catalogMedia.service'

function parseFileType(q: unknown): CatalogMediaFileType | undefined {
  if (q === 'IMAGE' || q === 'DOWNLOAD' || q === 'DOCUMENT') return q
  return undefined
}

export async function adminList(req: Request, res: Response) {
  try {
    const fileType = parseFileType(req.query.fileType)
    const data = await catalogMediaService.listAdmin(fileType)
    res.json({ success: true, data })
  } catch {
    res.status(500).json({ success: false, message: 'Medya listesi yüklenemedi' })
  }
}

export async function adminUpload(req: Request, res: Response) {
  try {
    const file = req.file
    if (!file) return res.status(400).json({ success: false, message: 'Dosya seçilmedi' })
    const data = await catalogMediaService.persistUpload(file)
    res.status(201).json({ success: true, data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Yükleme başarısız'
    res.status(500).json({ success: false, message: msg })
  }
}

export async function adminDelete(req: Request, res: Response) {
  try {
    const row = await catalogMediaService.deleteAdmin(req.params.id)
    if (!row) return res.status(404).json({ success: false, message: 'Dosya bulunamadı' })
    res.json({ success: true, data: row })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Silinemedi'
    const code = msg.includes('kullanılıyor') ? 409 : 500
    res.status(code).json({ success: false, message: msg })
  }
}
