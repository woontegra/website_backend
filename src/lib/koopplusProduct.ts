/** KoopPlus SaaS ürün tespiti (slug tabanlı). */

export const KOOPPLUS_PRODUCT_SLUG = 'koopplus'

const BUILTIN_KOOPPLUS_SLUGS = [
  'koopplus',
  'koopplus-saas',
  'kooperatif-yonetim-yazilimi',
  'koopplus-kooperatif-yonetim-yazilimi',
]

function configuredSlugs(): Set<string> {
  const set = new Set(BUILTIN_KOOPPLUS_SLUGS)
  const extra = (process.env.KOOPPLUS_PRODUCT_SLUGS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  for (const s of extra) set.add(s)
  return set
}

/** Yapılandırılmış bütün KoopPlus ürün slug'ları. */
export function koopPlusSlugs(): string[] {
  return [...configuredSlugs()]
}

export function isKoopPlusSlug(slug: string | null | undefined): boolean {
  const s = (slug ?? '').trim().toLowerCase()
  return Boolean(s) && configuredSlugs().has(s)
}

export type KoopPlusProductRef = {
  slug?: string | null
  productSlug?: string | null
  product?: { slug?: string | null } | null
}

/** Ürün veya sipariş satırı (`productSlug` / `product.slug`) KoopPlus mu? */
export function isKoopPlusProduct(ref: KoopPlusProductRef | null | undefined): boolean {
  if (!ref) return false
  return isKoopPlusSlug(ref.slug) || isKoopPlusSlug(ref.productSlug) || isKoopPlusSlug(ref.product?.slug)
}

const LICENSE_KEY_RE = /^[A-Z0-9][A-Z0-9-]{5,63}$/

/** Checkout'tan gelen yenileme lisans anahtarını normalize eder; geçersizse null. */
export function normalizeKoopPlusLicenseKey(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().toUpperCase()
  return LICENSE_KEY_RE.test(v) ? v : null
}
