import sharp, { type Sharp } from 'sharp'
import {
  listOutputWidths,
  resolveImageOptimizationConfig,
  type ImageOptimizationConfig,
} from './imageOptimization.config'
import { ImageOptimizationError } from './imageOptimization.errors'
import { assertSafePixelCount } from './imageOptimization.policy'
import {
  buildOptimizedFileName,
  mimeForFormat,
  variantMarkerForFormats,
  type OptimizedImageFormat,
  type OptimizedVariantMarker,
} from './imageVariantNames'

export type OptimizedImageFile = {
  fileName: string
  mimeType: string
  format: OptimizedImageFormat
  width: number
  height: number
  buffer: Buffer
  fileSize: number
}

export type OptimizedImageSet = {
  width: number
  height: number
  format: OptimizedImageFormat
  hasAvif: boolean
  hasWebp: boolean
  marker: OptimizedVariantMarker
  canonical: OptimizedImageFile
  files: OptimizedImageFile[]
}

let cachedAvifSupport: boolean | null = null

export async function isAvifEncodeSupported(): Promise<boolean> {
  if (cachedAvifSupport != null) return cachedAvifSupport
  try {
    await sharp({
      create: { width: 2, height: 2, channels: 3, background: { r: 200, g: 40, b: 40 } },
    })
      .avif({ quality: 50 })
      .toBuffer()
    cachedAvifSupport = true
  } catch {
    cachedAvifSupport = false
  }
  return cachedAvifSupport
}

export function resetAvifSupportCache(): void {
  cachedAvifSupport = null
}

type InspectedImage = {
  width: number
  height: number
  hasAlpha: boolean
  pages: number
  format?: string
  orientedBuffer: Buffer
}

function isPixelLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /pixel|limitInputPixels|Input image exceeds/i.test(message)
}

async function inspectRasterImage(
  buffer: Buffer,
  config: ImageOptimizationConfig,
): Promise<InspectedImage> {
  try {
    const raw = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: config.maxInputPixels,
      animated: true,
    }).metadata()

    const rawWidth = raw.width ?? 0
    const rawHeight = raw.height ?? 0
    assertSafePixelCount(rawWidth, rawHeight, config.maxInputPixels)

    if ((raw.pages && raw.pages > 1) || raw.format === 'gif') {
      return {
        width: rawWidth,
        height: rawHeight,
        hasAlpha: Boolean(raw.hasAlpha),
        pages: raw.pages && raw.pages > 1 ? raw.pages : 1,
        format: raw.format,
        orientedBuffer: buffer,
      }
    }

    const orientedBuffer = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: config.maxInputPixels,
    })
      .rotate()
      .toBuffer()

    const meta = await sharp(orientedBuffer).metadata()
    const width = meta.width ?? rawWidth
    const height = meta.height ?? rawHeight
    assertSafePixelCount(width, height, config.maxInputPixels)

    return {
      width,
      height,
      hasAlpha: Boolean(meta.hasAlpha),
      pages: 1,
      format: meta.format ?? raw.format,
      orientedBuffer,
    }
  } catch (error) {
    if (error instanceof ImageOptimizationError) throw error
    if (isPixelLimitError(error)) {
      throw new ImageOptimizationError(
        'IMAGE_PIXEL_LIMIT',
        'Görsel çözünürlüğü çok yüksek (maksimum 40 megapiksel). Lütfen daha küçük bir görsel yükleyin.',
      )
    }
    throw new ImageOptimizationError(
      'IMAGE_TRANSFORM_FAILED',
      'Görsel işlenemedi. Dosya bozuk olabilir veya desteklenmeyen bir formattadır.',
    )
  }
}

