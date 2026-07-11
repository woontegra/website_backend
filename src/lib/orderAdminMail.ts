export const PAYTR_ADMIN_PAID_MAIL_SENT_MARKER = '[woontegra:admin-paid-mail-sent]'

export function normalizePaymentProviderToken(raw: string | null | undefined): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/-/g, '_')
}

export function isPaytrLikePaymentProvider(raw: string | null | undefined): boolean {
  const p = normalizePaymentProviderToken(raw)
  return p === 'PAYTR' || p === 'CARD' || p === 'KART' || p === 'CREDIT_CARD'
}

/** Kart/PayTR siparişlerinde admin maili yalnızca ödeme onaylandıktan sonra gönderilir. */
export function shouldDeferPaytrAdminMailUntilPaid(
  paymentProvider: string,
  paymentConfirmed?: boolean,
): boolean {
  return isPaytrLikePaymentProvider(paymentProvider) && paymentConfirmed !== true
}

export function hasPaytrAdminPaidMailSent(adminNote: string | null | undefined): boolean {
  return (adminNote ?? '').includes(PAYTR_ADMIN_PAID_MAIL_SENT_MARKER)
}

export function appendPaytrAdminPaidMailSentNote(adminNote: string | null | undefined): string {
  if (hasPaytrAdminPaidMailSent(adminNote)) return (adminNote ?? '').trim()
  const base = (adminNote ?? '').trim()
  return base ? `${base}\n${PAYTR_ADMIN_PAID_MAIL_SENT_MARKER}` : PAYTR_ADMIN_PAID_MAIL_SENT_MARKER
}
