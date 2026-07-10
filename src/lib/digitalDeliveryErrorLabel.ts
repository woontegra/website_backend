import { isMuvekkilKasaSaasProduct, type MuvekkilKasaSaasProductRef } from './muvekkilKasaSaasProduct'
import { formatMkOwnerEmailDuplicateError } from './mkSaasDeliveryHelpers'

export function formatDigitalDeliveryLicenseError(
  product: MuvekkilKasaSaasProductRef | null | undefined,
  error: string,
): string {
  const normalized = formatMkOwnerEmailDuplicateError(error)
  if (isMuvekkilKasaSaasProduct(product)) {
    return `Müvekkil Kasa SaaS üyeliği oluşturulamadı: ${normalized}`
  }
  return `Merkezi lisans oluşturulamadı: ${error}`
}
