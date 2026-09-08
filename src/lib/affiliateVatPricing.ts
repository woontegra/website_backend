/** Bilirkişi vatInclusivePricing ile aynı matrah / komisyon formülleri. */

export function exclusiveMatrahFromInclusiveKurus(
  inclusiveKurus: number,
  vatRatePercent: number,
): number {
  const amount = Number(inclusiveKurus)
  const rate = Number(vatRatePercent)
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('inclusiveKurus must be a non-negative number')
  }
  if (!Number.isInteger(rate) || rate < 0 || rate > 100) {
    throw new Error('vatRatePercent must be an integer 0..100')
  }
  if (rate === 0) return Math.round(amount)
  return Math.round(amount / (1 + rate / 100))
}

export function commissionAmountFromMatrahKurus(
  matrahKurus: number,
  commissionRatePercent: number,
): number {
  const matrah = Number(matrahKurus)
  const rate = Number(commissionRatePercent)
  if (!Number.isFinite(matrah) || matrah < 0) {
    throw new Error('matrahKurus must be a non-negative number')
  }
  if (!Number.isInteger(rate) || rate < 0 || rate > 100) {
    throw new Error('commissionRatePercent must be an integer 0..100')
  }
  return Math.round((matrah * rate) / 100)
}

export function tlToKurus(tl: number): number {
  return Math.round(Number(tl) * 100)
}

/**
 * KDV oranı: env VAT_INCLUSIVE_RATE_PERCENT → yoksa varsayılan 20.
 * Bilirkişi SiteSetting de destekler; Woontegra’da env/default yeter.
 */
export function resolveVatInclusiveRatePercent(envValue?: string | null): number {
  const raw = envValue ?? process.env.VAT_INCLUSIVE_RATE_PERCENT
  if (raw != null && String(raw).trim() !== '') {
    const n = Number(String(raw).trim())
    if (Number.isInteger(n) && n >= 0 && n <= 100) return n
  }
  return 20
}
