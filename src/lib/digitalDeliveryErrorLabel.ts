import { isMuvekkilKasaSaasProduct, type MuvekkilKasaSaasProductRef } from './muvekkilKasaSaasProduct'

export function formatDigitalDeliveryLicenseError(
  product: MuvekkilKasaSaasProductRef | null | undefined,
  error: string,
): string {
  if (isMuvekkilKasaSaasProduct(product)) {
    return `Müvekkil Kasa SaaS üyeliği oluşturulamadı: ${error}`
  }
  return `Merkezi lisans oluşturulamadı: ${error}`
}
