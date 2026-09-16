/**
 * Shared secret headers identifying Woontegra → BH sales-channel calls.
 * Used for PayTR browser return URLs (Woontegra paths) and renewal-by-email.
 */
export function buildWoontegraBhSalesChannelHeaders(): Record<string, string> {
  const secret = (process.env.WOONTEGRA_BH_AFFILIATE_BRIDGE_SECRET || '').trim()
  if (!secret) return {}
  return {
    'X-Woontegra-Sales-Channel-Secret': secret,
    // Affiliate resolve also accepts this header as channel trust signal.
    'X-Woontegra-Affiliate-Secret': secret,
  }
}

/** Public site origin for PayTR browser returns (no trailing slash). */
export function resolveWoontegraPublicSiteOrigin(): string {
  const raw = (
    process.env.PUBLIC_SITE_URL ||
    process.env.FRONTEND_PUBLIC_URL ||
    process.env.WOONTEGRA_PUBLIC_SITE_URL ||
    ''
  ).trim()
  if (raw) return raw.replace(/\/+$/, '')
  if (process.env.NODE_ENV === 'production') return 'https://woontegra.com'
  return 'http://localhost:5175'
}
