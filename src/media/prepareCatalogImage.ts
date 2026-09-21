import { shouldAttemptRasterOptimization } from './imageOptimization.policy'
import {
  inspectRasterForOptimization,
  optimizeRasterImage,
  shouldPassthroughInspectedImage,
  type OptimizedImageSet,
} from './imageOptimization.service'
import type { ImageOptimizationConfig } from './imageOptimization.config'

export type PreparedCatalogImage =
  | { mode: 'passthrough' }
  | { mode: 'optimized'; set: OptimizedImageSet }

export async function prepareCatalogImageForStorage(
  file: { mimetype: string; buffer: Buffer },
  stem: string,
  config?: Partial<ImageOptimizationConfig>,
): Promise<PreparedCatalogImage> {
  if (!shouldAttemptRasterOptimization(file.mimetype)) {
    return { mode: 'passthrough' }
  }

  const inspected = await inspectRasterForOptimization(file.buffer, config)
  if (shouldPassthroughInspectedImage(inspected)) {
    return { mode: 'passthrough' }
  }

  const set = await optimizeRasterImage({
    buffer: file.buffer,
    stem,
    config,
  })
  return { mode: 'optimized', set }
}
