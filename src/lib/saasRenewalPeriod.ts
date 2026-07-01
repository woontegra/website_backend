export const SAAS_RENEWAL_PERIODS = ['1_MONTHS', '3_MONTHS', '6_MONTHS', '12_MONTHS'] as const

export type SaasRenewalPeriod = (typeof SAAS_RENEWAL_PERIODS)[number]

export function isSaasRenewalPeriod(value: string): value is SaasRenewalPeriod {
  return (SAAS_RENEWAL_PERIODS as readonly string[]).includes(value)
}

export function renewalDaysForPeriod(period: SaasRenewalPeriod): number {
  switch (period) {
    case '1_MONTHS':
      return 30
    case '3_MONTHS':
      return 90
    case '6_MONTHS':
      return 180
    case '12_MONTHS':
      return 365
    default:
      return 365
  }
}

export function renewalPeriodLabel(period: SaasRenewalPeriod): string {
  switch (period) {
    case '1_MONTHS':
      return '1 Ay'
    case '3_MONTHS':
      return '3 Ay'
    case '6_MONTHS':
      return '6 Ay'
    case '12_MONTHS':
      return '12 Ay'
    default:
      return period
  }
}

/** Yıllık ürün fiyatından dönem oranına göre yenileme tutarı. */
export function renewalPriceForPeriod(annualPrice: number, period: SaasRenewalPeriod): number {
  const days = renewalDaysForPeriod(period)
  const raw = (annualPrice / 365) * days
  return Math.round(raw * 100) / 100
}
