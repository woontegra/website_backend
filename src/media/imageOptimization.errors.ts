export type ImageOptimizationErrorCode =
  | 'IMAGE_TOO_LARGE'
  | 'IMAGE_PIXEL_LIMIT'
  | 'IMAGE_TRANSFORM_FAILED'

export class ImageOptimizationError extends Error {
  readonly code: ImageOptimizationErrorCode

  constructor(code: ImageOptimizationErrorCode, message: string) {
    super(message)
    this.name = 'ImageOptimizationError'
    this.code = code
  }
}

export function isImageOptimizationError(error: unknown): error is ImageOptimizationError {
  return error instanceof ImageOptimizationError
}
