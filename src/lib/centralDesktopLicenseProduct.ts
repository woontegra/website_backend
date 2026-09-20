import { ProductType } from '@prisma/client'
import { isValidLicenseAppCodeFormat, normalizeLicenseAppCodeInput } from './licenseAppCode'
import { isMuvekkilKasaDesktopCentralLicenseProduct } from './muvekkilKasaDesktopProduct'
import { isMuvekkilKasaSaasProduct } from './muvekkilKasaSaasProduct'

export type CentralDesktopLicenseProductRef = {
  slug?: string | null
  licenseAppCode?: string | null
  licenseRequired?: boolean | null
  productType?: string | null
  isActive?: boolean | null
}

const KNOWN_SAAS_APP_CODES = new Set(['MUVEKKIL_KASA_SAAS'])

export function isKnownSaasLicenseAppCode(appCode: string | null | undefined): boolean {
  return KNOWN_SAAS_APP_CODES.has(normalizeLicenseAppCodeInput(appCode))
}

/**
 * Website masaüstü yenileme eligibility — Product kaydından türetilir.
 * Her appCode körlemesine kabul edilmez: DOWNLOAD + licenseRequired + geçerli appCode.
 * MK slug-only fallback yalnızca appCode boş eski satırlar içindir.
 */
export function isCentralDesktopLicenseProduct(
  product: CentralDesktopLicenseProductRef | null | undefined,
): boolean {
  if (!product) return false
  if (isMuvekkilKasaSaasProduct({ slug: product.slug, licenseAppCode: product.licenseAppCode })) {
    return false
  }
  if (product.productType != null && product.productType !== ProductType.DOWNLOAD) return false
  if (product.licenseRequired !== true) return false

  const appCode = normalizeLicenseAppCodeInput(product.licenseAppCode)
  if (appCode) {
    if (isKnownSaasLicenseAppCode(appCode)) return false
    return isValidLicenseAppCodeFormat(appCode)
  }

  return isMuvekkilKasaDesktopCentralLicenseProduct({
    slug: product.slug,
    licenseRequired: true,
    productType: product.productType ?? ProductType.DOWNLOAD,
  })
}

export function desktopRenewalPurchasePath(slug: string): string {
  const normalized = slug.trim().replace(/^\//, '').toLowerCase()
  return `/yazilimlar/${normalized}`
}

export function isDesktopRenewalOpenSuccessful(open: { licenseId?: string | null }): boolean {
  return Boolean(open.licenseId?.trim())
}

export function buildDesktopWebsiteRenewLicensePayload(input: {
  orderNo: string
  licenseKey: string
  licenseId?: string | null
  appCode: string
  licenseDays: number
}): {
  orderNo: string
  licenseKey: string
  licenseId?: string
  appCode: string
  licenseDays: number
} {
  return {
    orderNo: input.orderNo,
    licenseKey: input.licenseKey,
    licenseId: input.licenseId ?? undefined,
    appCode: normalizeLicenseAppCodeInput(input.appCode),
    licenseDays: Math.max(1, Math.floor(input.licenseDays)),
  }
}
