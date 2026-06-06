import { Request, Response } from 'express'
import { downloadsService, PRODUCT_KEY } from '../services/downloads.service'

export async function getSifreKasasiStats(_req: Request, res: Response) {
  try {
    const data = await downloadsService.getStats(PRODUCT_KEY)
    res.json({ success: true, data })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: 'İndirme istatistikleri yüklenemedi' })
  }
}

export async function downloadSifreKasasiSetup(_req: Request, res: Response) {
  try {
    await downloadsService.incrementDownload(PRODUCT_KEY, 'setup')
    res.redirect(302, downloadsService.getRedirectUrl('setup'))
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: 'İndirme başlatılamadı' })
  }
}

export async function downloadSifreKasasiPortable(_req: Request, res: Response) {
  try {
    await downloadsService.incrementDownload(PRODUCT_KEY, 'portable')
    res.redirect(302, downloadsService.getRedirectUrl('portable'))
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: 'İndirme başlatılamadı' })
  }
}
