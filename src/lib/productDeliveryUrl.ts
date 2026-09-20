import { canonicalizeKoopPlusSalesInstallerUrl } from './koopplusSalesInstaller'
import { isDeliverableDownloadRawUrl } from './mailDeliveryUrl'
import { parseProductDownloadFiles } from './productDownloadFiles'

export type ProductDeliverySource = {
  downloadUrl?: string | null
  downloadMedia?: { url: string } | null
  downloadFiles?: unknown
}

function filenameFromUrl(url: string): string {
  const raw = url.trim()
  if (!raw) return ''
  try {
    return decodeURIComponent(new URL(raw).pathname.split('/').pop() || '').toLowerCase()
  } catch {
    const tail = raw.split(/[\\/]/).pop() || ''
    try {
      return decodeURIComponent(tail).toLowerCase()
    } catch {
      return tail.toLowerCase()
    }
  }
}

/** Auto-update metadata satış installer’ı değildir. */
export function isNonSalesDeliveryUrl(url: string | null | undefined): boolean {
  const raw = (url ?? '').trim()
  if (!raw) return false
  const lower = raw.toLowerCase()
  if (lower.includes('/updates/koopplus-aidat-takip/')) return true
  const name = filenameFromUrl(raw)
  if (!name) return false
  if (name === 'latest.yml' || name === 'latest-mac.yml' || name === 'latest-linux.yml') return true
  if (name.endsWith('.blockmap')) return true
  return false
}

function isUsableSalesDeliveryUrl(url: string | null | undefined): boolean {
  const raw = (url ?? '').trim()
  if (!raw) return false
  if (isNonSalesDeliveryUrl(raw)) return false
  return isDeliverableDownloadRawUrl(raw)
}

/** Ürün teslimat URL önceliği: R2 downloadFiles → alternatif downloadUrl → medya kütüphanesi */
export function resolveProductDeliveryRawUrl(product: ProductDeliverySource): string {
  const media = (product.downloadMedia?.url ?? '').trim()
  const manual = (product.downloadUrl ?? '').trim()

  const config = parseProductDownloadFiles(product.downloadFiles)
  const setup = config.files.find((f) => f.type === 'setup' && f.url.trim())
  if (setup?.url.trim() && isUsableSalesDeliveryUrl(setup.url)) {
    return canonicalizeKoopPlusSalesInstallerUrl(setup.url.trim())
  }

  for (const f of config.files) {
    const u = f.url.trim()
    if (u && isUsableSalesDeliveryUrl(u)) return canonicalizeKoopPlusSalesInstallerUrl(u)
  }

  if (manual && (!media || manual !== media) && isUsableSalesDeliveryUrl(manual)) {
    return canonicalizeKoopPlusSalesInstallerUrl(manual)
  }

  if (media && isUsableSalesDeliveryUrl(media)) return canonicalizeKoopPlusSalesInstallerUrl(media)
  if (manual && isUsableSalesDeliveryUrl(manual)) return canonicalizeKoopPlusSalesInstallerUrl(manual)

  return ''
}

export function productHasAnyDownloadSource(product: ProductDeliverySource): boolean {
  if ((product.downloadUrl ?? '').trim()) return true
  if ((product.downloadMedia?.url ?? '').trim()) return true
  const config = parseProductDownloadFiles(product.downloadFiles)
  return config.files.some((f) => f.url.trim())
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
  return canonicalizeKoopPlusSalesInstallerUrl((item.downloadUrl ?? '').trim())
}
