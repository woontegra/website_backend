/** KoopPlus POST /api/integrations/orders gövdesi ve güvenli hata metni (PII içermez). */

export type KoopPlusOrderSource = {
  orderNo: string
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  companyName?: string | null
  billingCity?: string | null
  billingDistrict?: string | null
  paidAt?: Date | null
  paymentConfirmedAt?: Date | null
}

export type KoopPlusOrderPayload = {
  orderId: string
  customerName: string
  email: string
  phone?: string
  cooperativeName: string
  city?: string
  district?: string
  paymentDate: string
  amount: number
  licenseKey?: string
}

/** Türkiye (UTC+3, DST yok) takvim günü — YYYY-MM-DD. */
export function formatKoopPlusPaymentDate(date: Date): string {
  return new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function buildKoopPlusOrderPayload(input: {
  order: KoopPlusOrderSource
  amount: number
  licenseKey?: string | null
  now?: Date
}): KoopPlusOrderPayload {
  const { order } = input
  const customerName = order.customerName.trim() || order.companyName?.trim() || order.customerEmail.trim()
  const cooperativeName = order.companyName?.trim() || customerName
  const paidDate = order.paidAt ?? order.paymentConfirmedAt ?? input.now ?? new Date()
  const phone = order.customerPhone?.trim()
  const city = order.billingCity?.trim()
  const district = order.billingDistrict?.trim()
  const licenseKey = input.licenseKey?.trim()
  return {
    orderId: order.orderNo,
    customerName,
    email: order.customerEmail.trim().toLowerCase(),
    ...(phone ? { phone } : {}),
    cooperativeName,
    ...(city ? { city } : {}),
    ...(district ? { district } : {}),
    paymentDate: formatKoopPlusPaymentDate(paidDate),
    amount: Math.round(input.amount * 100) / 100,
    ...(licenseKey ? { licenseKey } : {}),
  }
}

/** Hata metninden e-posta / lisans anahtarı kalıplarını maskeler ve uzunluğu sınırlar. */
export function sanitizeKoopPlusError(message: string | null | undefined, status: number): string {
  const base = (message ?? '')
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[e-posta]')
    .replace(/\b[A-Z0-9]{3,6}(?:-[A-Z0-9]{3,6}){2,6}\b/g, '[anahtar]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
  const prefix = status > 0 ? `KoopPlus HTTP ${status}` : 'KoopPlus'
  return base ? `${prefix}: ${base}` : `${prefix}: istek başarısız`
}

/** Yeniden denenebilir mi? (ağ hatası, 408, 429, 5xx) — 4xx doğrulama hataları denenmez. */
export function isRetryableKoopPlusStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500
}
