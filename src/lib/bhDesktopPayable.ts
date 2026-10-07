import { resolveExclusiveBhPayable } from './bhCampaignCouponExclusive'

export type BhDesktopCharge = {
  provider: 'PAYTR' | 'BANK_TRANSFER'
  listTl: number
  totalTl: number
  campaignRate: number
  couponApplied: boolean
}

/** PayTR ve Havale/EFT aynı liste ve aynı indirim fonksiyonunu kullanır. */
export function chargeBhDesktop(input: {
  provider?: 'PAYTR' | 'BANK_TRANSFER'
  listTl: number
  campaignDiscountRate?: number | null
  couponPercent?: number | null
  couponRequested?: boolean
}): { ok: true; charge: BhDesktopCharge } | { ok: false; message: string; charge: BhDesktopCharge } {
  const priced = resolveExclusiveBhPayable({
    listPrice: input.listTl,
    campaignDiscountRate: input.campaignDiscountRate,
    couponPercent: input.couponPercent,
    couponRequested: input.couponRequested,
  })
  const rate = Number(input.campaignDiscountRate)
  const campaignRate = Number.isFinite(rate) && rate > 0 ? rate : 0
  const couponApplied = priced.ok && !campaignRate && Number(input.couponPercent) > 0
  const charge: BhDesktopCharge = {
    provider: input.provider === 'BANK_TRANSFER' ? 'BANK_TRANSFER' : 'PAYTR',
    listTl: input.listTl,
    totalTl: priced.total,
    campaignRate,
    couponApplied,
  }
  if (!priced.ok) return { ok: false, message: priced.message, charge }
  return { ok: true, charge }
}
