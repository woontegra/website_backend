import { IMAGE_OPTIMIZATION_CONFIG } from './imageOptimization.config'
import { ImageOptimizationError } from './imageOptimization.errors'

const RASTER_OPTIMIZABLE_MIME = /^image\/(jpeg|jpg|png|webp|avif)$/i
const SVG_MIME = /^image\/svg\+xml$/i
const GIF_MIME = /^image\/gif$/i

export function isRasterOptimizableMime(mimetype: string): boolean {
  return RASTER_OPTIMIZABLE_MIME.test((mimetype || '').split(';')[0]?.trim() ?? '')
}

export function isSvgMime(mimetype: string): boolean {
  return SVG_MIME.test((mimetype || '').split(';')[0]?.trim() ?? '')
}

export function isGifMime(mimetype: string): boolean {
  return GIF_MIME.test((mimetype || '').split(';')[0]?.trim() ?? '')
}

export function shouldAttemptRasterOptimization(mimetype: string): boolean {
  if (isSvgMime(mimetype) || isGifMime(mimetype)) return false
  return isRasterOptimizableMime(mimetype)
}

export function assertRasterImageByteLimit(
  file: { size?: number; buffer?: Buffer; mimetype?: string },
  maxBytes = IMAGE_OPTIMIZATION_CONFIG.maxUploadBytes,
): void {
  if (!shouldAttemptRasterOptimization(file.mimetype || '')) return
  const size = Math.max(file.size ?? 0, file.buffer?.length ?? 0)
  if (size <= maxBytes) return
  const maxMb = Math.round(maxBytes / (1024 * 1024))
  throw new ImageOptimizationError(
    'IMAGE_TOO_LARGE',
    `Görsel en fazla ${maxMb} MB olabilir. Lütfen daha küçük bir dosya yükleyin.`,
  )
}

export function assertSafePixelCount(
  width: number,
  height: number,
  maxPixels: number = IMAGE_OPTIMIZATION_CONFIG.maxInputPixels,
): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new ImageOptimizationError('IMAGE_TRANSFORM_FAILED', 'Görsel ölçüleri okunamadı.')
  }
  if (width * height <= maxPixels) return
  throw new ImageOptimizationError(
    'IMAGE_PIXEL_LIMIT',
    'Görsel çözünürlüğü çok yüksek (maksimum 40 megapiksel). Lütfen daha küçük bir görsel yükleyin.',
  )
}
