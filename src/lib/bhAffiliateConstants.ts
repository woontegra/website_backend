/** Shared constants for Bilirkişi Hesap × Woontegra affiliate bridge. */
export const BILIRKISI_HESAP_PRODUCT_SLUG = 'bilirkisi-hesap'

/**
 * Local-only synthetic Product row from early FAZ seed.
 * Must not appear in İş Ortakları product assignment picker.
 * Real assignable product is {@link BILIRKISI_HESAP_PRODUCT_SLUG}.
 */
export const BILIRKISI_HESAP_LOCAL_TEST_SLUG = 'test-bilirkisi-hesap-dev'

export function isBilirkisiHesapLocalTestProductSlug(slug: string | null | undefined): boolean {
  return String(slug || '').trim().toLowerCase() === BILIRKISI_HESAP_LOCAL_TEST_SLUG
}

/** Order.orderNo prefix — unique BH payment ledger rows in Woontegra. */
export const BH_AFFILIATE_ORDER_NO_PREFIX = 'BH-'

export function bhAffiliateOrderNo(merchantOid: string): string {
  return `${BH_AFFILIATE_ORDER_NO_PREFIX}${String(merchantOid || '').trim()}`
}

export function parseBhMerchantOidFromOrderNo(orderNo: string): string | null {
  const raw = String(orderNo || '')
  if (!raw.startsWith(BH_AFFILIATE_ORDER_NO_PREFIX)) return null
  const oid = raw.slice(BH_AFFILIATE_ORDER_NO_PREFIX.length).trim()
  return oid || null
}
