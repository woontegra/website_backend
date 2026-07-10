import { Request, Response } from 'express'
import { downloadsService } from '../services/downloads.service'

export async function adminListDownloadStats(_req: Request, res: Response) {
  try {
    const data = await downloadsService.listAdminDownloadStats()
    res.json({ success: true, data })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: 'İndirme istatistikleri yüklenemedi' })
  }
}
