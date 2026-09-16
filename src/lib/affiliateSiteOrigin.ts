import type { Request } from 'express'

const PRODUCTION_PUBLIC_ORIGIN = 'https://woontegra.com'

function tryOrigin(raw: string | undefined | null): string | null {
  const t = String(raw ?? '').trim()
  if (!t) return null
  try {
    const u = new URL(t.includes('://') ? t : `https://${t}`)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.origin
  } catch {
    return null
  }
}

function originFromEnv(): string | null {
  for (const key of ['PUBLIC_SITE_URL', 'FRONTEND_URL', 'VITE_PUBLIC_SITE_URL'] as const) {
    const o = tryOrigin(process.env[key])
    if (o) return o
  }
  const cors = process.env.CORS_ORIGIN
  if (cors) {
    for (const part of cors.split(',')) {
      const o = tryOrigin(part.trim())
      if (o && !isLocalhostOrigin(o)) return o
    }
  }
  return null
}

export function isLocalhostOrigin(origin: string): boolean {
  try {
    const u = new URL(origin)
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

/** İstek Referer/Origin’den yalnızca localhost kökeni (açık yönlendirme koruması). */
export function localhostOriginFromRequest(req?: Request | null): string | null {
  if (process.env.NODE_ENV === 'production') return null
  const candidates = [req?.get?.('origin'), req?.get?.('referer'), req?.headers?.referer]
  for (const raw of candidates) {
    if (!raw || typeof raw !== 'string') continue
    const o = tryOrigin(raw)
    if (o && isLocalhostOrigin(o)) return o
  }
  return null
}

/**
 * Admin/panel’den gelen kökeni doğrula.
 * localhost veya env’deki canlı site / CORS listesi kabul edilir.
 */
export function resolveAllowedPublicOrigin(
  candidate: unknown,
  req?: Request | null,
): string | null {
  const fromBody = tryOrigin(typeof candidate === 'string' ? candidate : null)
  if (fromBody) {
    if (isLocalhostOrigin(fromBody)) return fromBody
    const envOrigin = originFromEnv()
    if (envOrigin && fromBody === envOrigin) return fromBody
    const cors = process.env.CORS_ORIGIN ?? ''
    for (const part of cors.split(',')) {
      const o = tryOrigin(part.trim())
      if (o && o === fromBody) return fromBody
    }
  }
  return originFromEnv() || localhostOriginFromRequest(req)
}

/**
 * Genel site kökeni — sabit localhost portu yok.
 * Öncelik: doğrulanmış aday → PUBLIC_SITE_URL/FRONTEND_URL → (dev) istek Origin → canlı site.
 */
export function getPublicSiteOrigin(req?: Request | null, preferredOrigin?: unknown): string {
  return (
    resolveAllowedPublicOrigin(preferredOrigin, req) ||
    originFromEnv() ||
    localhostOriginFromRequest(req) ||
    PRODUCTION_PUBLIC_ORIGIN
  )
}

export function buildPartnerMagicAuthUrl(
  rawToken: string,
  req?: Request | null,
  preferredOrigin?: unknown,
): string {
  const origin = getPublicSiteOrigin(req, preferredOrigin)
  return `${origin}/is-ortagi/giris?token=${encodeURIComponent(rawToken)}`
}

export function buildAffiliateReferralPublicUrl(
  code: string,
  req?: Request | null,
  preferredOrigin?: unknown,
): string {
  const origin = getPublicSiteOrigin(req, preferredOrigin)
  return `${origin}/r/${encodeURIComponent(code)}`
}

/** Ortak satış sayfası — ürün kimliği yalnızca güvenli surum whitelist ile taşınır. */
export const MK_COMPARE_LANDING_PATH = '/yazilimlar/muvekkil-kasa-defteri'

const MK_DESKTOP_LANDING_SLUGS = new Set([
  'muvekkil-kasa-defteri-yazilimi',
  'muvekkil-kasa-defteri-desktop',
])

const MK_SAAS_LANDING_SLUGS = new Set([
  'muvekkil-kasa-defteri-web-tabanli',
  'muvekkil-kasa-saas',
  'muvekkil-kasa-defteri-saas',
])

export type MkAffiliateLandingSurum = 'masaustu' | 'saas'

/** Ürün slug → karşılaştırma sayfası surum parametresi (yoksa null). */
export function mkCompareSurumForProductSlug(slug: string): MkAffiliateLandingSurum | null {
  const normalized = String(slug ?? '')
    .trim()
    .toLowerCase()
  if (!normalized) return null
  if (MK_DESKTOP_LANDING_SLUGS.has(normalized)) return 'masaustu'
  if (MK_SAAS_LANDING_SLUGS.has(normalized)) return 'saas'
  return null
}

/**
 * Tanıtım bağlantısı landing yolu.
 * MK masaüstü/SaaS → ortak satış sayfası + ?surum= (iş ortağı kodu URL’de yok).
 * Diğer ürünler → /yazilimlar/{slug}
 */
export function buildProductLandingPath(slug: string): string {
  const surum = mkCompareSurumForProductSlug(slug)
  if (surum) return `${MK_COMPARE_LANDING_PATH}?surum=${surum}`
  const raw = String(slug ?? '').trim()
  return `/yazilimlar/${encodeURIComponent(raw)}`
}

export function buildProductLandingUrl(
  slug: string,
  req?: Request | null,
  preferredOrigin?: unknown,
): string {
  return `${getPublicSiteOrigin(req, preferredOrigin)}${buildProductLandingPath(slug)}`
}

export const AFFILIATE_REFERRAL_COOKIE_NAME = 'wt_aff_ref'
export const DEFAULT_AFFILIATE_ATTRIBUTION_DAYS = 30

export function getAffiliateAttributionMaxAgeMs(): number {
  const raw = process.env.AFFILIATE_ATTRIBUTION_DAYS
  if (raw == null || raw === '') return DEFAULT_AFFILIATE_ATTRIBUTION_DAYS * 24 * 60 * 60 * 1000
  const n = Number(raw)
  const days = Number.isInteger(n) && n >= 1 && n <= 365 ? n : DEFAULT_AFFILIATE_ATTRIBUTION_DAYS
  return days * 24 * 60 * 60 * 1000
}
