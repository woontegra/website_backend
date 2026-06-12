/**
 * PayTR merchant_ok_url / merchant_fail_url: successUrl veya failUrl tabanına sipariş numarası eklenir.
 * Taban zaten sipariş no içeriyorsa tekrar eklenmez.
 */
export function buildPaytrMerchantReturnUrl(baseRaw: string, orderNo: string): string {
  const order = String(orderNo ?? '').trim()
  let base = String(baseRaw ?? '').trim().replace(/\/+$/g, '')
  if (!base || !order) return base

  const enc = encodeURIComponent(order)
  if (base.endsWith(`/${enc}`) || base.endsWith(`/${order}`)) {
    return base
  }

  const lastSeg = base.split('/').pop() ?? ''
  let decoded = lastSeg
  try {
    decoded = decodeURIComponent(lastSeg)
  } catch {
    /* keep lastSeg */
  }
  if (decoded === order || lastSeg === order) {
    return base
  }

  return `${base}/${enc}`
}
