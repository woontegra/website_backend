import type { Request } from 'express'
import rateLimit from 'express-rate-limit'

export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
export const RATE_LIMIT_MAX = 100
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

export function createGlobalRateLimiter() {
  if (process.env.NODE_ENV === 'production' && process.env.SMOKE_TEST_MODE === 'true') {
    console.warn('[rate-limit] SMOKE_TEST_MODE production ortamında yok sayıldı (güvenlik).')
  }

  const max = isSmokeTestMode() ? SMOKE_RATE_LIMIT_MAX : RATE_LIMIT_MAX

  return rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max,
    message: { success: false, message: 'Çok fazla istek. Lütfen daha sonra tekrar deneyin.' },
    skip: (req) => isSmokeTestBypass(req),
    standardHeaders: true,
    legacyHeaders: false,
  })
}
