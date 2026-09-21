/**
 * Run: npx tsx --test src/media/imageOptimization.policy.test.ts
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyCatalogFileType } from '../services/catalogMedia.service'
import {
  assertRasterImageByteLimit,
  assertSafePixelCount,
  shouldAttemptRasterOptimization,
} from './imageOptimization.policy'
import { ImageOptimizationError } from './imageOptimization.errors'
import { IMAGE_OPTIMIZATION_CONFIG } from './imageOptimization.config'

test('IMAGE olmayan installer/document dosyaları optimize edilmez', () => {
  assert.equal(classifyCatalogFileType('application/x-msdownload', 'Setup.exe'), 'DOWNLOAD')
  assert.equal(classifyCatalogFileType('application/x-msi', 'Setup.msi'), 'DOWNLOAD')
  assert.equal(classifyCatalogFileType('application/zip', 'portable.zip'), 'DOWNLOAD')
  assert.equal(classifyCatalogFileType('application/pdf', 'sozlesme.pdf'), 'DOCUMENT')
  assert.equal(shouldAttemptRasterOptimization('application/x-msdownload'), false)
  assert.equal(shouldAttemptRasterOptimization('application/pdf'), false)
  assert.equal(shouldAttemptRasterOptimization('application/zip'), false)
})

test('SVG rasterize edilmez, JPEG/PNG/WebP/AVIF optimize edilir', () => {
  assert.equal(shouldAttemptRasterOptimization('image/svg+xml'), false)
  assert.equal(shouldAttemptRasterOptimization('image/gif'), false)
  assert.equal(shouldAttemptRasterOptimization('image/jpeg'), true)
  assert.equal(shouldAttemptRasterOptimization('image/png'), true)
  assert.equal(shouldAttemptRasterOptimization('image/webp'), true)
  assert.equal(shouldAttemptRasterOptimization('image/avif'), true)
})

test('raster image 20 MB üstü anlaşılır hata verir', () => {
  assert.throws(
    () =>
      assertRasterImageByteLimit({
        mimetype: 'image/jpeg',
        size: IMAGE_OPTIMIZATION_CONFIG.maxUploadBytes + 1,
        buffer: Buffer.alloc(8),
      }),
    (error: unknown) =>
      error instanceof ImageOptimizationError &&
      error.code === 'IMAGE_TOO_LARGE' &&
      /20 MB/.test(error.message),
  )
  assert.doesNotThrow(() =>
    assertRasterImageByteLimit({
      mimetype: 'application/x-msdownload',
      size: 80 * 1024 * 1024,
    }),
  )
})

test('aşırı piksel boyutu anlaşılır hata verir', () => {
  assert.throws(
    () => assertSafePixelCount(10000, 8000, 40_000_000),
    (error: unknown) => error instanceof ImageOptimizationError && error.code === 'IMAGE_PIXEL_LIMIT',
  )
  assert.doesNotThrow(() => assertSafePixelCount(6000, 4000, 40_000_000))
})
