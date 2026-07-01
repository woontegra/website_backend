import { paytrCallbackUrlLooksLocalOrPrivate } from './paytrCallbackUrl'

export const PAYTR_SUCCESS_PATH = '/odeme/basarili'
export const PAYTR_FAIL_PATH = '/odeme/basarisiz'

const PRODUCTION_FALLBACK_ORIGIN = 'https://www.woontegra.com'
const DEV_FALLBACK_ORIGIN = 'http://localhost:5173'

const ALLOWED_PRODUCTION_HOSTS = new Set(['woontegra.com', 'www.woontegra.com'])

function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production'
}

function parseUrlOrigin(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  try {
    const u = new URL(t.includes('://') ? t : `https://${t}`)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.origin
  } catch {
    return null
  }
}

function isAllowedProductionOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase()
    if (ALLOWED_PRODUCTION_HOSTS.has(host)) return true
    return host.endsWith('.woontegra.com')
  } catch {
    return false
  }
}

function acceptOrigin(origin: string): boolean {
  if (isProductionEnv()) {
    if (paytrCallbackUrlLooksLocalOrPrivate(origin)) return false
    if (!isAllowedProductionOrigin(origin)) return false
  }
  return true
}

function pickConfiguredSiteOrigin(): string | null {
  const envCandidates = [
    process.env.PUBLIC_SITE_URL,
    process.env.FRONTEND_URL,
    process.env.APP_URL,
    process.env.FRONTEND_SUCCESS_URL,
    process.env.FRONTEND_FAIL_URL,
  ]
  for (const raw of envCandidates) {
    const origin = parseUrlOrigin(raw ?? '')
    if (!origin || !acceptOrigin(origin)) continue
    return origin
  }
  return null
}

function originFromConfiguredReturnUrl(configured: string): string | null {
  const origin = parseUrlOrigin(configured)
  if (!origin || !acceptOrigin(origin)) return null
  return origin
}

function joinOriginPath(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, '')}${path}`
}

function resolvePaytrReturnUrlBase(path: string, configured: string | null | undefined): string {
  const fromConfigured = configured?.trim()
  if (fromConfigured) {
    const origin = originFromConfiguredReturnUrl(fromConfigured)
    if (origin) return joinOriginPath(origin, path)
  }

  const siteOrigin = pickConfiguredSiteOrigin()
  if (siteOrigin) return joinOriginPath(siteOrigin, path)

  if (isProductionEnv()) return joinOriginPath(PRODUCTION_FALLBACK_ORIGIN, path)

  return joinOriginPath(DEV_FALLBACK_ORIGIN, path)
}

export function resolvePaytrSuccessUrlBase(configured?: string | null): string {
  return resolvePaytrReturnUrlBase(PAYTR_SUCCESS_PATH, configured)
}

export function resolvePaytrFailUrlBase(configured?: string | null): string {
  return resolvePaytrReturnUrlBase(PAYTR_FAIL_PATH, configured)
}
