import type { Request } from 'express'
import rateLimit from 'express-rate-limit'

export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
export const RATE_LIMIT_MAX = 300
/** Smoke/test ortamında tekrarlanabilir suite'ler için üst sınır (header bypass dışı istekler) */
export const SMOKE_RATE_LIMIT_MAX = 10_000

export function isSmokeTestMode(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.SMOKE_TEST_MODE === 'true'
}

/** Yalnızca non-production + SMOKE_TEST_MODE + x-smoke-test: true iken rate limit sayılmaz */
export function isSmokeTestBypass(req: Request): boolean {
  if (!isSmokeTestMode()) return false
  return req.get('x-smoke-test') === 'true'
}

function requestPath(req: Request): string {
  const u = req.originalUrl ?? req.url ?? ''
  return u.split('?')[0] || req.path || ''
}

/**
 * Lokal geliştirmede global limit kapalı.
 * Production'da yoğun public GET'ler ve PayTR callback limit dışı (kalan route'lar RATE_LIMIT_MAX / pencere).
 */
export function shouldSkipGlobalRateLimit(req: Request): boolean {
  if (isSmokeTestBypass(req)) return true
  if (process.env.NODE_ENV !== 'production') return true

  const method = (req.method || 'GET').toUpperCase()
  const p = requestPath(req)

  if (method === 'POST' && p === '/api/payments/paytr/callback') return true

  if (method === 'GET') {
    if (p.startsWith('/uploads/')) return true
    if (p === '/api/settings' || p.startsWith('/api/settings/')) return true
    if (p.startsWith('/api/page-content')) return true
    if (p.startsWith('/api/orders/success/')) return true
    if (p.startsWith('/api/products')) return true
    if (p.startsWith('/api/product-categories')) return true
    if (p.startsWith('/api/navigation-menu')) return true
    if (p.startsWith('/api/legal-documents')) return true
    if (p === '/api/health') return true
  }

  return false
}

export function createGlobalRateLimiter() {
  if (process.env.NODE_ENV === 'production' && process.env.SMOKE_TEST_MODE === 'true') {
    console.warn('[rate-limit] SMOKE_TEST_MODE production ortamında yok sayıldı (güvenlik).')
  }

  const max = isSmokeTestMode() ? SMOKE_RATE_LIMIT_MAX : RATE_LIMIT_MAX

  return rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max,
    message: { success: false, message: 'Çok fazla istek. Lütfen daha sonra tekrar deneyin.' },
    skip: (req) => shouldSkipGlobalRateLimit(req),
    standardHeaders: true,
    legacyHeaders: false,
  })
}

/** Masaüstü lisans aktivasyonu / doğrulama — brute-force için ayrı sıkı limit. */
export function createLicensePublicRateLimiter() {
  const max = isSmokeTestMode() ? 2_000 : 40
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    message: { success: false, message: 'Çok fazla deneme. Lütfen bir süre sonra tekrar deneyin.' },
    skip: (req) => isSmokeTestBypass(req),
    standardHeaders: true,
    legacyHeaders: false,
  })
}