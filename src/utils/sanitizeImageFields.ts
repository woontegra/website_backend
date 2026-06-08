import { normalizePublicImagePath } from '../services/imagePathAliases'

const IMAGE_FIELD_KEYS = new Set([
  'image',
  'imageUrl',
  'featuredImage',
  'coverImage',
  'logoUrl',
  'logo',
  'darkModeLogo',
  'backgroundImage',
  'ogImage',
  'twitterImage',
  'organizationLogo',
  'heroImageUrl',
])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * JSON içindeki bilinen görsel alanlarını normalize eder.
 * /uploads/... → '' (deploy sonrası kaybolan geçici dosyalar)
 * Bilinen alias'lar → public/images gerçek dosya adı
 */
export function sanitizeImageFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeImageFields(item)) as T
  }

  if (!isPlainObject(value)) {
    return value
  }

  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (IMAGE_FIELD_KEYS.has(key) && typeof child === 'string') {
      out[key] = normalizePublicImagePath(child)
    } else {
      out[key] = sanitizeImageFields(child)
    }
  }
  return out as T
}

export function sanitizeImageUrl(url?: string | null): string {
  return normalizePublicImagePath(url)
}
