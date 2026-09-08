/**
 * Bilirkişi Policy C: max(kampanya, affiliate) — asla üst üste binmez.
 * Eşitlikte kampanya kazanır.
 */

export type DiscountSource = 'affiliate' | 'campaign' | 'none'

export function resolveMaxDiscountPolicy(input: {
  listPriceTl: number
  campaignRatePercent: number
  affiliateRatePercent: number
  /** Kampanya zaten hesaplanmış birim fiyat (fixed_price vb. için) */
  campaignEffectivePriceTl?: number | null
}): {
  unitPriceTl: number
  campaignRatePercent: number
  affiliateRatePercent: number
  appliedCustomerDiscountRate: number
  appliedDiscountSource: DiscountSource
} {
  const list = Number(input.listPriceTl)
  const campaignRate = clampRate(input.campaignRatePercent)
  const affiliateRate = clampRate(input.affiliateRatePercent)
  const applied = Math.max(campaignRate, affiliateRate)

  let source: DiscountSource = 'none'
  if (applied > 0) {
    if (affiliateRate > campaignRate) source = 'affiliate'
    else if (campaignRate > affiliateRate) source = 'campaign'
    else source = campaignRate > 0 ? 'campaign' : 'affiliate'
  }

  let unitPriceTl = list
  if (source === 'affiliate') {
    unitPriceTl = roundMoney(list * (1 - affiliateRate / 100))
  } else if (source === 'campaign') {
    const campaignPrice = input.campaignEffectivePriceTl
    if (typeof campaignPrice === 'number' && Number.isFinite(campaignPrice) && campaignPrice >= 0) {
      unitPriceTl = roundMoney(campaignPrice)
    } else {
      unitPriceTl = roundMoney(list * (1 - campaignRate / 100))
    }
  }

  return {
    unitPriceTl,
    campaignRatePercent: campaignRate,
    affiliateRatePercent: affiliateRate,
    appliedCustomerDiscountRate: applied,
    appliedDiscountSource: source,
  }
}

/** Liste vs efektif fiyattan yaklaşık yüzde (tam sayı aşağı yuvarlama). */
export function deriveDiscountRatePercent(listPriceTl: number, effectivePriceTl: number): number {
  const list = Number(listPriceTl)
  const effective = Number(effectivePriceTl)
  if (!Number.isFinite(list) || list <= 0) return 0
  if (!Number.isFinite(effective) || effective >= list) return 0
  return Math.max(0, Math.min(100, Math.floor(((list - effective) / list) * 100)))
}

function clampRate(raw: number): number {
  if (!Number.isFinite(raw)) return 0
  return Math.max(0, Math.min(100, Math.trunc(raw)))
}

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}
