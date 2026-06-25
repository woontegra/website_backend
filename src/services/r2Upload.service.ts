import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import path from 'path'
import {
  getR2PrivateBucketName,
  getR2PublicBaseUrl,
  getR2PublicBucketName,
  getR2S3Client,
  isR2PublicUploadConfigured,
} from '../lib/r2.client'

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  pdf: 'application/pdf',
  zip: 'application/zip',
  exe: 'application/x-msdownload',
  msi: 'application/x-msi',
  dmg: 'application/x-apple-diskimage',
}

export type R2CatalogFolder = 'products' | 'categories' | 'general' | 'builder'

export function sanitizeObjectKey(segment: string): string {
  const base = path.basename(segment || 'file')
  const cleaned = base
    .replace(/\\/g, '/')
    .replace(/\.\./g, '')
    .replace(/^\/+/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return cleaned || 'file'
}

export function inferContentType(fileName: string, fallback = 'application/octet-stream'): string {
  const ext = path.extname(fileName).replace(/^\./, '').toLowerCase()
  return MIME_BY_EXT[ext] ?? fallback
}

export function buildPublicUrl(objectKey: string): string {
  const base = getR2PublicBaseUrl()
  const key = objectKey.replace(/^\/+/, '')
  if (!base) {
    throw new Error('R2_PUBLIC_BASE_URL tanımlı değil.')
  }
  return `${base}/${key}`
}

export function buildCatalogObjectKey(folder: R2CatalogFolder, fileName: string): string {
  const now = new Date()
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const safe = sanitizeObjectKey(fileName)
  return `catalog/${folder}/${yyyy}/${mm}/${safe}`
}

export function buildBrandingObjectKey(kind: 'logo' | 'favicon' | 'general', fileName: string): string {
  const safe = sanitizeObjectKey(fileName)
  if (kind === 'logo') return `branding/logo/${safe}`
  if (kind === 'favicon') return `branding/favicon/${safe}`
  const now = new Date()
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `branding/general/${yyyy}/${mm}/${safe}`
}

export function buildServiceHeroObjectKey(serviceSlug: string, fileName: string): string {
  const safeSlug = serviceSlug
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  const safe = sanitizeObjectKey(fileName)
  return `services/${safeSlug || 'unknown'}/${safe}`
}

export function buildPageHeroObjectKey(pageSlug: string, fileName: string): string {
  const safeSlug = pageSlug
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  const safe = sanitizeObjectKey(fileName)
  return `pages/${safeSlug || 'page'}/${safe}`
}

export function buildBlogCoverObjectKey(postSlug: string, fileName: string): string {
  const safeSlug = postSlug
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  const safe = sanitizeObjectKey(fileName)
  return `blog/${safeSlug || 'post'}/${safe}`
}

export type UploadPublicObjectInput = {
  objectKey: string
  body: Buffer
  contentType: string
  bucket?: string
}

export type UploadPublicObjectResult = {
  bucket: string
  objectKey: string
  publicUrl: string
  contentType: string
  size: number
}

export async function uploadPublicObject(input: UploadPublicObjectInput): Promise<UploadPublicObjectResult> {
  const bucket = input.bucket ?? getR2PublicBucketName()
  const objectKey = input.objectKey.replace(/^\/+/, '')
  const client = getR2S3Client()

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: input.body,
      ContentType: input.contentType,
    }),
  )

  return {
    bucket,
    objectKey,
    publicUrl: buildPublicUrl(objectKey),
    contentType: input.contentType,
    size: input.body.length,
  }
}

export async function deletePublicObject(objectKey: string, bucket?: string): Promise<void> {
  if (!isR2PublicUploadConfigured()) return
  const client = getR2S3Client()
  const key = objectKey.replace(/^\/+/, '')
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket ?? getR2PublicBucketName(),
      Key: key,
    }),
  )
}

/** Sonraki faz: private installer dosyaları için signed URL. */
export function getPrivateBucketNameForDownloads(): string {
  return getR2PrivateBucketName()
}
