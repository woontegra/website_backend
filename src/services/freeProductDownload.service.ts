import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import {
  filenameFromObjectKey,
  getDownloadsBucketName,
  objectKeyFromDownloadsPublicUrl,
} from '../lib/r2DownloadObjectKey'
import { getR2S3Client, isR2PublicUploadConfigured } from '../lib/r2.client'
import {
  isPublicFreeDownloadProduct,
  parseProductDownloadFiles,
  type ProductDownloadFile,
} from '../lib/productDownloadFiles'
import { downloadsService } from './downloads.service'

export type FreeDownloadVariant = 'setup' | 'portable'

const ALLOWED_VARIANTS = new Set<FreeDownloadVariant>(['setup', 'portable'])

export function parseFreeDownloadVariant(raw: string): FreeDownloadVariant | null {
  const v = raw.trim().toLowerCase()
  return ALLOWED_VARIANTS.has(v as FreeDownloadVariant) ? (v as FreeDownloadVariant) : null
}

export type ResolvedFreeDownload = {
  productSlug: string
  variant: FreeDownloadVariant
  sourceUrl: string
  objectKey: string
  bucket: string
  filename: string
  label: string
}

export type FreeDownloadAccess =
  | { kind: 'ok'; resolved: ResolvedFreeDownload }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }

type ObjectMeta = {
  size: number
  etag?: string
}

type ByteRange = {
  start: number
  end: number
}

function filenameFromUrl(url: string): string {
  try {
    const name = new URL(url).pathname.split('/').pop()?.trim()
    return name && name.length > 0 ? name : 'download.exe'
  } catch {
    return 'download.exe'
  }
}

export async function classifyFreeDownloadAccess(
  productSlug: string,
  variant: FreeDownloadVariant,
): Promise<FreeDownloadAccess> {
  const slug = productSlug.trim().toLowerCase()
  if (!slug) return { kind: 'not_found' }

  const product = await prisma.product.findFirst({
    where: { slug, isActive: true },
    select: {
      slug: true,
      productType: true,
      purchaseEnabled: true,
      price: true,
      downloadFiles: true,
    },
  })
  if (!product) return { kind: 'not_found' }
  if (!isPublicFreeDownloadProduct(product)) return { kind: 'forbidden' }

  const resolved = buildResolvedDownload(product.slug, variant, product.downloadFiles)
  if (!resolved) return { kind: 'not_found' }
  return { kind: 'ok', resolved }
}

export async function resolveFreeProductDownload(
  productSlug: string,
  variant: FreeDownloadVariant,
): Promise<ResolvedFreeDownload | null> {
  const access = await classifyFreeDownloadAccess(productSlug, variant)
  return access.kind === 'ok' ? access.resolved : null
}

function buildResolvedDownload(
  productSlug: string,
  variant: FreeDownloadVariant,
  downloadFiles: unknown,
): ResolvedFreeDownload | null {
  const config = parseProductDownloadFiles(downloadFiles)
  if (config.publicFreeDownload === false) return null

  const file = config.files.find((f) => f.type === variant && f.url.trim())
  if (!file) return null

  const sourceUrl = file.url.trim()
  const objectKey = objectKeyFromDownloadsPublicUrl(sourceUrl)
  if (!objectKey) return null

  const filename = filenameFromUrl(sourceUrl) || filenameFromObjectKey(objectKey)

  return {
    productSlug,
    variant,
    sourceUrl,
    objectKey,
    bucket: getDownloadsBucketName(),
    filename,
    label: file.label,
  }
}

function parseByteRange(rangeHeader: string | undefined, totalSize: number): ByteRange | null {
  if (!rangeHeader?.trim() || totalSize <= 0) return null
  const m = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim())
  if (!m) return null

  let start: number
  let end: number

  if (m[1] === '' && m[2] !== '') {
    const suffix = Number(m[2])
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(0, totalSize - suffix)
    end = totalSize - 1
  } else {
    start = m[1] ? Number(m[1]) : 0
    end = m[2] ? Number(m[2]) : totalSize - 1
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  if (start < 0 || start >= totalSize || end < start) return null
  end = Math.min(end, totalSize - 1)
  return { start, end }
}

