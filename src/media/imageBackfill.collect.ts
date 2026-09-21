import { classifyStorageSource, normalizeImageUrl } from './imageBackfill.classify'
import type { ImageBackfillRef, ImageBackfillUsage } from './imageBackfill.types'

const IMAGE_FIELD_KEYS = new Set([
  'image',
  'imageUrl',
  'featuredImage',
  'coverImage',
  'heroImage',
  'logo',
  'logoUrl',
  'darkModeLogo',
  'backgroundImage',
  'ogImage',
  'twitterImage',
  'organizationLogo',
  'src',
  'url',
  'desktopSrc',
  'mobileSrc',
  'desktopImage',
  'mobileImage',
])

const IMAGE_URL_RE =
  /(?:https?:\/\/[^\s"'\\<>]+|(?:\/(?:images|brands|uploads)\/[^\s"'\\<>]+))/gi

const IMAGE_LIKE_RE = /\.(jpe?g|png|webp|avif|gif|svg)(?:[?#]|$)/i

export function isImageLikeUrl(url: string): boolean {
  const value = normalizeImageUrl(url)
  if (!value) return false
  if (IMAGE_LIKE_RE.test(value)) return true
  return /blob\.vercel-storage\.com\/website-media\/|r2\.dev\/catalog\//i.test(value)
}

export function extractImageUrlsFromString(value: string): string[] {
  const found = new Set<string>()
  const trimmed = value.trim()
  if (isImageLikeUrl(trimmed)) found.add(normalizeImageUrl(trimmed))
  const matches = value.match(IMAGE_URL_RE) || []
  for (const match of matches) {
    const url = normalizeImageUrl(match.replace(/[),]+$/, ''))
    if (isImageLikeUrl(url)) found.add(url)
  }
  return [...found]
}

export function walkImageRefs(
  value: unknown,
  usage: Omit<ImageBackfillUsage, 'field'> & { field?: string },
  out: ImageBackfillRef[],
  fieldPath = '',
): void {
  if (typeof value === 'string') {
    const urls = extractImageUrlsFromString(value)
    if (urls.length === 0 && IMAGE_FIELD_KEYS.has(fieldPath.split('.').pop() || '') && isImageLikeUrl(value)) {
      urls.push(normalizeImageUrl(value))
    }
    for (const url of urls) {
      out.push({
        url,
        usages: [
          {
            page: usage.page,
            field: fieldPath || usage.field || 'value',
            component: usage.component,
          },
        ],
      })
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walkImageRefs(item, usage, out, fieldPath ? `${fieldPath}[${index}]` : `[${index}]`)
    })
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    const next = fieldPath ? `${fieldPath}.${key}` : key
    walkImageRefs(child, usage, out, next)
  }
}

export function dedupeImageRefs(refs: ImageBackfillRef[]): ImageBackfillRef[] {
  const byUrl = new Map<string, ImageBackfillRef>()
  for (const ref of refs) {
    const url = normalizeImageUrl(ref.url)
    if (!url) continue
    const existing = byUrl.get(url)
    if (!existing) {
      byUrl.set(url, { url, usages: [...ref.usages], localPath: ref.localPath })
      continue
    }
    existing.usages.push(...ref.usages)
    if (!existing.localPath && ref.localPath) existing.localPath = ref.localPath
  }
  return [...byUrl.values()]
}

export function resolvePublicFetchUrl(url: string, siteBase: string): string {
  const value = normalizeImageUrl(url)
  if (/^https?:\/\//i.test(value)) return value
  const rel = value.startsWith('/') ? value : `/${value}`
  return `${siteBase.replace(/\/+$/, '')}${rel}`
}

export { classifyStorageSource, normalizeImageUrl }
