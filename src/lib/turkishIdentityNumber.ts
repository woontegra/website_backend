export function sanitizeTurkishIdentityNumber(value: string): string {
  return value.replace(/\D/g, '').slice(0, 11)
}

/** Boşsa geçer; doluysa 11 rakam olmalı. */
export function validateTurkishIdentityNumber(value: string | undefined | null): string | null {
  const digits = sanitizeTurkishIdentityNumber((value ?? '').trim())
  if (!digits) return null
  if (digits.length !== 11) return 'T.C. Kimlik No 11 haneli olmalıdır.'
  return null
}

export function isIndividualBillingType(billingType: string | undefined | null): boolean {
  const t = (billingType ?? '').trim().toLowerCase()
  return t === 'bireysel' || t === 'individual' || t === 'personal'
}
