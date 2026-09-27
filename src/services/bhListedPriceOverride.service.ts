import { prisma } from '../lib/prisma'

const KEY = 'bh.listedProductPriceOverride'

export type BhListedPriceOverride = {
  /** Yıllık fiyat, kuruş. */
  price: number
  /** Aylık fiyat, kuruş. */
  priceMonthly: number
}

export function tlInputToKurus(value: unknown): number | null {
  if (value == null) return null
  const raw = String(value).trim().replace(/\s/g, '').replace(',', '.')
  if (!raw) return null
  const tl = Number(raw)
  if (!Number.isFinite(tl) || tl < 0) return null
  return Math.round(tl * 100)
}

export async function readBhListedPriceOverride(): Promise<BhListedPriceOverride | null> {
  const row = await prisma.siteSetting.findUnique({ where: { key: KEY } })
  if (!row?.value?.trim()) return null
  try {
    const parsed = JSON.parse(row.value) as { price?: unknown; priceMonthly?: unknown }
    const price = Number(parsed.price)
    const priceMonthly = Number(parsed.priceMonthly)
    if (!Number.isFinite(price) || !Number.isFinite(priceMonthly) || price < 0 || priceMonthly < 0) {
      return null
    }
    return { price, priceMonthly }
  } catch {
    return null
  }
}

/** Mevcut BH ürün alanları (price, priceMonthly). Yeni fiyat kolonu açmaz. */
export async function saveBhListedPriceOverrideFromTl(
  body: Record<string, unknown>,
): Promise<BhListedPriceOverride> {
  const price = tlInputToKurus(body.price)
  const priceMonthly = tlInputToKurus(body.priceMonthly ?? body.monthlyPrice)
  if (price == null || priceMonthly == null) {
    const err = new Error('Aylık ve yıllık fiyat geçerli olmalıdır.') as Error & { status: number }
    err.status = 400
    throw err
  }
  const value = JSON.stringify({ price, priceMonthly })
  await prisma.siteSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value },
    update: { value },
  })
  return { price, priceMonthly }
}

export async function clearBhListedPriceOverride(): Promise<void> {
  await prisma.siteSetting.deleteMany({ where: { key: KEY } })
}

export function mergeListedPriceOverride(data: unknown, override: BhListedPriceOverride | null): unknown {
  if (!override || !data || typeof data !== 'object') return data
  const apply = (row: Record<string, unknown>) => ({
    ...row,
    price: override.price,
    priceMonthly: override.priceMonthly,
    monthlyPrice: override.priceMonthly,
  })
  const obj = data as Record<string, unknown>
  if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
    return { ...obj, data: apply(obj.data as Record<string, unknown>) }
  }
  if ('price' in obj || 'priceMonthly' in obj || 'name' in obj) return apply(obj)
  return data
}
