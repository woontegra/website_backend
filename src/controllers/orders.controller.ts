import { Request, Response } from 'express'
import { ordersService } from '../services/orders.service'

function readString(body: Record<string, unknown>, key: string): string | undefined {
  const v = body[key]
  if (v === undefined || v === null) return undefined
  return String(v).trim()
}

function parseOrderItems(body: Record<string, unknown>): { productId: string; quantity: number }[] {
  const raw = body.items
  if (Array.isArray(raw)) {
    const out: { productId: string; quantity: number }[] = []
    for (const it of raw) {
      if (!it || typeof it !== 'object') continue
      const o = it as Record<string, unknown>
      const pid = readString(o, 'productId') || readString(o, 'slug')
      if (!pid) continue
      const q = Number(o.quantity)
      out.push({ productId: pid, quantity: Number.isFinite(q) && q > 0 ? Math.floor(q) : 1 })
    }
    return out
  }
  const legacy = readString(body, 'productId')
  if (legacy) return [{ productId: legacy, quantity: 1 }]
  return []
}

export async function createOrder(req: Request, res: Response) {
  const body = req.body as Record<string, unknown>
  const items = parseOrderItems(body)
  const customerName = readString(body, 'customerName')
  const customerEmail = readString(body, 'customerEmail')
  if (items.length === 0 || !customerName || !customerEmail) {
    return res.status(400).json({ success: false, message: 'items (veya productId), customerName ve customerEmail zorunludur' })
  }
  if (customerName.length < 2) {
    return res.status(400).json({ success: false, message: 'Ad soyad en az 2 karakter olmalıdır' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    return res.status(400).json({ success: false, message: 'Geçerli bir e-posta girin' })
  }

  const acceptPreInfo = body.acceptPreInfo === true
  const acceptDistanceSales = body.acceptDistanceSales === true
  const acceptKvkk = body.acceptKvkk === true
  const acceptSoftwareLicense = body.acceptSoftwareLicense === true
  const acceptSaasSubscription = body.acceptSaasSubscription === true
  const acceptDigitalProductWaiver = body.acceptDigitalProductWaiver === true
  const acceptDigitalServiceWaiver = body.acceptDigitalServiceWaiver === true
  const marketingConsent = body.marketingConsent === true
  const explicitConsent = body.explicitConsent === true

  const xf = req.headers['x-forwarded-for']
  const ip =
    typeof xf === 'string' && xf.length > 0
      ? xf.split(',')[0].trim().slice(0, 45)
      : (req.socket.remoteAddress || '').replace(/^::ffff:/, '').slice(0, 45)
  const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 500) : ''

  const rawPm = readString(body, 'paymentMethod')?.toUpperCase().replace(/-/g, '_')
  const rawPv = readString(body, 'paymentProvider')?.toUpperCase().replace(/-/g, '_')
  const payToken = rawPm || rawPv || ''
  const isBank =
    payToken === 'BANK_TRANSFER' ||
    payToken === 'BANK' ||
    payToken === 'HAVALE' ||
    payToken === 'EFT' ||
    payToken === 'HAVALE_EFT' ||
    payToken === 'WIRE'
  const paymentProvider: 'PAYTR' | 'BANK_TRANSFER' = isBank ? 'BANK_TRANSFER' : 'PAYTR'

  try {
    const order = await ordersService.createOrder({
      items,
      customerName,
      customerEmail,
      customerPhone: readString(body, 'customerPhone'),
      billingType: readString(body, 'billingType'),
      taxOffice: readString(body, 'taxOffice'),
      taxNumber: readString(body, 'taxNumber'),
      companyName: readString(body, 'companyName'),
      deliveryCity: readString(body, 'deliveryCity') || readString(body, 'city'),
      deliveryDistrict: readString(body, 'deliveryDistrict') || readString(body, 'district'),
      deliveryLine: readString(body, 'deliveryLine') || readString(body, 'addressLine') || readString(body, 'address'),
      customerId: req.customer?.id ?? null,
      acceptPreInfo,
      acceptDistanceSales,
      acceptKvkk,
      acceptSoftwareLicense,
      acceptSaasSubscription,
      acceptDigitalProductWaiver,
      acceptDigitalServiceWaiver,
      marketingConsent,
      explicitConsent,
      acceptedIp: ip || null,
      acceptedUserAgent: ua || null,
      paymentProvider,
    })
    return res.status(201).json({
      success: true,
      data: {
        orderNo: order.orderNo,
        id: order.id,
        status: order.status,
        total: Number(order.total),
        currency: order.currency,
        paymentProvider: order.paymentProvider,
      },
    })
  } catch (e) {
    const err = e as Error & { status?: number; publicMessage?: string; invalidDetails?: unknown }
    const code = err.status ?? 500
    const message =
      err.publicMessage ||
      (err.message === 'BANK_TRANSFER_UNAVAILABLE'
        ? 'Havale/EFT ödeme yöntemi şu anda kullanılamıyor.'
        : code === 400 && err.message === 'ORDER_ITEMS_INVALID'
          ? 'Sepetinizdeki bazı ürünler artık satın alınamıyor. Lütfen sepetinizi güncelleyip tekrar deneyin.'
          : err.message) ||
      'Sipariş oluşturulamadı'
    const payload: { success: false; message: string; details?: unknown } = { success: false, message }
    if (err.invalidDetails !== undefined) payload.details = err.invalidDetails
    return res.status(code).json(payload)
  }
}

export async function orderLookup(req: Request, res: Response) {
  const body = req.body as Record<string, unknown>
  const orderNo = readString(body, 'orderNo')
  const customerEmail = readString(body, 'customerEmail')
  if (!orderNo || !customerEmail) {
    return res.status(400).json({ success: false, message: 'orderNo ve customerEmail zorunludur' })
  }
  try {
    const data = await ordersService.lookup(orderNo, customerEmail)
    return res.json({ success: true, data })
  } catch (e) {
    const err = e as Error & { status?: number }
    const code = err.status ?? 500
    return res.status(code).json({ success: false, message: err.message || 'Hata' })
  }
}

export async function orderSuccess(req: Request, res: Response) {
  const orderNo = String(req.params.orderNo ?? '').trim()
  const customerEmail =
    typeof req.query.customerEmail === 'string' ? req.query.customerEmail.trim() : undefined
  if (!orderNo) {
    return res.status(400).json({ success: false, message: 'Sipariş numarası gerekli' })
  }
  try {
    const data = await ordersService.getSuccessView(orderNo, customerEmail, req.customer?.id ?? null)
    console.info('[orders] GET /api/orders/success', {
      orderNo,
      returnedStatus: (data as { status: string }).status,
    })
    return res.json({ success: true, data })
  } catch (e) {
    const err = e as Error & { status?: number }
    const code = err.status ?? 500
    return res.status(code).json({ success: false, message: err.message || 'Hata' })
  }
}
