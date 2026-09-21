import fs from 'fs/promises'
import path from 'path'
import { IMAGE_OPTIMIZATION_CONFIG } from './imageOptimization.config'
import { isR2PublicUploadConfigured } from '../lib/r2.client'
import { isVercelBlobConfigured } from '../lib/vercelBlob.client'
import { uploadWebsiteMediaBlob } from '../services/vercelBlobUpload.service'
import { uploadPublicObject } from '../services/r2Upload.service'
import { blobPathnameFromUrl, siblingObjectKey } from './imageBackfill.urls'
import type { ImageStorageSource, PreparedVariantFile } from './imageBackfill.types'

export async function uploadBackfillVariants(input: {
  source: ImageStorageSource
  originalUrl: string
  files: PreparedVariantFile[]
  canonicalFileName: string
}): Promise<{ uploaded: { fileName: string; url: string }[]; canonicalUrl: string }> {
  if (input.source === 'r2' && isR2PublicUploadConfigured()) {
    const uploaded = []
    for (const file of input.files) {
      const objectKey = siblingObjectKey(input.originalUrl, file.fileName)
      const result = await uploadPublicObject({
        objectKey,
        body: file.buffer,
        contentType: file.mimeType,
      })
      uploaded.push({ fileName: file.fileName, url: result.publicUrl })
    }
    const canonical = uploaded.find((file) => file.fileName === input.canonicalFileName)
    if (!canonical) throw new Error('R2 canonical upload missing')
    return { uploaded, canonicalUrl: canonical.url }
  }

  if (!isVercelBlobConfigured()) {
    throw new Error('Vercel Blob yapılandırılmadı; backfill upload yapılamaz.')
  }

  const uploaded = []
  for (const file of input.files) {
    const pathname = blobPathnameFromUrl(input.originalUrl, file.fileName)
    const result = await uploadWebsiteMediaBlob({
      pathname,
      body: file.buffer,
      contentType: file.mimeType,
      cacheControlMaxAge: IMAGE_OPTIMIZATION_CONFIG.blobCacheControlMaxAge,
    })
    uploaded.push({ fileName: file.fileName, url: result.url })
  }
  const canonical = uploaded.find((file) => file.fileName === input.canonicalFileName)
  if (!canonical) throw new Error('Blob canonical upload missing')
  return { uploaded, canonicalUrl: canonical.url }
}

export async function writeStaticVariantFiles(
  staticRoot: string,
  files: { relativePath: string; buffer: Buffer }[],
): Promise<string[]> {
  const written: string[] = []
  for (const file of files) {
    const abs = path.join(staticRoot, file.relativePath.replace(/^images[\\/]/, ''))
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, file.buffer)
    written.push(`/${file.relativePath.replace(/\\/g, '/')}`)
  }
  return written
}
