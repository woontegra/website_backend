/** Müvekkil Kasa SaaS üyelik uzatması yalnızca yıllık yapılır. */
export const ANNUAL_SAAS_RENEWAL_PERIOD = '12_MONTHS' as const

export type SaasRenewalPeriod = typeof ANNUAL_SAAS_RENEWAL_PERIOD

export const SAAS_RENEWAL_PERIODS = [ANNUAL_SAAS_RENEWAL_PERIOD] as const

export function isSaasRenewalPeriod(value: string): value is SaasRenewalPeriod {
  return value === ANNUAL_SAAS_RENEWAL_PERIOD
}

export function assertAnnualSaasRenewalPeriod(value: string): SaasRenewalPeriod {
  if (!isSaasRenewalPeriod(value)) {
    const err = new Error('Üyelik uzatma yalnızca yıllık yapılabilir.') as Error & { status: number }
    err.status = 400
    throw err
  }
  return ANNUAL_SAAS_RENEWAL_PERIOD
}

export function renewalDaysForPeriod(_period: SaasRenewalPeriod = ANNUAL_SAAS_RENEWAL_PERIOD): number {
  return 365
}

export function renewalPeriodLabel(_period: SaasRenewalPeriod = ANNUAL_SAAS_RENEWAL_PERIOD): string {
  return '1 Yıl'
}

/** Yıllık ürün fiyatı = uzatma tutarı. */
export function renewalPriceForPeriod(annualPrice: number, _period: SaasRenewalPeriod = ANNUAL_SAAS_RENEWAL_PERIOD): number {
  return Math.round(annualPrice * 100) / 100
}
