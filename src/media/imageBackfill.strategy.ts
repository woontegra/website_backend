import type { ImageBackfillItem, ImageBackfillRollbackMapping } from './imageBackfill.types'

/**
 * Gelecekteki gerçek backfill URL stratejisi (bu turda uygulanmaz).
 *
 * A) Vercel Blob CMS: eski object kalır; yanına `.opt-w` / `.optavif-w` kardeşler yazılır.
 *    CMS string URL (PageContent JSON, Product.coverImage, vs.) yeni canonical'e güncellenir.
 * B) R2 public catalog: aynı kardeş-object modeli. Eski `catalog/...` silinmez.
 * C) Frontend `/public/images`: yeni optimize dosyalar repo/static yanına eklenir,
 *    referanslar yeni canonical path'e alınır. Üzerine yazılmaz.
 * D) OG/social: tek URL yeter; srcset yok. ogImage/twitterImage canonical JPEG/WebP'ye çekilir.
 *
 * DB migration gerekmez: mevcut URL string alanları yeter.
 * İsteğe bağlı mapping dosyası/tablosu yalnızca rollback içindir.
 */
export function buildRollbackMappings(items: ImageBackfillItem[]): ImageBackfillRollbackMapping[] {
  return items
    .filter((item) => item.eligible && item.estimate?.proposedCanonicalUrl)
    .map((item) => ({
      oldUrl: item.url,
      newUrl: item.estimate!.proposedCanonicalUrl,
      usages: item.usages,
    }))
}

export function describeUrlStrategy(): string[] {
  return [
    'Eski asset silinmez veya üzerine yazılmaz; yanına .opt-w / .optavif-w varyantları konur.',
    'Frontend yalnız yeni canonical URL .opt-w / .optavif-w içeriyorsa srcset üretir.',
    'CMS kayıtlarında URL string güncellemesi yeter; schema migration gerekmez.',
    'OG/social alanları tek canonical URL kullanır, srcset kullanılmaz.',
    'Rollback: mapping.oldUrl değerleri ilgili alanlara geri yazılır; eski dosyalar durur.',
  ]
}
