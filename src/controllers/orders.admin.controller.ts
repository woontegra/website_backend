import { Request, Response } from 'express'
import { JwtPayload } from '../middleware/auth.middleware'
import { ordersAdminService } from '../services/orders.service'

function readString(body: Record<string, unknown>, key: string): string | undefined {
  const v = body[key]
  if (v === undefined || v === null) return undefined
  return String(v).trim()
}

function readQueryString(q: Request['query'], key: string): string | undefined {
  const v = q[key]
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  return s === '' ? undefined : s
}

export async function adminListOrders(req: Request, res: Response) {
  const status = readQueryString(req.query, 'status')
  const email = readQueryString(req.query, 'email')
  const orderNo = readQueryString(req.query, 'orderNo')
  const customerQuery = readQueryString(req.query, 'customerQuery')
  const paymentProvider = readQueryString(req.query, 'paymentProvider')
  const paymentStatus = readQueryString(req.query, 'paymentStatus')
  const dateFrom = readQueryString(req.query, 'dateFrom')
  const dateTo = readQueryString(req.query, 'dateTo')
  const takeRaw = readQueryString(req.query, 'take')
  const skipRaw = readQueryString(req.query, 'skip')
  const take = takeRaw ? Number.parseInt(takeRaw, 10) : undefined
  const skip = skipRaw ? Number.parseInt(skipRaw, 10) : undefined
  const rows = await ordersAdminService.list({
    status,
    email,
    orderNo,
    customerQuery,
    paymentProvider,
    paymentStatus,
    dateFrom,
    dateTo,
    take: Number.isFinite(take) ? take : undefined,
    skip: Number.isFinite(skip) ? skip : undefined,
  })
  return res.json({ success: true, data: rows })
}

export async function adminGetOrder(req: Request, res: Response) {
  const id = String(req.params.id ?? '').trim()
  if (!id) {
    return res.status(400).json({ success: false, message: 'Geçersiz id' })
  }
  const row = await ordersAdminService.getById(id)
  if (!row) {
    return res.status(404).json({ success: false, message: 'Sipariş bulunamadı' })
  }
  return res.json({ success: true, data: row })
}

export async function adminConfirmBankPayment(req: Request & { user?: JwtPayload }, res: Response) {
  const id = String(req.params.id ?? '').trim()
  if (!id) {
    return res.status(400).json({ success: false, message: 'Geçersiz id' })
  }
  const body = req.body as Record<string, unknown>
  const paymentDate = readString(body, 'paymentDate') ?? ''
  const bankNote = readString(body, 'bankNote') ?? ''
  const reference = readString(body, 'reference')
  const adminUserId = req.user?.userId
  if (!adminUserId) {
    return res.status(401).json({ success: false, message: 'Yetkilendirme gerekli' })
  }
  try {
    const data = await ordersAdminService.confirmBankPayment(id, {
      paymentDate,
      bankNote,
      reference: reference ?? null,
      adminUserId,
    })
    return res.json({ success: true, data })
  } catch (e) {
    const err = e as Error & { status?: number }
    const code = err.status ?? 500
    return res.status(code).json({ success: false, message: err.message || 'İşlem yapılamadı' })
  }
}

export async function adminUpdateOrder(req: Request, res: Response) {
  const id = String(req.params.id ?? '').trim()
  if (!id) {
    return res.status(400).json({ success: false, message: 'Geçersiz id' })
  }
  const body = req.body as Record<string, unknown>
  try {
    const data = await ordersAdminService.update(id, {
      status: readString(body, 'status'),
      paymentTransactionStatus: readString(body, 'paymentTransactionStatus'),
      adminNote: body.adminNote === null ? null : readString(body, 'adminNote'),
      shippingCarrier: body.shippingCarrier === null ? null : readString(body, 'shippingCarrier'),
      shippingTrackingNumber: body.shippingTrackingNumber === null ? null : readString(body, 'shippingTrackingNumber'),
      shippingStatus: body.shippingStatus === null ? null : readString(body, 'shippingStatus'),
    })
    return res.json({ success: true, data })
  } catch (e) {
    const err = e as Error & { status?: number }
    const code = err.status ?? 500
    return res.status(code).json({ success: false, message: err.message || 'Güncellenemedi' })
  }
}

export async function adminRetryOrderDelivery(req: Request, res: Response) {
  const id = String(req.params.id ?? '').trim()
  if (!id) {
    return res.status(400).json({ success: false, message: 'Geçersiz id' })
  }
  try {
    const data = await ordersAdminService.retryDelivery(id)
    return res.json({ success: true, data })
  } catch (e) {
    const err = e as Error & { status?: number }
    const code = err.status ?? 500
    return res.status(code).json({ success: false, message: err.message || 'Teslimat yeniden denenemedi' })
  }
}

export async function adminDeleteOrder(req: Request, res: Response) {
  const id = String(req.params.id ?? '').trim()
  if (!id) {
    return res.status(400).json({ success: false, message: 'Geçersiz id' })
  }
  try {
    await ordersAdminService.archive(id)
    return res.json({ success: true, data: { id } })
  } catch (e) {
    const err = e as Error & { status?: number }
    const code = err.status ?? 500
    return res.status(code).json({ success: false, message: err.message || 'Silinemedi' })
  }
}

export async function adminPatchOrderLicense(req: Request, res: Response) {
  const orderId = String(req.params.id ?? '').trim()
  const licenseId = String(req.params.licenseId ?? '').trim()
  if (!orderId || !licenseId) {
    return res.status(400).json({ success: false, message: 'Geçersiz istek' })
  }
  const body = req.body as Record<string, unknown>
  const st = body.status
  const status = st === 'ACTIVE' || st === 'DISABLED' ? st : undefined
  const resetActivations = body.resetActivations === true
  const maxDevices =
    typeof body.maxDevices === 'number' && Number.isFinite(body.maxDevices) ? body.maxDevices : undefined
  try {
    const data = await ordersAdminService.patchOrderLicense(orderId, licenseId, {
      status,
      resetActivations,
      maxDevices,
    })
    return res.json({ success: true, data })
  } catch (e) {
    const err = e as Error & { status?: number }
    const code = err.status ?? 500
    return res.status(code).json({ success: false, message: err.message || 'Güncellenemedi' })
  }
}
