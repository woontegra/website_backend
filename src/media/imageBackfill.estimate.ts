import { prepareCatalogImageForStorage } from './prepareCatalogImage'
import { replacePathFileName } from './imageVariantNames'
import type { ImageBackfillEstimate, OptimizedVariantEstimate } from './imageBackfill.types'

function pickVisitorBytes(variants: OptimizedVariantEstimate[], targetWidth: number): number {
  const webp = variants.filter((item) => item.format === 'webp')
  const pool = webp.length > 0 ? webp : variants
  if (pool.length === 0) return 0
  const needed = Math.max(1, targetWidth)
  return (pool.find((item) => item.width >= needed) ?? pool[pool.length - 1]).bytes
}

export async function estimateOptimizedImage(input: {
  url: string
  stem: string
  mime: string
  buffer: Buffer
}): Promise<ImageBackfillEstimate | { skip: 'gif-animated' | 'not-raster' | 'transform-failed' }> {
  try {
    const prepared = await prepareCatalogImageForStorage(
      { mimetype: input.mime, buffer: input.buffer },
      input.stem,
    )
    if (prepared.mode === 'passthrough') {
      return { skip: input.mime === 'image/gif' ? 'gif-animated' : 'not-raster' }
    }

    const variants: OptimizedVariantEstimate[] = prepared.set.files.map((file) => ({
      fileName: file.fileName,
      format: file.format,
      width: file.width,
      height: file.height,
      bytes: file.fileSize,
    }))

    return {
      canonicalFormat: prepared.set.canonical.format,
      canonicalBytes: prepared.set.canonical.fileSize,
      canonicalWidth: prepared.set.canonical.width,
      canonicalHeight: prepared.set.canonical.height,
      hasAvif: prepared.set.hasAvif,
      marker: prepared.set.marker,
      proposedCanonicalFileName: prepared.set.canonical.fileName,
      proposedCanonicalUrl: replacePathFileName(input.url, prepared.set.canonical.fileName),
      variants,
      variantStorageBytes: variants.reduce((sum, item) => sum + item.bytes, 0),
      typicalMobileBytes: pickVisitorBytes(variants, 960),
      typicalDesktopBytes: pickVisitorBytes(variants, 1440),
    }
  } catch {
    return { skip: 'transform-failed' }
  }
}
