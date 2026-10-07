import type { Request, Response } from 'express'
import { streamBhDesktopTrialDownload } from '../services/bhDesktopTrialDownload.service'

export async function getBhDesktopTrialDownload(req: Request, res: Response) {
  const token = String(req.params.token ?? '').trim()
  if (!token) {
    return res.status(404).json({ success: false, message: 'İndirme bağlantısı geçersiz' })
  }
  try {
    await streamBhDesktopTrialDownload(token, req, res)
  } catch (error) {
    if (res.headersSent) return
    const message = error instanceof Error ? error.message : ''
    if (message === 'NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Kurulum dosyası bulunamadı' })
    }
    return res.status(500).json({ success: false, message: 'Dosya indirilemedi. Lütfen tekrar deneyin.' })
  }
}
