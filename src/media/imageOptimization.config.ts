export const IMAGE_VARIANT_WIDTHS = [480, 960, 1440, 1920] as const

export type ImageVariantWidth = (typeof IMAGE_VARIANT_WIDTHS)[number]

export const IMAGE_OPTIMIZATION_MARKER = 'opt'

export const IMAGE_OPTIMIZATION_CONFIG = {
  maxUploadBytes: 20 * 1024 * 1024,
  maxInputPixels: 40_000_000,
  maxLongEdge: 1920,
  widths: IMAGE_VARIANT_WIDTHS,
  webpQuality: 82,
  avifQuality: 50,
  jpegQuality: 82,
  pngCompressionLevel: 8,
  marker: IMAGE_OPTIMIZATION_MARKER,
  blobCacheControlMaxAge: 60 * 60 * 24 * 365,
} as const

export type ImageOptimizationConfig = {
  maxUploadBytes: number
  maxInputPixels: number
  maxLongEdge: number
  widths: readonly number[]
  webpQuality: number
  avifQuality: number
  jpegQuality: number
  pngCompressionLevel: number
  marker: string
  avifEnabled?: boolean
  blobCacheControlMaxAge: number
}

export function resolveImageOptimizationConfig(
  overrides?: Partial<ImageOptimizationConfig>,
): ImageOptimizationConfig {
  return {
    ...IMAGE_OPTIMIZATION_CONFIG,
    ...overrides,
    widths: overrides?.widths ?? IMAGE_OPTIMIZATION_CONFIG.widths,
  }
}

export function listOutputWidths(actualWidth: number, widths: readonly number[] = IMAGE_VARIANT_WIDTHS): number[] {
  const smaller = widths.filter((width) => width < actualWidth)
  return [...smaller, actualWidth]
}
