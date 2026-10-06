import { createHash } from 'crypto'
import type { DesktopYearlyOffer } from './bhDesktopYearlyOffer'

export function hashDesktopPurchaseToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function isOpaqueDesktopPurchaseToken(raw: string): boolean {
  return TOKEN_PATTERN.test(raw) && !raw.includes('@') && !/^[a-fA-F0-9]{64}$/.test(raw)
}

export type PublicDesktopPurchaseQuote = {
  product: 'BILIRKISI_DESKTOP'
  platform: 'WINDOWS' | 'MACOS'
  period: 'yearly'
  purpose: 'FIRST_PURCHASE'
  fromTrial: boolean
  priceKurus: number
  licenseDays: number
  maxDevices: number
}

/** Browser'a yalnız allowlist döner. E-posta ve deviceHash taşınmaz. */
export function publicDesktopPurchaseQuote(
  upstream: Record<string, unknown>,
  offer: DesktopYearlyOffer,
): PublicDesktopPurchaseQuote | null {
  if (upstream.success !== true) return null
  if (upstream.appCode !== 'BILIRKISI_DESKTOP') return null
  if (upstream.purpose !== 'FIRST_PURCHASE') return null
  if (upstream.platform !== 'WINDOWS' && upstream.platform !== 'MACOS') return null
  if (upstream.platform !== offer.platform) return null
  return {
    product: 'BILIRKISI_DESKTOP',
    platform: offer.platform,
    period: 'yearly',
    purpose: 'FIRST_PURCHASE',
    fromTrial: true,
    priceKurus: offer.priceKurus,
    licenseDays: offer.licenseDays,
    maxDevices: offer.maxDevices,
  }
}

export function desktopPurchaseMayCreateLicense(status: string | null | undefined): boolean {
  return status === 'PAID' || status === 'PROCESSING'
}
