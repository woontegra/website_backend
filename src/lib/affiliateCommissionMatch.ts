/**
 * Komisyon oluştururken: çerezdeki bağlantının ürünü ile sepet/sipariş ürünü eşleşmeli.
 * Yanlış ürün satışı (ör. masaüstü linki → SaaS satın alma) komisyon üretmez.
 */
export function isAffiliateCommissionEligibleForProduct(
  linkProductId: string | null | undefined,
  purchasedProductId: string | null | undefined,
): boolean {
  const linkId = typeof linkProductId === 'string' ? linkProductId.trim() : ''
  const purchasedId = typeof purchasedProductId === 'string' ? purchasedProductId.trim() : ''
  if (!linkId || !purchasedId) return false
  return linkId === purchasedId
}
