import type { Request, Response } from 'express'
import * as media from '../services/media.service'
import { MediaUploadDisabledError } from '../services/media.service'

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
])

export async function adminListMedia(_req: Request, res: Response) {
  try {
    const data = await media.listMediaAssets()
    res.json({ success: true, data })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: 'Medya listelenemedi' })
  }
}

export async function adminMediaStorageStatus(_req: Request, res: Response) {
  res.json({ success: true, data: media.getMediaStorageInfo() })
}

export async function adminUploadMedia(req: Request, res: Response) {
  try {
    const file = req.file
    if (!file) return res.status(400).json({ success: false, message: 'Dosya yok' })
    if (file.mimetype && !ALLOWED_MIME.has(file.mimetype)) {
      return res.status(400).json({ success: false, message: 'Desteklenmeyen dosya türü' })
    }

    await media.persistUploadedImage(file)
  } catch (e) {
    if (e instanceof MediaUploadDisabledError) {
      return res.status(503).json({
        success: false,
        code: e.code,
        message: e.message,
      })
    }
    console.error(e)
    const message = e instanceof Error ? e.message : 'Yükleme başarısız'
    res.status(500).json({ success: false, message })
  }
}

export async function adminDeleteMedia(req: Request, res: Response) {
  try {
    const row = await media.deleteMediaAsset(req.params.id)
    if (!row) return res.status(404).json({ success: false, message: 'Bulunamadı' })
    res.json({ success: true })
  } catch {
    res.status(400).json({ success: false, message: 'Silinemedi' })
  }
}
