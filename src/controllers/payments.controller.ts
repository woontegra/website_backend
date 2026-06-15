import { Request, Response } from 'express'
import { getPublicBankTransferDisplay } from '../services/bankTransferSettings.service'
import { paytrService } from '../services/paytr.service'

function readString(body: Record<string, unknown>, key: string): string | undefined {
  const v = body[key]
  if (v === undefined || v === null) return undefined
  return String(v).trim()
}

export async function paytrStart(req: Request, res: Response) {
  const body = req.body as Record<string, unknown>
  const orderNo = readString(body, 'orderNo')
  if (!orderNo) {
    return res.status(400).json({ success: false, message: 'orderNo zorunludur' })
  }
  try {
    const { iframeToken } = await paytrService.startIframePayment(orderNo, req)
    return res.json({ success: true, data: { iframe_token: iframeToken } })
  } catch (e) {
    const err = e as Error & { status?: number; publicMessage?: string }
    const code = err.status ?? 500
    return res.status(code).json({
      success: false,
      message: err.publicMessage || err.message || 'PayTR başlatılamadı',
    })
  }
}

export async function paytrCallback(req: Request, res: Response) {
  const raw = req.body as Record<string, unknown>
  const payload: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw ?? {})) {
    payload[k] = v === undefined || v === null ? '' : String(v)
  }
  console.info('[paytr] callback HTTP alındı', {
    merchant_oid: payload.merchant_oid ?? '',
    status: payload.status ?? '',
    total_amount: payload.total_amount ?? '',
    hash_len: (payload.hash ?? '').length,
    contentType: req.headers['content-type'],
  })
  try {
    await paytrService.handleCallback(payload, req)
    res.type('text/plain').send('OK')
  } catch (e) {
    const err = e as Error & { status?: number }
    const code = err.status ?? 500
    res.status(code).type('text/plain').send(err.message || 'Hata')
  }
}

export async function getBankTransferDisplay(_req: Request, res: Response) {
  const data = await getPublicBankTransferDisplay()
  return res.json({ success: true, data })
}
