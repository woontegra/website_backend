import { ProductType } from '@prisma/client'
import { isDeliverableDownloadRawUrl } from './mailDeliveryUrl'

/** SaaS dışında tek lisans/adet: masaüstü, merkezi lisans, hizmet. */
export function isSingleLicenseQuantityProduct(p: {
  productType: ProductType
  licenseRequired?: boolean
}): boolean {
  if (p.productType === ProductType.SAAS) return false
  if (p.licenseRequired === true) return true
  if (p.productType === ProductType.DOWNLOAD) return true
  if (p.productType === ProductType.SERVICE) return true
  return false
}

export function assertSingleLicenseQuantityOrThrow(
  p: { productType: ProductType; licenseRequired: boolean; name: string },
  quantity: number,
): void {
  if (!isSingleLicenseQuantityProduct(p)) return
  const q = Math.floor(Number(quantity)) || 1
  if (q > 1) {
    const err = new Error('ORDER_QUANTITY_INVALID') as Error & { status: number; publicMessage?: string }
    err.status = 400
    err.publicMessage = `“${p.name}” yalnızca tek lisans olarak satın alınabilir.`
    throw err
  }
}

export type ProductOrderCheckRow = {
  id: string
  slug: string | null
  name: string
  isActive: boolean
  productType: ProductType
  purchaseEnabled: boolean
  downloadUrl: string | null
  downloadMedia: { url: string } | null
}

export type ProductOrderDenial =
  | 'inactive'
  | 'not_found'
  | 'purchase_disabled'
  | 'download_missing'
  | 'download_unresolvable'
  | 'unsupported_product_type'

export function getProductOrderDenialReason(p: ProductOrderCheckRow): ProductOrderDenial | null {
  if (!p.isActive) return 'inactive'
  if (p.productType === ProductType.DOWNLOAD) {
    const u = (p.downloadUrl?.trim() || p.downloadMedia?.url?.trim() || '') || ''
    if (!u) return 'download_missing'
    if (!isDeliverableDownloadRawUrl(u)) return 'download_unresolvable'
    return null
  }
  if (p.productType === ProductType.SAAS || p.productType === ProductType.SERVICE) {
    if (p.purchaseEnabled === false) return 'purchase_disabled'
    return null
  }
  return 'unsupported_product_type'
}

export function denialReasonLabel(reason: ProductOrderDenial): string {
  switch (reason) {
    case 'inactive':
      return 'ürün pasif'
    case 'not_found':
      return 'ürün bulunamadı'
    case 'purchase_disabled':
      return 'satın alma kapalı (purchaseEnabled=false)'
    case 'download_missing':
      return 'indirme bağlantısı tanımlı değil'
    case 'download_unresolvable':
      return 'indirme bağlantısı satın alma için kullanılamıyor'
    case 'unsupported_product_type':
      return 'desteklenmeyen ürün tipi'
    default:
      return reason
  }
}
