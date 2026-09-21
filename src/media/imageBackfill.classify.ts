import { isOptimizedFileName } from './imageVariantNames'
import type { ImageBackfillPriority, ImageBackfillSkipReason, ImageBackfillUsage, ImageStorageSource } from './imageBackfill.types'

const INSTALLER_EXT_RE = /\.(exe|msi|msix|zip|7z|rar|dmg|pkg|iso|deb|rpm)(?:[?#]|$)/i
const DOCUMENT_EXT_RE = /\.(pdf|docx?|xlsx?|pptx?|txt|csv)(?:[?#]|$)/i
const SVG_EXT_RE = /\.svg(?:[?#]|$)/i
const GIF_EXT_RE = /\.gif(?:[?#]|$)/i
const RASTER_EXT_RE = /\.(jpe?g|png|webp|avif)(?:[?#]|$)/i
const PRIVATE_STORAGE_RE = /woontegra-downloads|r2\.cloudflarestorage\.com|\/downloads\//i
const INSTALLER_HINT_RE = /installer|setup|portable|\.exe|\.msi/i

export function normalizeImageUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  const withoutHash = trimmed.split('#')[0] ?? trimmed
  return withoutHash
}

export function fileNameFromUrl(url: string): string {
  const path = normalizeImageUrl(url).split('?')[0] ?? url
  return path.replace(/\\/g, '/').split('/').pop() || ''
}

export function stemFromUrl(url: string): string {
  const fileName = fileNameFromUrl(url)
  return fileName.replace(/\.[a-z0-9]+$/i, '')
}

export function classifyStorageSource(url: string): ImageStorageSource {
  const value = normalizeImageUrl(url)
  if (/blob\.vercel-storage\.com|website-media\//i.test(value)) return 'vercel-blob'
  if (/r2\.dev|r2\.cloudflarestorage|\/catalog\//i.test(value)) return 'r2'
  if (/^\/images\//i.test(value) || /\/images\//i.test(value) && !/^https?:/i.test(value)) {
    return 'frontend-static'
  }
  if (/woontegra\.com\/images\//i.test(value)) return 'frontend-static'
  return 'other'
}

export function isInstallerUrl(url: string, mime?: string | null): boolean {
  const value = normalizeImageUrl(url)
  const type = (mime || '').split(';')[0]?.trim() ?? ''
  if (INSTALLER_EXT_RE.test(value)) return true
  if (PRIVATE_STORAGE_RE.test(value) && INSTALLER_HINT_RE.test(value)) return true
  if (/^application\//i.test(type) && INSTALLER_HINT_RE.test(`${value} ${type}`)) return true
  return /application\/(x-msdownload|x-msi|zip|octet-stream)/i.test(type) && INSTALLER_HINT_RE.test(value)
}

export function isDocumentUrl(url: string, mime?: string | null): boolean {
  const value = normalizeImageUrl(url)
  const type = (mime || '').split(';')[0]?.trim() ?? ''
  if (DOCUMENT_EXT_RE.test(value)) return true
  return /^application\/(pdf|msword|vnd\.)/i.test(type)
}

export function isPrivateStorageUrl(url: string): boolean {
  return PRIVATE_STORAGE_RE.test(normalizeImageUrl(url))
}

export function classifySkipReason(input: {
  url: string
  mime?: string | null
}): ImageBackfillSkipReason | null {
  const url = normalizeImageUrl(input.url)
  if (!url) return 'empty-url'
  const mime = (input.mime || '').split(';')[0]?.trim() ?? ''
  if (isInstallerUrl(url, mime)) return 'installer'
  if (isPrivateStorageUrl(url)) return 'private-storage'
  if (isDocumentUrl(url, mime)) return 'document'
  if (mime === 'image/svg+xml' || SVG_EXT_RE.test(url)) return 'svg'
  if (mime === 'image/gif' || GIF_EXT_RE.test(url)) return 'gif-animated'
  if (isOptimizedFileName(fileNameFromUrl(url))) return 'already-optimized'
  if (mime && !/^image\/(jpeg|jpg|png|webp|avif)$/i.test(mime) && !RASTER_EXT_RE.test(url)) {
    return 'not-raster'
  }
  if (!mime && !RASTER_EXT_RE.test(url) && !/^image\//i.test(mime)) {
    if (!RASTER_EXT_RE.test(url)) return 'not-raster'
  }
  return null
}

export function isHeroLcpUsage(url: string, usages: ImageBackfillUsage[]): boolean {
  const file = fileNameFromUrl(url)
  if (/hero|slider|banner|lcp|ana-sayfa-hero|about-hero|web-tasarim-hero/i.test(file)) return true
  return usages.some((usage) => {
    const haystack = `${usage.page} ${usage.field} ${usage.component || ''}`
    const home = /(^|\/)(home)?$/.test(usage.page) || usage.page === '/' || usage.page === 'home'
    const heroField = /hero|slide|banner|lcp|preload|desktopimage|mobileimage/i.test(haystack)
    return (home && heroField) || /hero|slide|banner|lcp/i.test(haystack)
  })
}

export function classifyPriority(
  url: string,
  usages: ImageBackfillUsage[],
  heroLcp: boolean,
): ImageBackfillPriority {
  if (heroLcp) return 'P0'
  const joined = usages.map((usage) => `${usage.page} ${usage.field} ${usage.component || ''}`).join(' ')
  if (usages.some((usage) => usage.page === '/' || usage.page === 'home')) return 'P1'
  if (/product|yazilim|hizmet|service|solution|cover/i.test(joined)) return 'P1'
  if (/blog|gallery|galeri/i.test(joined)) return 'P2'
  if (/blog|gallery/i.test(fileNameFromUrl(url))) return 'P2'
  return 'P3'
}
