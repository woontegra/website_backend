import type { Request, Response } from 'express'
import { persistSiteAsset, type SiteAssetKind } from '../services/siteAsset.service'

function parseKind(value: unknown): SiteAssetKind {
  if (value === 'logo' || value === 'favicon' || value === 'general') return value
  return 'general'
}

export async function adminUploadSiteAsset(req: Request, res: Response) {
  try {
    const file = req.file
    if (!file) {
      return res.status(400).json({ success: false, message: 'Dosya seçilmedi' })
    }

    const kind = parseKind(req.body?.kind)
    const result = await persistSiteAsset(file, kind)

    return res.json({
      success: true,
      path: result.path,
      storage: result.storage,
      message:
        result.storage === 'frontend-public'
          ? 'Dosya frontend/public klasörüne kaydedildi.'
          : 'Dosya sunucuya yüklendi. Kalıcı olması için deploy sonrası kontrol edin.',
    })
  } catch (error) {
    console.error(error)
    const message = error instanceof Error ? error.message : 'Yükleme başarısız'
    return res.status(500).json({ success: false, message })
  }
}
