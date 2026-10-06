/**
 * Masaüstü yıllık fiyat, web abonelik price / priceMonthly alanlarından ayrıdır.
 * Kuruş. Public ürün yanıtında alan yoksa bu katalog değeri kullanılır.
 * Production veritabanına yazılmaz.
 */
export const BH_DESKTOP_YEARLY_PRICE_KURUS = 1_500_000
export const BH_DESKTOP_LICENSE_DAYS = 365
export const BH_DESKTOP_MAX_DEVICES = 1

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function finiteKurus(value: unknown): number | null {
  const amount = typeof value === 'number' ? value : Number.NaN
  if (!Number.isFinite(amount) || amount < 0) return null
  return amount
}

function finitePositiveInt(value: unknown): number | null {
  const amount = typeof value === 'number' ? value : Number.NaN
  if (!Number.isInteger(amount) || amount < 1) return null
  return amount
}

function applyRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    windowsPriceYearly: finiteKurus(row.windowsPriceYearly) ?? BH_DESKTOP_YEARLY_PRICE_KURUS,
    macosPriceYearly: finiteKurus(row.macosPriceYearly) ?? BH_DESKTOP_YEARLY_PRICE_KURUS,
    windowsLicenseDays: finitePositiveInt(row.windowsLicenseDays) ?? BH_DESKTOP_LICENSE_DAYS,
    macosLicenseDays: finitePositiveInt(row.macosLicenseDays) ?? BH_DESKTOP_LICENSE_DAYS,
    windowsDeviceLimit: finitePositiveInt(row.windowsDeviceLimit) ?? BH_DESKTOP_MAX_DEVICES,
    macosDeviceLimit: finitePositiveInt(row.macosDeviceLimit) ?? BH_DESKTOP_MAX_DEVICES,
  }
}

/** SaaS price / priceMonthly değerlerine dokunmaz. Aylık masaüstü fiyatı eklemez. */
export function applyBhDesktopYearlyOffer(data: unknown): unknown {
  const root = asRecord(data)
  if (!root) return data
  const nested = asRecord(root.data)
  if (nested) return { ...root, data: applyRow(nested) }
  if ('price' in root || 'name' in root || 'windowsPriceYearly' in root) return applyRow(root)
  return data
}

export type DesktopYearlyOffer = {
  platform: 'WINDOWS' | 'MACOS'
  priceKurus: number
  licenseDays: number
  maxDevices: number
}

/** Tek fiyat kaynağı windowsPriceYearly / macosPriceYearly. SaaS price alanları okunmaz. */
export function selectDesktopYearlyOffer(
  product: unknown,
  platform: 'WINDOWS' | 'MACOS',
): DesktopYearlyOffer | null {
  const applied = applyBhDesktopYearlyOffer(product)
  const root = asRecord(applied)
  const row = asRecord(root?.data) ?? root
  if (!row) return null
  const prefix = platform === 'WINDOWS' ? 'windows' : 'macos'
  const priceKurus = finiteKurus(row[`${prefix}PriceYearly`])
  const licenseDays = finitePositiveInt(row[`${prefix}LicenseDays`])
  const maxDevices = finitePositiveInt(row[`${prefix}DeviceLimit`])
  if (priceKurus == null || priceKurus <= 0 || licenseDays == null || maxDevices == null) return null
  return { platform, priceKurus, licenseDays, maxDevices }
}
