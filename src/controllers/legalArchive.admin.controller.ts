import { Request, Response } from 'express'
import { legalArchiveService } from '../services/legalArchive.service'

export async function adminListLegalArchive(req: Request, res: Response) {
  const orderId = String(req.params.id ?? '').trim()
  if (!orderId) return res.status(400).json({ success: false, message: 'Geçersiz sipariş id' })
  try {
    const data = await legalArchiveService.listByOrderId(orderId)
    return res.json({ success: true, data })
  } catch (e) {
    const err = e as Error & { status?: number }
    return res.status(err.status ?? 500).json({ success: false, message: err.message || 'Yüklenemedi' })
  }
}

export async function adminGenerateLegalArchive(req: Request, res: Response) {
  const orderId = String(req.params.id ?? '').trim()
  if (!orderId) return res.status(400).json({ success: false, message: 'Geçersiz sipariş id' })
  const force = req.body?.force === true
  try {
    const data = await legalArchiveService.generateForOrder(orderId, { force })
    return res.status(201).json({ success: true, data })
  } catch (e) {
    const err = e as Error & { status?: number; code?: string }
    const code = err.status ?? 500
    return res.status(code).json({
      success: false,
      message: err.message || 'Arşiv oluşturulamadı',
      code: err.code,
    })
  }
}

export async function adminDownloadLegalArchiveFile(req: Request, res: Response) {
  const orderId = String(req.params.id ?? '').trim()
  const fileId = String(req.params.fileId ?? '').trim()
  if (!orderId || !fileId) {
    return res.status(400).json({ success: false, message: 'Geçersiz parametre' })
  }
  try {
    const { row, data } = await legalArchiveService.getFileForDownload(orderId, fileId)
    res.setHeader('Content-Type', row.mimeType)
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.fileName)}"`)
    res.setHeader('Content-Length', String(data.length))
    return res.send(data)
  } catch (e) {
    const err = e as Error & { status?: number }
    return res.status(err.status ?? 500).json({ success: false, message: err.message || 'İndirilemedi' })
  }
}
