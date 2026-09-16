import { ProductType } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { BILIRKISI_HESAP_PRODUCT_SLUG } from '../lib/bhAffiliateConstants'

/**
 * Catalog product for İş Ortakları assignment + /r/{code} landing.
 * Slug must match public route /yazilimlar/bilirkisi-hesap.
 */
export async function ensureBilirkisiHesapCatalogProduct() {
  const existing = await prisma.product.findUnique({
    where: { slug: BILIRKISI_HESAP_PRODUCT_SLUG },
  })
  if (existing) {
    if (!existing.isActive || !existing.purchaseEnabled) {
      return prisma.product.update({
        where: { id: existing.id },
        data: { isActive: true, purchaseEnabled: true },
      })
    }
    return existing
  }

  return prisma.product.create({
    data: {
      name: 'Bilirkişi Hesap',
      slug: BILIRKISI_HESAP_PRODUCT_SLUG,
      productType: ProductType.SAAS,
      shortDescription: 'Web tabanlı bilirkişi hesaplama yazılımı.',
      description:
        'Satın alma Woontegra üzerinden tamamlanır; lisans Bilirkişi Hesap panelinde oluşur.',
      price: 20000,
      currency: 'TRY',
      isActive: true,
      purchaseEnabled: true,
      licenseRequired: false,
      licenseMonths: 12,
      isFeatured: true,
      sortOrder: 0,
    },
  })
}
