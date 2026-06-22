import { ProductType } from '@prisma/client'

export type OrderLegalConsentFlags = {
  needsSoftwareLicense: boolean
  needsSaasSubscription: boolean
  needsDigitalProductWaiver: boolean
  needsDigitalServiceWaiver: boolean
}

export type OrderLegalConsentInput = {
  acceptPreInfo: boolean
  acceptDistanceSales: boolean
  acceptKvkk: boolean
  acceptSoftwareLicense?: boolean
  acceptSaasSubscription?: boolean
  acceptDigitalProductWaiver?: boolean
  acceptDigitalServiceWaiver?: boolean
}

export function resolveOrderLegalConsentFlags(productTypes: ProductType[]): OrderLegalConsentFlags {
  const hasDownload = productTypes.includes(ProductType.DOWNLOAD)
  const hasSaas = productTypes.includes(ProductType.SAAS)
  return {
    needsSoftwareLicense: hasDownload,
    needsSaasSubscription: hasSaas,
    needsDigitalProductWaiver: hasDownload,
    needsDigitalServiceWaiver: hasSaas,
  }
}

export function uniqueCartProductTypes(productTypes: ProductType[]): ProductType[] {
  const out: ProductType[] = []
  for (const t of productTypes) {
    if (!out.includes(t)) out.push(t)
  }
  return out
}

export function formatLegalCartProductTypes(productTypes: ProductType[]): string {
  return uniqueCartProductTypes(productTypes).join(',')
}

export function validateOrderLegalConsents(flags: OrderLegalConsentFlags, input: OrderLegalConsentInput): boolean {
  if (!input.acceptPreInfo || !input.acceptDistanceSales || !input.acceptKvkk) return false
  if (flags.needsSoftwareLicense && !input.acceptSoftwareLicense) return false
  if (flags.needsSaasSubscription && !input.acceptSaasSubscription) return false
  if (flags.needsDigitalProductWaiver && !input.acceptDigitalProductWaiver) return false
  if (flags.needsDigitalServiceWaiver && !input.acceptDigitalServiceWaiver) return false
  return true
}

export function orderLegalConsentErrorMessage(flags: OrderLegalConsentFlags): string {
  const missing: string[] = []
  if (flags.needsSoftwareLicense) missing.push('yazılım lisans sözleşmesi')
  if (flags.needsSaasSubscription) missing.push('SaaS abonelik sözleşmesi')
  if (flags.needsDigitalProductWaiver) missing.push('dijital ürün teslim onayı')
  if (flags.needsDigitalServiceWaiver) missing.push('dijital hizmet aktivasyon onayı')
  if (missing.length === 0) return 'Yasal onaylar eksik'
  return `Yasal onaylar eksik: ${missing.join(', ')}`
}
