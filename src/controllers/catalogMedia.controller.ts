import type { Request, Response } from 'express'
import { CatalogMediaFileType } from '@prisma/client'
import { getVercelBlobConfigStatus } from '../lib/vercelBlob.client'
import { catalogMediaService } from '../services/catalogMedia.service'
import { isVercelBlobUrl } from '../services/vercelBlobUpload.service'

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
    const folder = typeof req.query.folder === 'string' ? req.query.folder : undefined
    const data = await catalogMediaService.persistUpload(file, { folder })
    const blobConfigured = getVercelBlobConfigStatus().configured
    const storage =
      data.bucket === 'vercel-blob'
        ? 'vercel-blob'
        : data.storageProvider === 'R2'
          ? 'r2'
          : 'local-disk'
    console.info('[catalogMedia] admin upload ok', {
      fileType: data.fileType,
      folder: folder ?? 'general',
      storage,
      blobConfigured,
      isBlobUrl: isVercelBlobUrl(data.url),
    })
    res.status(201).json({ success: true, data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Yükleme başarısız'
    const status = msg.includes('BLOB_READ_WRITE_TOKEN') ? 503 : 500
    res.status(status).json({ success: false, message: msg })
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
