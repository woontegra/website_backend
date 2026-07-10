import { isMuvekkilKasaSaasProduct } from './muvekkilKasaSaasProduct'
import { isPublicFreeDownloadProduct } from './productDownloadFiles'

/** Harici satış — website sepeti / CustomerSaasMembership dışı */
const EXTERNAL_SALES_SLUGS = new Set(['bilirkisi-hesap'])

export type ManualSaasMembershipProductRef = {
  slug?: string | null
  productType?: string | null
  licenseRequired?: boolean | null
  licenseAppCode?: string | null
  isActive?: boolean | null
  purchaseEnabled?: boolean | null
  price?: unknown
}

/** Website DB üzerinde manuel CustomerSaasMembership oluşturulabilecek ürünler. */
export function isManualSaasMembershipProduct(
  product: ManualSaasMembershipProductRef | null | undefined,
): boolean {
  if (!product || product.isActive === false) return false

  const slug = product.slug?.trim().toLowerCase() ?? ''
  if (slug && EXTERNAL_SALES_SLUGS.has(slug)) return false

  if (
    isPublicFreeDownloadProduct({
      productType: product.productType ?? 'DOWNLOAD',
      purchaseEnabled: product.purchaseEnabled ?? true,
      price:
        typeof product.price === 'number'
          ? product.price
          : product.price != null
            ? Number(product.price)
            : 0,
    })
  ) {
    return false
  }

  if (product.productType === 'DOWNLOAD') return false

  if (isMuvekkilKasaSaasProduct(product)) return true

  return product.productType === 'SAAS' && !product.licenseRequired
}
