import type { Request, Response } from 'express'
import {
  isMkSaasLicensePurchaseConfigured,
  requestMkSaasLicensePurchasePreview,
  requestMkSaasLicensePurchaseResolve,
} from '../services/mkSaasLicensePurchase.client'

export async function postMkSaasLicensePurchaseResolve(req: Request, res: Response) {
  const body = req.body as Record<string, unknown>
  const renewalToken = typeof body.renewalToken === 'string' ? body.renewalToken.trim() : ''
  if (!renewalToken || renewalToken.length < 32) {
    return res.status(400).json({
      success: false,
      message: 'Satın alma bağlantısı geçersiz veya süresi dolmuş.',
    })
  }

  if (!isMkSaasLicensePurchaseConfigured()) {
    return res.status(503).json({
      success: false,
      message: 'Lisans satın alma hizmeti şu anda kullanılamıyor.',
    })
  }

  const result = await requestMkSaasLicensePurchaseResolve(renewalToken)
  if (!result.success) {
    const status = result.status === 404 || result.status === 410 ? 410 : result.status === 403 ? 403 : 400
    return res.status(status).json({
      success: false,
      message: 'Satın alma bağlantısı geçersiz veya süresi dolmuş.',
    })
  }

  return res.json({ success: true, data: result.data })
}

export async function postMkSaasLicensePurchasePreview(req: Request, res: Response) {
  const body = req.body as Record<string, unknown>
  const renewalToken = typeof body.renewalToken === 'string' ? body.renewalToken.trim() : ''
  const renewalDays = Number(body.renewalDays)
  if (!renewalToken || renewalToken.length < 32 || !Number.isFinite(renewalDays) || renewalDays < 1) {
    return res.status(400).json({ success: false, message: 'Geçersiz yenileme önizleme isteği.' })
  }
  if (!isMkSaasLicensePurchaseConfigured()) {
    return res.status(503).json({ success: false, message: 'Lisans hizmeti şu anda kullanılamıyor.' })
  }
  const result = await requestMkSaasLicensePurchasePreview({ renewalToken, renewalDays })
  if (!result.success) {
    return res.status(400).json({ success: false, message: 'Yenileme önizlemesi hesaplanamadı.' })
  }
  return res.json({ success: true, data: result.data })
}
