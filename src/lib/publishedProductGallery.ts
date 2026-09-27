function galleryUrlsFromBlock(block: unknown): string[] {
  if (!block || typeof block !== 'object') return []
  const row = block as { type?: unknown; settings?: { gallery?: unknown } }
  if (row.type !== 'product-detail') return []
  if (!Array.isArray(row.settings?.gallery)) return []
  const urls: string[] = []
  for (const item of row.settings.gallery) {
    if (!item || typeof item !== 'object') continue
    const url = (item as { url?: unknown }).url
    if (typeof url === 'string' && url.trim()) urls.push(url.trim())
  }
  return urls
}

function pageRecord(content: unknown, slug: string): unknown {
  if (!content || typeof content !== 'object') return null
  const root = content as Record<string, unknown>
  const pages =
    root.pages && typeof root.pages === 'object' ? (root.pages as Record<string, unknown>) : root
  return pages[slug] ?? null
}

/** Yayınlanmış ürün sayfası galerisi. Kapak alanından bağımsız public görseller. */
export function publishedProductGalleryUrls(content: unknown, slug: string): string[] {
  const key = slug.trim()
  if (!key) return []
  const page = pageRecord(content, key)
  if (!page || typeof page !== 'object') return []
  const blocks = (page as { blocks?: unknown }).blocks
  if (!Array.isArray(blocks)) return []
  const urls: string[] = []
  for (const block of blocks) urls.push(...galleryUrlsFromBlock(block))
  return urls
}
