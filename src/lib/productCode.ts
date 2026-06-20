import { ProductType } from '@prisma/client'

export const PRODUCT_CODE_MUVEKKIL_KASA_DESKTOP = 'MUVEKKIL_KASA_DESKTOP'
export const PRODUCT_SLUG_MUVEKKIL_KASA_DESKTOP = 'muvekkil-kasa-defteri-desktop'

export function resolveProductCodeFromProduct(input: {
  slug: string | null | undefined
  productType: ProductType
}): string | null {
  const slug = (input.slug ?? '').trim().toLowerCase()
  if (input.productType === ProductType.SAAS) return null
  if (slug === PRODUCT_SLUG_MUVEKKIL_KASA_DESKTOP) return PRODUCT_CODE_MUVEKKIL_KASA_DESKTOP
  if (input.productType === ProductType.DOWNLOAD && slug) {
    return slug.toUpperCase().replace(/-/g, '_')
  }
  return null
}

export function isValidDesktopAppCode(appCode: string | null | undefined): boolean {
  const c = (appCode ?? '').trim()
  return c === PRODUCT_CODE_MUVEKKIL_KASA_DESKTOP
}

export function productCodeLabel(code: string | null | undefined): string {
  if (code === PRODUCT_CODE_MUVEKKIL_KASA_DESKTOP) return 'Müvekkil Kasa Defteri Masaüstü'
  return code?.trim() || 'Masaüstü program'
}
