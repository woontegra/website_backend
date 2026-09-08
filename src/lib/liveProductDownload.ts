import { resolveMailDownloadHref } from './mailDeliveryUrl'
import {
  resolveOrderItemDeliveryRawUrl,
  type OrderItemDeliverySource,
  type ProductDeliverySource,
} from './productDeliveryUrl'

/** Güncel indirme dosyası yokken hesap/e-posta için kullanıcıya gösterilecek metin. */
export const DOWNLOAD_FILE_UNAVAILABLE_TR =
  'Bu ürün için güncel indirme dosyası henüz tanımlı değil. Lütfen destek ekibimizle iletişime geçin (destek@woontegra.com).'

export type CustomerFacingDownload = {
  /** Doğrudan public teslimat URL (downloadFiles / ürün kaydı). İmzalı proxy değil. */
  href: string | null
  unavailableMessage: string | null
}

/**
 * Sipariş satırı için müşteriye gösterilecek indirme adresi.
 * Kaynak: ürün kaydındaki güncel teslimat (downloadFiles öncelikli).
 * `/api/downloads/order/...` üretilmez.
 */
export function resolveCustomerFacingDownload(item: OrderItemDeliverySource): CustomerFacingDownload {
  const raw = resolveOrderItemDeliveryRawUrl(item).trim()
  if (raw.startsWith('saas:')) {
    return { href: null, unavailableMessage: null }
  }
  if (!raw) {
    return { href: null, unavailableMessage: DOWNLOAD_FILE_UNAVAILABLE_TR }
  }
  const href = resolveMailDownloadHref(raw)
  if (href && !href.includes('/api/downloads/order/')) {
    return { href, unavailableMessage: null }
  }
  return { href: null, unavailableMessage: DOWNLOAD_FILE_UNAVAILABLE_TR }
}

/** E-posta “Programı İndir” — canlı ürün teslimat URL; imzalı proxy yok. */
export function resolveLiveProductMailDownloadHref(
  productDeliveryRawUrl: string | null | undefined,
): string | null {
  const href = resolveMailDownloadHref(productDeliveryRawUrl)
  if (!href || href.includes('/api/downloads/order/')) return null
  return href
}

export function productHasLiveDownloadFile(product: ProductDeliverySource | null | undefined): boolean {
  if (!product) return false
  return Boolean(resolveCustomerFacingDownload({ product }).href)
}
