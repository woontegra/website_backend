/**
 * KoopPlus adetli satış fiyatı.
 *
 * Kurallar (platform sahibinin kararı):
 * - Bir hesabın ilk kooperatifi: KoopPlus ürününün fiyatı (yönetim paneli → Ürünler).
 * - Her ek kooperatif: "Ek kooperatif fiyatı" (yönetim paneli → KoopPlus fiyat ayarı; varsayılan 5.000 ₺).
 * - Aktif yıllık kooperatifi olan müşteri yeni alım yaparsa bütün adetler ek kooperatif fiyatından.
 * - Lisans anahtarıyla yenilemede: hesabın ilk kooperatifi ilk fiyattan, diğerleri ek fiyattan.
 *
 * Tutar her zaman SUNUCUDA hesaplanır; tarayıcıdan gelen tutara güvenilmez.
 */
import { prisma } from '../lib/prisma'
import { postKoopPlusJson } from '../lib/koopplusIntegration'
import { normalizeKoopPlusLicenseKey } from '../lib/koopplusProduct'

const KEY = 'koopplus.pricing'
export const KOOPPLUS_DEFAULT_ADDITIONAL_PRICE_TL = 5000
export const KOOPPLUS_MAX_QUANTITY = 20

export type KoopPlusPricingSettings = {
  /** Ek kooperatif fiyatı (TL, KDV dahil, yıllık). */
  additionalPrice: number
}

function parseTl(value: unknown): number | null {
  if (value == null) return null
  let raw = String(value).trim().replace(/\s/g, '')
  // "5.000,50" → 5000.50 ; "5000.5" → 5000.5
  if (raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.')
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return null
  return Math.round(n * 100) / 100
}

export async function readKoopPlusPricingSettings(): Promise<KoopPlusPricingSettings> {
  const row = await prisma.siteSetting.findUnique({ where: { key: KEY } })
  if (row?.value?.trim()) {
    try {
      const parsed = JSON.parse(row.value) as { additionalPrice?: unknown }
      const n = Number(parsed.additionalPrice)
      if (Number.isFinite(n) && n >= 0) return { additionalPrice: n }
    } catch {
      /* varsayılan */
    }
  }
  return { additionalPrice: KOOPPLUS_DEFAULT_ADDITIONAL_PRICE_TL }
}

export async function saveKoopPlusPricingSettings(body: Record<string, unknown>): Promise<KoopPlusPricingSettings> {
  const additionalPrice = parseTl(body.additionalPrice)
  if (additionalPrice == null) {
    const err = new Error('Ek kooperatif fiyatı geçerli bir tutar olmalıdır.') as Error & { status: number }
    err.status = 400
    throw err
  }
  const value = JSON.stringify({ additionalPrice })
  await prisma.siteSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value },
    update: { value },
  })
  return { additionalPrice }
}

export function clampKoopPlusQuantity(value: unknown): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(KOOPPLUS_MAX_QUANTITY, n)
}

export type KoopPlusLinePrice = {
  quantity: number
  /** İlk kooperatif fiyatından hesaplanan adet (0 veya 1). */
  firstUnits: number
  additionalUnits: number
  firstPrice: number
  additionalPrice: number
  total: number
  /** "1 × 9.000 ₺ + 2 × 5.000 ₺" gibi döküm için. */
  reason: 'new_customer' | 'existing_customer' | 'renewal_first' | 'renewal_additional'
}

/** Saf hesap: test edilebilir. */
export function computeKoopPlusLinePrice(input: {
  quantity: number
  firstPrice: number
  additionalPrice: number
  hasActiveYearlyCooperative: boolean
  renewalTier: 'first' | 'additional' | null
}): KoopPlusLinePrice {
  const quantity = clampKoopPlusQuantity(input.quantity)
  let firstUnits: number
  let reason: KoopPlusLinePrice['reason']
  if (input.renewalTier) {
    firstUnits = input.renewalTier === 'first' ? 1 : 0
    reason = input.renewalTier === 'first' ? 'renewal_first' : 'renewal_additional'
  } else if (input.hasActiveYearlyCooperative) {
    firstUnits = 0
    reason = 'existing_customer'
  } else {
    firstUnits = 1
    reason = 'new_customer'
  }
  const additionalUnits = quantity - firstUnits
  const total = Math.round((firstUnits * input.firstPrice + additionalUnits * input.additionalPrice) * 100) / 100
  return {
    quantity,
    firstUnits,
    additionalUnits,
    firstPrice: input.firstPrice,
    additionalPrice: input.additionalPrice,
    total,
    reason,
  }
}

export type KoopPlusQuote = {
  hasActiveYearlyCooperative: boolean
  renewalTier: 'first' | 'additional' | null
  /** KoopPlus'a ulaşılamadıysa false (yeni müşteri fiyatı uygulanır). */
  reachable: boolean
}

/** KoopPlus'a sorar: e-postanın aktif yıllık kooperatifi var mı / yenilenecek kooperatif ilk mi. */
export async function fetchKoopPlusQuote(input: {
  email?: string | null
  licenseKey?: string | null
}): Promise<KoopPlusQuote> {
  const email = (input.email ?? '').trim().toLowerCase()
  const licenseKey = normalizeKoopPlusLicenseKey(input.licenseKey)
  if (!email && !licenseKey) return { hasActiveYearlyCooperative: false, renewalTier: null, reachable: true }
  try {
    const res = await postKoopPlusJson('/api/integrations/quote', {
      ...(email ? { email } : {}),
      ...(licenseKey ? { licenseKey } : {}),
    })
    const data = (res.json as { data?: unknown } | null)?.data as
      | { hasActiveYearlyCooperative?: unknown; license?: { found?: unknown; tier?: unknown } | null }
      | undefined
    if (!res.ok || !data) return { hasActiveYearlyCooperative: false, renewalTier: null, reachable: false }
    const lic = data.license
    const renewalTier =
      licenseKey && lic && lic.found === true && (lic.tier === 'first' || lic.tier === 'additional')
        ? (lic.tier as 'first' | 'additional')
        : null
    return { hasActiveYearlyCooperative: data.hasActiveYearlyCooperative === true, renewalTier, reachable: true }
  } catch {
    return { hasActiveYearlyCooperative: false, renewalTier: null, reachable: false }
  }
}

/** Sipariş / fiyat sorgusu için tek giriş noktası. */
export async function priceKoopPlusLine(input: {
  quantity: number
  firstPrice: number
  email?: string | null
  licenseKey?: string | null
}): Promise<KoopPlusLinePrice & { quote: KoopPlusQuote }> {
  const [settings, quote] = await Promise.all([
    readKoopPlusPricingSettings(),
    fetchKoopPlusQuote({ email: input.email, licenseKey: input.licenseKey }),
  ])
  const price = computeKoopPlusLinePrice({
    quantity: input.quantity,
    firstPrice: input.firstPrice,
    additionalPrice: settings.additionalPrice,
    hasActiveYearlyCooperative: quote.hasActiveYearlyCooperative,
    renewalTier: quote.renewalTier,
  })
  return { ...price, quote }
}
