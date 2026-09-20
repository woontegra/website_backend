export const PRODUCT_GALLERY_MAX_IMAGES = 10

/** Admin’den gelen medya id listesini sırayı koruyarak tekilleştirir ve üst sınırı uygular. */
export function normalizeProductGalleryMediaIds(mediaIds: string[] | null | undefined): string[] {
  const ordered: string[] = []
  const seen = new Set<string>()
  for (const raw of mediaIds ?? []) {
    const id = String(raw ?? '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    ordered.push(id)
    if (ordered.length >= PRODUCT_GALLERY_MAX_IMAGES) break
  }
  return ordered
}

export function publicProductScreenshotAlt(productName: string, index: number, total: number): string {
  const name = productName.trim() || 'Ürün'
  const base = `${name} ekran görüntüsü`
  return total > 1 ? `${base} ${index + 1}` : base
}
