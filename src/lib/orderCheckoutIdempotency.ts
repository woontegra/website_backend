/**
 * Checkout işlem anahtarı — çift sipariş / çift mail engeli.
 * DB: Order.checkoutIdempotencyKey UNIQUE (NULL serbest; eski siparişler).
 */

const KEY_RE = /^[A-Za-z0-9_-]{16,128}$/

export function normalizeCheckoutIdempotencyKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  if (!KEY_RE.test(t)) return null
  return t
}

export function isCheckoutIdempotencyUniqueTarget(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; meta?: { target?: string | string[] } }
  if (e.code !== 'P2002') return false
  const target = e.meta?.target
  if (!target) return false
  const parts = Array.isArray(target) ? target : [target]
  return parts.some((p) => String(p).includes('checkoutIdempotencyKey'))
}