function outputSize(width: number, height: number, maxLongEdge: number): { width: number; height: number } {
  const longEdge = Math.max(width, height)
  if (longEdge <= maxLongEdge) return { width, height }
  const scale = maxLongEdge / longEdge
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function heightForWidth(sourceWidth: number, sourceHeight: number, width: number): number {
  return Math.max(1, Math.round((sourceHeight / sourceWidth) * width))
}

async function encodeVariant(
  pipeline: Sharp,
  format: OptimizedImageFormat,
  config: ImageOptimizationConfig,
): Promise<Buffer> {
  if (format === 'webp') {
    return pipeline.webp({ quality: config.webpQuality, effort: 4 }).toBuffer()
  }
  if (format === 'avif') {
    return pipeline.avif({ quality: config.avifQuality, effort: 4 }).toBuffer()
  }
  if (format === 'png') {
    return pipeline.png({ compressionLevel: config.pngCompressionLevel, palette: false }).toBuffer()
  }
  return pipeline.jpeg({ quality: config.jpegQuality, mozjpeg: true }).toBuffer()
}

function toFile(
  stem: string,
  marker: OptimizedVariantMarker,
  width: number,
  height: number,
  format: OptimizedImageFormat,
  buffer: Buffer,
): OptimizedImageFile {
  const fileName = buildOptimizedFileName(stem, width, format, marker)
  return {
    fileName,
    mimeType: mimeForFormat(format),
    format,
    width,
    height,
    buffer,
    fileSize: buffer.length,
  }
}

export async function inspectRasterForOptimization(
  buffer: Buffer,
  config?: Partial<ImageOptimizationConfig>,
): Promise<InspectedImage> {
  return inspectRasterImage(buffer, resolveImageOptimizationConfig(config))
}

export function shouldPassthroughInspectedImage(inspected: InspectedImage): boolean {
  return inspected.pages > 1 || inspected.format === 'gif'
}

export async function optimizeRasterImage(input: {
  buffer: Buffer
  stem: string
  config?: Partial<ImageOptimizationConfig>
}): Promise<OptimizedImageSet> {
  const config = resolveImageOptimizationConfig(input.config)
  const inspected = await inspectRasterImage(input.buffer, config)

  if (inspected.pages > 1 || inspected.format === 'gif') {
    throw new ImageOptimizationError(
      'IMAGE_TRANSFORM_FAILED',
      'Animasyonlu görseller otomatik optimize edilmez.',
    )
  }

  const sized = outputSize(inspected.width, inspected.height, config.maxLongEdge)
  const widths = listOutputWidths(sized.width, config.widths)
  const canonicalFormat: OptimizedImageFormat = inspected.hasAlpha ? 'webp' : 'jpeg'
  const avifEnabled = config.avifEnabled === false ? false : await isAvifEncodeSupported()
  const sourceBuffer = inspected.orientedBuffer

  type Pending = {
    width: number
    height: number
    format: OptimizedImageFormat
    buffer: Buffer
  }
  const pending: Pending[] = []

  try {
    for (const width of widths) {
      const height = heightForWidth(sized.width, sized.height, width)
      const resized = sharp(sourceBuffer, {
        failOn: 'error',
        limitInputPixels: config.maxInputPixels,
      }).resize({
        width,
        height,
        fit: 'inside',
        withoutEnlargement: true,
      })

      const required: OptimizedImageFormat[] = ['webp']
      if (width === sized.width && canonicalFormat !== 'webp') required.unshift(canonicalFormat)
      for (const format of required) {
        pending.push({
          width,
          height,
          format,
          buffer: await encodeVariant(resized.clone(), format, config),
        })
      }
    }
  } catch (error) {
    if (error instanceof ImageOptimizationError) throw error
    throw new ImageOptimizationError(
      'IMAGE_TRANSFORM_FAILED',
      'Görsel optimize edilemedi. Lütfen dosyayı kontrol edip tekrar deneyin.',
    )
  }

  let hasAvif = false
  if (avifEnabled) {
    const avifPending: Pending[] = []
    try {
      for (const width of widths) {
        const height = heightForWidth(sized.width, sized.height, width)
        const resized = sharp(sourceBuffer, {
          failOn: 'error',
          limitInputPixels: config.maxInputPixels,
        }).resize({
          width,
          height,
          fit: 'inside',
          withoutEnlargement: true,
        })
        avifPending.push({
          width,
          height,
          format: 'avif',
          buffer: await encodeVariant(resized.clone(), 'avif', config),
        })
      }
      if (avifPending.length === widths.length) {
        pending.push(...avifPending)
        hasAvif = true
      }
    } catch {
      hasAvif = false
    }
  }

  const marker = variantMarkerForFormats(hasAvif)
  const files = pending.map((file) =>
    toFile(input.stem, marker, file.width, file.height, file.format, file.buffer),
  )

  const canonical =
    files.find((file) => file.width === sized.width && file.format === canonicalFormat) ??
    files.find((file) => file.width === sized.width && file.format === 'webp')

  if (!canonical) {
    throw new ImageOptimizationError(
      'IMAGE_TRANSFORM_FAILED',
      'Optimize edilmiş görsel üretilemedi.',
    )
  }

  return {
    width: sized.width,
    height: sized.height,
    format: canonical.format,
    hasAvif,
    hasWebp: true,
    marker,
    canonical,
    files,
  }
}
