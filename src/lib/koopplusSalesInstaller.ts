/** KoopPlus satış/müşteri installer — auto-update bucket ile karıştırılmaz. */
export const KOOPPLUS_SALES_PUBLIC_HOST = 'pub-57d992373eaf4ebd92cd37366668fafd.r2.dev'
export const KOOPPLUS_SALES_OBJECT_PREFIX = 'windows/'
export const KOOPPLUS_SALES_INSTALLER_FILENAME = 'KoopPlus-Setup-1.0.3.exe'

const SETUP_NAME = /^koopplus-setup-\d+\.\d+\.\d+\.exe$/i

export function isKoopPlusSalesPublicUrl(url: string | null | undefined): boolean {
  const raw = (url ?? '').trim()
  if (!raw) return false
  try {
    const parsed = new URL(raw)
    return parsed.protocol === 'https:' && parsed.hostname === KOOPPLUS_SALES_PUBLIC_HOST
  } catch {
    return false
  }
}

/**
 * Geçici uyumluluk katmanı — product DB/source-of-truth hâlâ eski satış Setup URL’si
 * (örn. KoopPlus-Setup-1.0.0.exe) tutuyorsa teslimatı mevcut production 1.0.3’e yükseltir.
 * Kalıcı çözüm: product downloadFiles setup URL’sini 1.0.3 yapmak. Update feed’e dokunmaz.
 */
export function canonicalizeKoopPlusSalesInstallerUrl(url: string | null | undefined): string {
  const raw = (url ?? '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'https:' || parsed.hostname !== KOOPPLUS_SALES_PUBLIC_HOST) return raw
    if (parsed.pathname.toLowerCase().includes('/updates/koopplus-aidat-takip/')) return raw
    const name = decodeURIComponent(parsed.pathname.split('/').pop() || '')
    if (!SETUP_NAME.test(name)) return raw
    if (name === KOOPPLUS_SALES_INSTALLER_FILENAME) return raw
    return `https://${KOOPPLUS_SALES_PUBLIC_HOST}/${KOOPPLUS_SALES_OBJECT_PREFIX}${KOOPPLUS_SALES_INSTALLER_FILENAME}`
  } catch {
    return raw
  }
}
