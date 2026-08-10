import { PRODUCT_CODE_MUVEKKIL_KASA_DESKTOP } from './productCode'

const MK_DESKTOP_SLUGS = new Set([
  'muvekkil-kasa-defteri-yazilimi',
  'muvekkil-kasa-defteri-desktop',
])

export type MuvekkilKasaDesktopProductRef = {
  slug?: string | null
  licenseAppCode?: string | null
  licenseRequired?: boolean | null
  productType?: string | null
}

export function isMuvekkilKasaDesktopCentralLicenseProduct(
  product: MuvekkilKasaDesktopProductRef | null | undefined,
): boolean {
  if (!product) return false
  if (product.licenseRequired !== true) return false
  const appCode = product.licenseAppCode?.trim()
  if (appCode === PRODUCT_CODE_MUVEKKIL_KASA_DESKTOP) return true
  const slug = product.slug?.trim().toLowerCase()
  return Boolean(slug && MK_DESKTOP_SLUGS.has(slug))
}

export const MUVEKKIL_KASA_DESKTOP_PRODUCT_SLUG = 'muvekkil-kasa-defteri-yazilimi'

export function mkDesktopProductPath(): string {
  return `/yazilimlar/${MUVEKKIL_KASA_DESKTOP_PRODUCT_SLUG}`
}
