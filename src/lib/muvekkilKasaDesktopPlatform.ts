import type { DesktopEntitlementPlatform } from './desktopEntitlementPlatform'
import { PRODUCT_CODE_MUVEKKIL_KASA_DESKTOP } from './productCode'

export const MUVEKKIL_KASA_DESKTOP_WINDOWS_SLUG = 'muvekkil-kasa-defteri-yazilimi'
export const MUVEKKIL_KASA_DESKTOP_MACOS_SLUG = 'muvekkil-kasa-defteri-macos'

const PLATFORM_BY_SLUG: Readonly<Record<string, DesktopEntitlementPlatform>> = {
  [MUVEKKIL_KASA_DESKTOP_WINDOWS_SLUG]: 'WINDOWS',
  'muvekkil-kasa-defteri-desktop': 'WINDOWS',
  [MUVEKKIL_KASA_DESKTOP_MACOS_SLUG]: 'MACOS',
}

export function muvekkilKasaDesktopPlatformForSlug(slug: string | null | undefined): DesktopEntitlementPlatform | null {
  const key = (slug ?? '').trim().toLowerCase()
  return PLATFORM_BY_SLUG[key] ?? null
}

/**
 * Lisans Server /order-license için MK Desktop platformu.
 * macOS ürünü öncesindeki siparişler yalnız Windows olabildiğinden bilinmeyen slug WINDOWS sayılır.
 */
export function muvekkilKasaDesktopOrderLicenseExtras(input: {
  appCode: string
  productSlug: string | null | undefined
}): { platform?: DesktopEntitlementPlatform } {
  if (input.appCode !== PRODUCT_CODE_MUVEKKIL_KASA_DESKTOP) return {}
  return { platform: muvekkilKasaDesktopPlatformForSlug(input.productSlug) ?? 'WINDOWS' }
}
