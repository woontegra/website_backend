const SEGMENT = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function randomSegment(len: number): string {
  let s = ''
  for (let i = 0; i < len; i++) {
    s += SEGMENT[Math.floor(Math.random() * SEGMENT.length)]!
  }
  return s
}

/** WNTG-XXXX-XXXX-XXXX-XXXX */
export function generateLicenseKey(): string {
  return `WNTG-${randomSegment(4)}-${randomSegment(4)}-${randomSegment(4)}-${randomSegment(4)}`
}

export function normalizeLicenseKeyInput(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase()
}

/** Hesabım ekranı: tam anahtarı göstermeden son segmentin son 4 karakteri. */
export function maskLicenseKeyForDisplay(rawKey: string): string {
  const n = normalizeLicenseKeyInput(rawKey)
  const parts = n.split('-').filter(Boolean)
  if (parts.length < 2) return 'WNTG-****-****-****-****'
  const last = parts[parts.length - 1] ?? ''
  const tail = last.length >= 4 ? last.slice(-4) : '****'
  return `WNTG-****-****-****-${tail}`
}