async function headR2Object(resolved: ResolvedFreeDownload): Promise<ObjectMeta> {
  if (!isR2PublicUploadConfigured()) {
    throw new Error('R2 yapılandırması eksik')
  }
  const client = getR2S3Client()
  const head = await client.send(
    new HeadObjectCommand({
      Bucket: resolved.bucket,
      Key: resolved.objectKey,
    }),
  )
  const size = head.ContentLength ?? 0
  if (size <= 0) {
    throw new Error('Dosya boyutu alınamadı')
  }
  return { size, etag: head.ETag ?? undefined }
}

function logDownloadContext(
  resolved: ResolvedFreeDownload,
  meta: ObjectMeta,
  range: ByteRange | null,
): void {
  console.info('[downloads] free product stream', {
    productSlug: resolved.productSlug,
    fileType: resolved.variant,
    objectKey: resolved.objectKey,
    fileName: resolved.filename,
    size: meta.size,
    range: range ? `${range.start}-${range.end}` : null,
  })
}

function setAttachmentHeaders(
  res: Response,
  filename: string,
  contentLength: number,
  range: ByteRange | null,
  totalSize: number,
): void {
  res.setHeader('Content-Type', 'application/octet-stream')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.setHeader('Content-Length', String(contentLength))
  if (range) {
    res.status(206)
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${totalSize}`)
  } else {
    res.status(200)
  }
}

export async function headFreeProductObject(resolved: ResolvedFreeDownload): Promise<ObjectMeta> {
  return headR2Object(resolved)
}

async function bodyToNodeReadable(body: unknown): Promise<Readable> {
  if (body instanceof Readable) return body
  if (
    body &&
    typeof body === 'object' &&
    'transformToWebStream' in body &&
    typeof (body as { transformToWebStream: () => unknown }).transformToWebStream === 'function'
  ) {
    const webStream = (body as { transformToWebStream: () => import('stream/web').ReadableStream }).transformToWebStream()
    return Readable.fromWeb(webStream)
  }
  throw new Error('R2 stream gövdesi okunamadı')
}

export async function streamFreeProductDownload(
  resolved: ResolvedFreeDownload,
  req: Request,
  res: Response,
): Promise<void> {
  if (!isR2PublicUploadConfigured()) {
    throw new Error('R2 yapılandırması eksik')
  }

  const meta = await headR2Object(resolved)
  const range = parseByteRange(req.headers.range, meta.size)
  logDownloadContext(resolved, meta, range)

  const client = getR2S3Client()
  const getInput: { Bucket: string; Key: string; Range?: string } = {
    Bucket: resolved.bucket,
    Key: resolved.objectKey,
  }
  if (range) {
    getInput.Range = `bytes=${range.start}-${range.end}`
  }

  const object = await client.send(new GetObjectCommand(getInput))
  const body = object.Body
  if (!body) {
    throw new Error('R2 nesne gövdesi boş')
  }

  const partialLength = range ? range.end - range.start + 1 : meta.size
  setAttachmentHeaders(res, resolved.filename, partialLength, range, meta.size)

  const stream = await bodyToNodeReadable(body)
  await pipeline(stream, res)

  if (!range) {
    await downloadsService.incrementDownload(resolved.productSlug, resolved.variant)
  }
}

export async function checkFreeProductDownloadAvailable(
  productSlug: string,
  variant: FreeDownloadVariant,
): Promise<boolean> {
  const resolved = await resolveFreeProductDownload(productSlug, variant)
  return resolved !== null
}

export function publicDownloadPath(productSlug: string, file: ProductDownloadFile): string | null {
  if (file.type !== 'setup' && file.type !== 'portable') return null
  if (!file.url.trim()) return null
  return `/api/downloads/free/${productSlug}/${file.type}`
}
