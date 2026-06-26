/** Lisans program kodu: büyük harf, rakam, alt çizgi — örn. WOONTEGRA_ISLETME_KASASI */
export const LICENSE_APP_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/

export function normalizeLicenseAppCodeInput(raw: string | null | undefined): string {
  return (raw ?? '').trim().toUpperCase()
}

export function isValidLicenseAppCodeFormat(code: string | null | undefined): boolean {
  const normalized = normalizeLicenseAppCodeInput(code)
  return normalized.length >= 3 && normalized.length <= 64 && LICENSE_APP_CODE_PATTERN.test(normalized)
}
