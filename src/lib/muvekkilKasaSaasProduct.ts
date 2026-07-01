import { normalizeLicenseAppCodeInput } from './licenseAppCode'

export const MUVEKKIL_KASA_SAAS_PRODUCT_CODE = 'MUVEKKIL_KASA_SAAS' as const

const MUVEKKIL_KASA_SAAS_SLUGS = new Set(['muvekkil-kasa-saas', 'muvekkil-kasa-defteri-saas', 'muvekkil-kasa-defteri-web-tabanli'])

export type MuvekkilKasaSaasProductRef = {
  slug?: string | null
  licenseAppCode?: string | null
}

export function isMuvekkilKasaSaasProduct(product: MuvekkilKasaSaasProductRef | null | undefined): boolean {
  if (!product) return false
  const slug = product.slug?.trim().toLowerCase()
  if (slug && MUVEKKIL_KASA_SAAS_SLUGS.has(slug)) return true
  const appCode = normalizeLicenseAppCodeInput(product.licenseAppCode)
  return appCode === MUVEKKIL_KASA_SAAS_PRODUCT_CODE
}
