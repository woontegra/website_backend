import { getR2DownloadsPublicBaseUrl, getR2PrivateBucketName } from './r2.client'

/** Public R2 indirme URL'sinden woontegra-downloads object key çıkarır. */
export function objectKeyFromDownloadsPublicUrl(sourceUrl: string): string | null {
  const raw = sourceUrl.trim()
  if (!raw) return null

  try {
    const parsed = new URL(raw)
    let key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
    if (!key || key.includes('..')) return null

    const downloadsBase = getR2DownloadsPublicBaseUrl()
    if (downloadsBase) {
      try {
        const basePath = new URL(downloadsBase).pathname.replace(/^\/+|\/+$/g, '')
        if (basePath && key.startsWith(`${basePath}/`)) {
          key = key.slice(basePath.length + 1)
        } else if (basePath && key === basePath) {
          return null
        }
      } catch {
        /* base URL parse edilemezse pathname kullan */
      }
    }

    return key || null
  } catch {
    return null
  }
}

export function filenameFromObjectKey(objectKey: string): string {
  const name = objectKey.split('/').pop()?.trim()
  return name && name.length > 0 ? name : 'download.exe'
}

export function getDownloadsBucketName(): string {
  return getR2PrivateBucketName()
}
