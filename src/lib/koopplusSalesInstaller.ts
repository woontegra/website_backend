/** KoopPlus satış/müşteri installer — auto-update bucket ile karıştırılmaz. */
export const KOOPPLUS_SALES_PUBLIC_HOST = 'download.woontegra.com'
export const KOOPPLUS_SALES_OBJECT_PREFIX = 'downloads/koopplus/windows/'
/** Yalnız legacy r2.dev kayıtları için fallback; paid teslimat sürüm SoT’si değildir. */
export const KOOPPLUS_SALES_INSTALLER_FILENAME = 'KoopPlus-Setup-1.0.3.exe'
export const KOOPPLUS_SALES_PUBLIC_URL = `https://${KOOPPLUS_SALES_PUBLIC_HOST}/${KOOPPLUS_SALES_OBJECT_PREFIX}${KOOPPLUS_SALES_INSTALLER_FILENAME}`

/** Eski public r2.dev host — paid teslimatta production fallback; admin custom-domain URL’yi ezmez. */
export const KOOPPLUS_SALES_LEGACY_PUBLIC_HOST = 'pub-57d992373eaf4ebd92cd37366668fafd.r2.dev'

const SETUP_NAME = /^koopplus-setup-\d+\.\d+\.\d+\.exe$/i

export function isKoopPlusSalesHostname(hostname: string | null | undefined): boolean {
  const host = (hostname ?? '').trim().toLowerCase()
  return host === KOOPPLUS_SALES_PUBLIC_HOST || host === KOOPPLUS_SALES_LEGACY_PUBLIC_HOST
}

export function isKoopPlusSalesPublicUrl(url: string | null | undefined): boolean {
  const raw = (url ?? '').trim()
  if (!raw) return false
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'https:' || !isKoopPlusSalesHostname(parsed.hostname)) return false
    if (parsed.pathname.toLowerCase().includes('/updates/koopplus-aidat-takip/')) return false
    const name = decodeURIComponent(parsed.pathname.split('/').pop() || '')
    return SETUP_NAME.test(name)
  } catch {
    return false
  }
}

/**
 * Paid teslimat: download.woontegra.com üzerindeki Setup EXE admin URL’si olduğu gibi kalır.
 * Yalnız eski r2.dev Setup kayıtları production fallback’e çevrilir.
 * Update feed / latest.yml / blockmap dokunulmaz.
 */
export function canonicalizeKoopPlusSalesInstallerUrl(url: string | null | undefined): string {
  const raw = (url ?? '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'https:') return raw
    if (parsed.pathname.toLowerCase().includes('/updates/koopplus-aidat-takip/')) return raw
    const host = parsed.hostname.trim().toLowerCase()
    const name = decodeURIComponent(parsed.pathname.split('/').pop() || '')
    if (!SETUP_NAME.test(name)) return raw
    if (host === KOOPPLUS_SALES_PUBLIC_HOST) return raw
    if (host === KOOPPLUS_SALES_LEGACY_PUBLIC_HOST) return KOOPPLUS_SALES_PUBLIC_URL
    return raw
  } catch {
    return raw
  }
}
