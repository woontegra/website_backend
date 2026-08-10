/** Masaüstü lisans uzatma tarih kuralları (MK SaaS extendTenantLicense ile uyumlu). */

export function dayStart(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** Aktif lisans: mevcut bitişten; süresi dolmuş: ödeme/bugün başlangıcından uzat. */
export function computeDesktopExtensionBaseDate(licenseExpiresAt: Date | null | undefined, ref = new Date()): Date {
  const today = dayStart(ref)
  if (!licenseExpiresAt) return today
  const endDay = dayStart(licenseExpiresAt)
  if (endDay.getTime() >= today.getTime()) return new Date(licenseExpiresAt)
  return today
}

export function addDaysFromBase(base: Date, days: number): Date {
  const next = new Date(base)
  next.setDate(next.getDate() + days)
  return next
}

export function estimateDesktopRenewalEndDate(input: {
  currentExpiresAt: Date | null | undefined
  renewalDays: number
  ref?: Date
}): Date {
  const base = computeDesktopExtensionBaseDate(input.currentExpiresAt, input.ref)
  return addDaysFromBase(base, Math.max(1, input.renewalDays))
}

export function maskLicenseKey(licenseKey: string): string {
  const k = licenseKey.trim().toUpperCase()
  if (k.length <= 8) return '****'
  return `${k.slice(0, 4)}…${k.slice(-4)}`
}
