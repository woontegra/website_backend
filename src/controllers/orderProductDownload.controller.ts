import { Request, Response } from 'express'
import {
  classifyOrderDownloadAccess,
  headOrderProductDownload,
  streamOrderProductDownload,
} from '../services/orderProductDownload.service'

export async function headOrderDownload(req: Request, res: Response) {
  const token = String(req.params.token ?? '').trim()
  if (!token) return res.status(404).end()

  try {
    const meta = await headOrderProductDownload(token)
    if (!meta) {
      const access = await classifyOrderDownloadAccess(token)
      return res.status(access.kind === 'forbidden' ? 403 : 404).end()
    }
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${meta.filename}"`)
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.setHeader('Content-Length', String(meta.size))
    return res.status(200).end()
  } catch {
    return res.status(500).end()
  }
}

export async function getOrderDownload(req: Request, res: Response) {
  const token = String(req.params.token ?? '').trim()
  if (!token) {
    return res.status(404).json({ success: false, message: 'İndirme bağlantısı geçersiz' })
  }

  try {
    await streamOrderProductDownload(token, req, res)
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (!res.headersSent) {
      if (msg === 'FORBIDDEN') {
        return res.status(403).json({ success: false, message: 'Bu indirme bağlantısına erişim yok' })
      }
      if (msg === 'NOT_FOUND') {
        return res.status(404).json({ success: false, message: 'İndirme dosyası bulunamadı' })
      }
      return res.status(500).json({ success: false, message: 'Dosya indirilemedi. Lütfen tekrar deneyin.' })
    }
    console.error('[downloads] order token stream failed', { error: e })
  }
}
