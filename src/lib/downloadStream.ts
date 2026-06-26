import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Request, Response } from 'express'
import {
  filenameFromObjectKey,
  getDownloadsBucketName,
  objectKeyFromDownloadsPublicUrl,
} from './r2DownloadObjectKey'
import { getR2DownloadsPublicBaseUrl } from './r2.client'
import { getR2S3Client, isR2PublicUploadConfigured } from './r2.client'
import { isCatalogUploadDownloadPath } from './mailDeliveryUrl'

export type ByteRange = { start: number; end: number }

export type ResolvedDownloadSource = {
  kind: 'local' | 'r2'
  filename: string
  localUploadPath?: string
  bucket?: string
  objectKey?: string
}

export type ObjectMeta = { size: number }

export function parseByteRange(rangeHeader: string | undefined, totalSize: number): ByteRange | null {
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

export function setAttachmentHeaders(
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

function filenameFromUrl(url: string): string {
  try {
    const name = new URL(url).pathname.split('/').pop()?.trim()
    return name && name.length > 0 ? name : 'download.zip'
  } catch {
    return 'download.zip'
  }
}

function localUploadAbsolutePath(uploadPath: string): string {
  const normalized = uploadPath.trim()
  if (!isCatalogUploadDownloadPath(normalized)) {
    throw new Error('Geçersiz yerel indirme yolu')
  }
  return path.join(process.cwd(), 'public', normalized.replace(/^\/+/, ''))
}

export function resolveDownloadSourceFromRawUrl(rawUrl: string | null | undefined): ResolvedDownloadSource | null {
  const url = (rawUrl ?? '').trim()
  if (!url || url.startsWith('saas:')) return null

  if (isCatalogUploadDownloadPath(url)) {
    return {
      kind: 'local',
      localUploadPath: url,
      filename: path.basename(url) || 'download.zip',
    }
  }

  if (/^https?:\/\//i.test(url)) {
    const downloadsBase = getR2DownloadsPublicBaseUrl()
    if (downloadsBase && url.startsWith(downloadsBase)) {
      const objectKey = objectKeyFromDownloadsPublicUrl(url)
      if (objectKey) {
        return {
          kind: 'r2',
          bucket: getDownloadsBucketName(),
          objectKey,
          filename: filenameFromUrl(url) || filenameFromObjectKey(objectKey),
        }
      }
    }
  }

  return null
}

export async function headDownloadSource(source: ResolvedDownloadSource): Promise<ObjectMeta> {
  if (source.kind === 'local') {
    const stat = await fs.stat(localUploadAbsolutePath(source.localUploadPath!))
    if (stat.size <= 0) throw new Error('Dosya boyutu alınamadı')
    return { size: stat.size }
  }

  if (!isR2PublicUploadConfigured()) throw new Error('R2 yapılandırması eksik')
  const client = getR2S3Client()
  const head = await client.send(
    new HeadObjectCommand({ Bucket: source.bucket!, Key: source.objectKey! }),
  )
  const size = head.ContentLength ?? 0
  if (size <= 0) throw new Error('Dosya boyutu alınamadı')
  return { size }
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
  throw new Error('Stream gövdesi okunamadı')
}

export async function streamDownloadSource(
  source: ResolvedDownloadSource,
  req: Request,
  res: Response,
): Promise<void> {
  const meta = await headDownloadSource(source)
  const range = parseByteRange(req.headers.range, meta.size)
  const partialLength = range ? range.end - range.start + 1 : meta.size
  setAttachmentHeaders(res, source.filename, partialLength, range, meta.size)

  if (source.kind === 'local') {
    const filePath = localUploadAbsolutePath(source.localUploadPath!)
    const stream = createReadStream(
      filePath,
      range ? { start: range.start, end: range.end } : undefined,
    )
    await pipeline(stream, res)
    return
  }

  const client = getR2S3Client()
  const getInput: { Bucket: string; Key: string; Range?: string } = {
    Bucket: source.bucket!,
    Key: source.objectKey!,
  }
  if (range) getInput.Range = `bytes=${range.start}-${range.end}`
  const object = await client.send(new GetObjectCommand(getInput))
  if (!object.Body) throw new Error('R2 nesne gövdesi boş')
  const stream = await bodyToNodeReadable(object.Body)
  await pipeline(stream, res)
}
