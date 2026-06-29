import { del, put } from '@vercel/blob'
import { readBlobToken } from '../lib/vercelBlob.client'

const WEBSITE_MEDIA_ROOT = 'website-media'

const ALLOWED_FOLDERS = new Set(['logo', 'hero', 'blog', 'products', 'builder', 'general', 'branding'])

export type WebsiteMediaFolder =
  | 'logo'
  | 'hero'
  | 'blog'
  | 'products'
  | 'builder'
  | 'general'
  | 'branding'

export function normalizeWebsiteMediaFolder(folder?: string | null): WebsiteMediaFolder {
  const raw = (folder ?? 'general').trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
  if (ALLOWED_FOLDERS.has(raw)) return raw as WebsiteMediaFolder
  return 'general'
}

export function buildWebsiteMediaBlobPath(folder: WebsiteMediaFolder, fileName: string): string {
  const safeName = fileName.replace(/\\/g, '/').split('/').pop() || fileName
  return `${WEBSITE_MEDIA_ROOT}/${folder}/${safeName}`
}

export type UploadWebsiteBlobResult = {
  url: string
  pathname: string
  size: number
  contentType: string
}

export async function uploadWebsiteMediaBlob(input: {
  pathname: string
  body: Buffer
  contentType: string
}): Promise<UploadWebsiteBlobResult> {
  const token = readBlobToken()
  const blob = await put(input.pathname, input.body, {
    access: 'public',
    token,
    contentType: input.contentType || 'application/octet-stream',
    addRandomSuffix: false,
  })

  return {
    url: blob.url,
    pathname: blob.pathname,
    size: input.body.length,
    contentType: input.contentType,
  }
}

export async function deleteWebsiteMediaBlob(pathname: string): Promise<void> {
  if (!pathname?.trim()) return
  const token = readBlobToken()
  await del(pathname, { token })
}

export function isVercelBlobUrl(url: string): boolean {
  return /\.blob\.vercel-storage\.com/i.test(url)
}
