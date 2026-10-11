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
 * Yenileme bağlantısının açılacağı katalog ürünü. MK Desktop'ta lisans platformuna uyan ürün seçilir;
 * platform bilinmiyorsa (eski lisans / eski Lisans Server) önceki davranış korunur ve platform varsayılmaz.
 */
export function selectDesktopRenewalCatalogProduct<T extends { slug: string }>(input: {
  appCode: string
  platform: DesktopEntitlementPlatform | null
  products: readonly T[]
}): T | null {
  if (input.appCode !== PRODUCT_CODE_MUVEKKIL_KASA_DESKTOP || !input.platform) {
    return input.products[0] ?? null
  }
  return input.products.find((p) => muvekkilKasaDesktopPlatformForSlug(p.slug) === input.platform) ?? null
}

/** Yenileme siparişindeki MK Desktop ürünleri oturumdaki lisans platformuyla uyumlu mu? Platform bilinmiyorsa kısıtlanmaz. */
export function isDesktopRenewalOrderPlatformAllowed(input: {
  appCode: string
  sessionPlatform: string | null | undefined
  productSlugs: readonly (string | null | undefined)[]
}): boolean {
  if (input.appCode !== PRODUCT_CODE_MUVEKKIL_KASA_DESKTOP) return true
  const expected = input.sessionPlatform === 'WINDOWS' || input.sessionPlatform === 'MACOS' ? input.sessionPlatform : null
  if (!expected) return true
  return (
    input.productSlugs.length > 0 &&
    input.productSlugs.every((slug) => muvekkilKasaDesktopPlatformForSlug(slug) === expected)
  )
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
