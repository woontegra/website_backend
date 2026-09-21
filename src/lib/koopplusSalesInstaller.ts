/** KoopPlus satış/müşteri installer — auto-update bucket ile karıştırılmaz. */
export const KOOPPLUS_SALES_PUBLIC_HOST = 'download.woontegra.com'
export const KOOPPLUS_SALES_OBJECT_PREFIX = 'downloads/koopplus/windows/'
export const KOOPPLUS_SALES_INSTALLER_FILENAME = 'KoopPlus-Setup-1.0.3.exe'
export const KOOPPLUS_SALES_PUBLIC_URL = `https://${KOOPPLUS_SALES_PUBLIC_HOST}/${KOOPPLUS_SALES_OBJECT_PREFIX}${KOOPPLUS_SALES_INSTALLER_FILENAME}`

/** Eski public r2.dev host — CTA kaynağı değil; sipariş kaydı 1.0.3 production URL’ye yükseltilir. */
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
 * Eski satış Setup URL’sini (r2.dev / 1.0.0) production 1.0.3 installer’a yükseltir.
 * Update feed / latest.yml / blockmap dokunulmaz.
 */
export function canonicalizeKoopPlusSalesInstallerUrl(url: string | null | undefined): string {
  const raw = (url ?? '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'https:') return raw
    if (parsed.pathname.toLowerCase().includes('/updates/koopplus-aidat-takip/')) return raw
    if (!isKoopPlusSalesHostname(parsed.hostname)) return raw
    const name = decodeURIComponent(parsed.pathname.split('/').pop() || '')
    if (!SETUP_NAME.test(name)) return raw
    return KOOPPLUS_SALES_PUBLIC_URL
  } catch {
    return raw
  }
}
