import { AFFILIATE_COMMISSION_STATUS } from './affiliateCommissionEvaluate'

export const AFFILIATE_PAYOUT_STATUS = {
  PAID: 'PAID',
} as const

export const AFFILIATE_PAYOUT_METHODS = {
  BANK_TRANSFER: 'BANK_TRANSFER',
  CASH: 'CASH',
  OTHER: 'OTHER',
} as const

export type AffiliatePayoutMethod =
  (typeof AFFILIATE_PAYOUT_METHODS)[keyof typeof AFFILIATE_PAYOUT_METHODS]

/** Ödeme sonrası komisyon durumu — REVERSED korunur. */
export function deriveCommissionPayoutStatus(
  commissionAmountKurus: number,
  paidAmountKurus: number,
  currentStatus: string,
): string {
  if (currentStatus === AFFILIATE_COMMISSION_STATUS.REVERSED) {
    return AFFILIATE_COMMISSION_STATUS.REVERSED
  }
  const amount = Number(commissionAmountKurus) || 0
  const paid = Number(paidAmountKurus) || 0
  if (paid <= 0) return AFFILIATE_COMMISSION_STATUS.EARNED
  if (paid >= amount) return AFFILIATE_COMMISSION_STATUS.PAID
  return AFFILIATE_COMMISSION_STATUS.PARTIALLY_PAID
}

export function withPaidRemaining<T extends { commissionAmountKurus: number }>(
  row: T,
  paidAmountKurus: number,
): T & { paidAmountKurus: number; remainingAmountKurus: number } {
  const paid = Number(paidAmountKurus) || 0
  const amount = Number(row.commissionAmountKurus) || 0
  return {
    ...row,
    paidAmountKurus: paid,
    remainingAmountKurus: Math.max(0, amount - paid),
  }
}
