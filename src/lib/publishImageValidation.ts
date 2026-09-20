export const PUBLISH_IMAGE_REQUIRED_MESSAGE =
  'Bu içerik yayına alınamaz. Görsel alanı zorunludur.'

export class PublishImageValidationError extends Error {
  constructor(message = PUBLISH_IMAGE_REQUIRED_MESSAGE) {
    super(message)
    this.name = 'PublishImageValidationError'
  }
}

export function hasImageUrl(url?: string | null): boolean {
  return Boolean(url?.trim())
}

export function assertPublishImageRequired(condition: boolean, message = PUBLISH_IMAGE_REQUIRED_MESSAGE): void {
  if (!condition) throw new PublishImageValidationError(message)
}

/**
 * Yayın kapağı: medya seçimi varsa onun URL’si, yoksa coverImage URL,
 * ikisi de gönderilmediyse mevcut kayıt. MediaId bilinçli null iken
 * mevcut medya URL’si korunmaz; yalnızca gelen coverImage URL geçer.
 */
export function resolveNextCoverImageUrl(input: {
  currentCoverUrl?: string | null
  coverImageMediaId?: string | null
  mediaResolvedUrl?: string | null
  coverImage?: string | null
}): string | null {
  const mediaId = input.coverImageMediaId
  if (typeof mediaId === 'string' && mediaId.trim()) {
    return input.mediaResolvedUrl?.trim() || null
  }
  if (mediaId === null || (typeof mediaId === 'string' && !mediaId.trim())) {
    return input.coverImage?.trim() || null
  }
  if (input.coverImage !== undefined && input.coverImage !== null) {
    return input.coverImage.trim() || null
  }
  return input.currentCoverUrl?.trim() || null
}

/** pageContent JSON — yayında hero görseli zorunlu sayfalar */
export function validatePageContentPublishImages(pageKey: string, content: unknown): void {
  if (!content || typeof content !== 'object') return
  const c = content as Record<string, unknown>

  const marketingKeys = new Set([
    'servicesPage',
    'solutionsPage',
    'faq',
    'quotePage',
    'ucretsizAraclarPage',
  ])

  if (marketingKeys.has(pageKey)) {
    const enabled = c.enabled !== false
    if (enabled) {
      assertPublishImageRequired(hasImageUrl(typeof c.heroImage === 'string' ? c.heroImage : null))
    }
    return
  }

  if (pageKey === 'contact') {
    assertPublishImageRequired(hasImageUrl(typeof c.heroImage === 'string' ? c.heroImage : null))
    return
  }

  if (pageKey === 'about') {
    const hero = c.hero && typeof c.hero === 'object' ? (c.hero as Record<string, unknown>) : null
    assertPublishImageRequired(hasImageUrl(typeof hero?.image === 'string' ? hero.image : null))
    return
  }

  if (pageKey === 'home') {
    const hero = c.hero && typeof c.hero === 'object' ? (c.hero as Record<string, unknown>) : null
    const heroEnabled = hero?.enabled !== false
    if (heroEnabled) {
      assertPublishImageRequired(hasImageUrl(typeof hero?.image === 'string' ? hero.image : null))
    }
    return
  }

  if (pageKey === 'servicePages') {
    const pagesRoot =
      c.pages && typeof c.pages === 'object' ? (c.pages as Record<string, unknown>) : c
    for (const [slug, page] of Object.entries(pagesRoot)) {
      if (slug === 'pages' || slug === 'version' || !page || typeof page !== 'object') continue
      const row = page as Record<string, unknown>
      const hero = row.hero && typeof row.hero === 'object' ? (row.hero as Record<string, unknown>) : null
      const enabled = row.enabled !== false
      if (enabled) {
        assertPublishImageRequired(
          hasImageUrl(typeof hero?.image === 'string' ? hero.image : null),
          `${slug}: ${PUBLISH_IMAGE_REQUIRED_MESSAGE}`,
        )
      }
    }
  }
}
