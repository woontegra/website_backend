import { formatMkOwnerEmailDuplicateError } from './mkSaasDeliveryHelpers'
import { isMuvekkilKasaSaasProduct, type MuvekkilKasaSaasProductRef } from './muvekkilKasaSaasProduct'

export function formatDigitalDeliveryLicenseError(
  product: MuvekkilKasaSaasProductRef | null | undefined,
  error: string,
): string {
  const normalized = formatMkOwnerEmailDuplicateError(error)
  if (isMuvekkilKasaSaasProduct(product)) {
    return `Ödeme alındı, lisans oluşturulamadı: Müvekkil Kasa SaaS — ${normalized}`
  }
  return `Ödeme alındı, lisans oluşturulamadı: ${normalized}`
}
