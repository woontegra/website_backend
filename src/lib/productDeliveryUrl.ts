import { isDeliverableDownloadRawUrl } from './mailDeliveryUrl'
import { parseProductDownloadFiles } from './productDownloadFiles'

export type ProductDeliverySource = {
  downloadUrl?: string | null
  downloadMedia?: { url: string } | null
  downloadFiles?: unknown
}

/** Ürün teslimat URL önceliği: R2 downloadFiles → alternatif downloadUrl → medya kütüphanesi */
export function resolveProductDeliveryRawUrl(product: ProductDeliverySource): string {
  const media = (product.downloadMedia?.url ?? '').trim()
  const manual = (product.downloadUrl ?? '').trim()

  const config = parseProductDownloadFiles(product.downloadFiles)
  const setup = config.files.find((f) => f.type === 'setup' && f.url.trim())
  if (setup?.url.trim() && isDeliverableDownloadRawUrl(setup.url)) return setup.url.trim()

  for (const f of config.files) {
    const u = f.url.trim()
    if (u && isDeliverableDownloadRawUrl(u)) return u
  }

  if (manual && (!media || manual !== media) && isDeliverableDownloadRawUrl(manual)) {
    return manual
  }

  if (media && isDeliverableDownloadRawUrl(media)) return media
  if (manual && isDeliverableDownloadRawUrl(manual)) return manual

  return ''
}

export type OrderItemDeliverySource = {
  downloadUrl?: string | null
  product?: ProductDeliverySource | null
}

/** Sipariş satırı teslimat URL: güncel ürün kaynağı öncelikli, sipariş snapshot fallback */
export function resolveOrderItemDeliveryRawUrl(item: OrderItemDeliverySource): string {
  if (item.product) {
    const fromProduct = resolveProductDeliveryRawUrl(item.product)
    if (fromProduct.trim()) return fromProduct.trim()
  }
  return (item.downloadUrl ?? '').trim()
}
