/** Kurum/baro/özel kampanya indirimi ile kupon aynı checkout’ta birleşemez. */

export const CAMPAIGN_COUPON_EXCLUSIVE_MESSAGE =
  'Kurumsal kampanya indirimi ile kupon kodları birlikte kullanılamaz.'

export function roundTl(amount: number): number {
  return Math.round(amount * 100) / 100
}

/**
 * Aktif kampanya indirimi: pozitif oran veya kampanya varken liste fiyatının altına inmiş final.
 * Oran 0 ve fiyatlar eşitse kampanya kodu geçersiz sayılır; kupon serbest kalır.
 */
export function institutionalCampaignDiscountActive(input: {
  discountRate?: number | null
  hasCampaign?: boolean
  normalPrice?: number | null
  finalPrice?: number | null
}): boolean {
  const rate = Number(input.discountRate)
  if (Number.isFinite(rate) && rate > 0) return true
  if (!input.hasCampaign) return false
  const normal = Number(input.normalPrice)
  const final = Number(input.finalPrice)
  return Number.isFinite(normal) && normal > 0 && Number.isFinite(final) && final + 0.009 < normal
}

/**
 * Authoritative payable. Kampanya aktifken kupon istenirse reddedilir; tutar yalnız kampanyadır.
 * Kampanya yoksa kupon liste fiyatı üzerinden uygulanır.
 */
export function resolveExclusiveBhPayable(input: {
  listPrice: number
  campaignDiscountRate?: number | null
  couponPercent?: number | null
  couponRequested?: boolean
}): { ok: true; total: number } | { ok: false; message: string; total: number } {
  const list = roundTl(Math.max(0, input.listPrice))
  const rate = Number(input.campaignDiscountRate)
  const campaignOn = Number.isFinite(rate) && rate > 0
  const campaignTotal = campaignOn ? roundTl(list * (1 - Math.min(100, rate) / 100)) : list
  const couponRequested = input.couponRequested === true || (input.couponPercent != null && input.couponPercent > 0)

  if (campaignOn && couponRequested) {
    return { ok: false, message: CAMPAIGN_COUPON_EXCLUSIVE_MESSAGE, total: campaignTotal }
  }
  if (campaignOn) return { ok: true, total: campaignTotal }

  const pct = Number(input.couponPercent)
  if (Number.isFinite(pct) && pct > 0) {
    const clamped = Math.min(100, pct)
    return { ok: true, total: roundTl(list * (1 - clamped / 100)) }
  }
  return { ok: true, total: list }
}
