/**
 * Run: npx tsx --test src/media/imageOptimization.service.test.ts
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { listOutputWidths } from './imageOptimization.config'
import { ImageOptimizationError } from './imageOptimization.errors'
import { isAvifEncodeSupported, optimizeRasterImage } from './imageOptimization.service'
import { prepareCatalogImageForStorage } from './prepareCatalogImage'

async function jpegFixture(width: number, height: number, orientation?: number): Promise<Buffer> {
  const image = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 30, g: 120, b: 200 },
    },
  }).jpeg({ quality: 90 })
  if (orientation) return image.withMetadata({ orientation }).toBuffer()
  return image.toBuffer()
}

async function pngFixture(width: number, height: number, alpha = false): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: alpha ? 4 : 3,
      background: alpha ? { r: 20, g: 180, b: 90, alpha: 0.6 } : { r: 20, g: 180, b: 90 },
    },
  })
    .png()
    .toBuffer()
}

test('6000x4000 JPEG max 1920 olur, upscale yok, webp/avif varyantları doğru', async () => {
  const buffer = await jpegFixture(6000, 4000)
  const set = await optimizeRasterImage({ buffer, stem: 'big-photo' })
  assert.equal(set.width, 1920)
  assert.equal(set.height, 1280)
  assert.equal(set.canonical.format, 'jpeg')
  if (await isAvifEncodeSupported()) {
    assert.equal(set.hasAvif, true)
    assert.match(set.canonical.fileName, /\.optavif-w1920\.jpg$/)
  } else {
    assert.equal(set.hasAvif, false)
    assert.match(set.canonical.fileName, /\.opt-w1920\.jpg$/)
  }
  assert.ok(set.canonical.fileSize < buffer.length || set.canonical.width <= 1920)

  const widths = [...new Set(set.files.map((file) => file.width))].sort((a, b) => a - b)
  assert.deepEqual(widths, [480, 960, 1440, 1920])
  assert.equal(set.files.some((file) => file.width > 1920), false)

  const webp = set.files.filter((file) => file.format === 'webp')
  assert.deepEqual(
    webp.map((file) => file.width).sort((a, b) => a - b),
    [480, 960, 1440, 1920],
  )

  if (set.hasAvif) {
    const avif = set.files.filter((file) => file.format === 'avif')
    assert.deepEqual(
      avif.map((file) => file.width).sort((a, b) => a - b),
      [480, 960, 1440, 1920],
    )
  } else {
    assert.equal(set.files.some((file) => file.format === 'avif'), false)
  }

  const meta = await sharp(set.canonical.buffer).metadata()
  assert.equal(meta.width, 1920)
  assert.equal(meta.height, 1280)
  assert.equal(meta.orientation, undefined)
})

test('800 px küçük JPEG 960/1440/1920 upscale edilmez', async () => {
  const buffer = await jpegFixture(800, 500)
  const set = await optimizeRasterImage({ buffer, stem: 'small-photo' })
  assert.equal(set.width, 800)
  assert.equal(set.height, 500)
  const widths = [...new Set(set.files.map((file) => file.width))].sort((a, b) => a - b)
  assert.deepEqual(widths, [480, 800])
  assert.equal(set.files.some((file) => file.width === 960 || file.width === 1440 || file.width === 1920), false)
  assert.deepEqual(listOutputWidths(800), [480, 800])
})

test('PNG şeffaflık korunarak işlenir', async () => {
  const buffer = await pngFixture(1200, 800, true)
  const set = await optimizeRasterImage({ buffer, stem: 'alpha-logo' })
  assert.equal(set.canonical.format, 'webp')
  assert.match(set.canonical.fileName, set.hasAvif ? /\.optavif-w1200\.webp$/ : /\.opt-w1200\.webp$/)
  const meta = await sharp(set.canonical.buffer).metadata()
  assert.equal(meta.hasAlpha, true)
  assert.equal(meta.width, 1200)
  assert.equal(set.files.some((file) => file.format === 'jpeg'), false)
})

test('EXIF orientation uygulanır ve metadata çıktıya taşınmaz', async () => {
  const buffer = await jpegFixture(600, 400, 6)
  const set = await optimizeRasterImage({ buffer, stem: 'rotated' })
  const meta = await sharp(set.canonical.buffer).metadata()
  assert.equal(meta.width, 400)
  assert.equal(meta.height, 600)
  assert.equal(meta.orientation, undefined)
})

test('SVG prepare aşamasında rasterize edilmez', async () => {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#111"/></svg>',
  )
  const prepared = await prepareCatalogImageForStorage(
    { mimetype: 'image/svg+xml', buffer: svg },
    'logo',
  )
  assert.equal(prepared.mode, 'passthrough')
})

test('AVIF kapalıysa opt marker kullanılır ve avif dosya üretilmez', async () => {
  const buffer = await jpegFixture(800, 500)
  const set = await optimizeRasterImage({ buffer, stem: 'no-avif', config: { avifEnabled: false } })
  assert.equal(set.hasAvif, false)
  assert.equal(set.marker, 'opt')
  assert.match(set.canonical.fileName, /\.opt-w800\.jpg$/)
  assert.equal(set.files.some((file) => file.format === 'avif'), false)
  assert.equal(set.files.some((file) => file.format === 'webp'), true)
})

test('bozuk raster buffer kırık canonical üretmez', async () => {
  await assert.rejects(
    () => optimizeRasterImage({ buffer: Buffer.from('not-an-image'), stem: 'broken' }),
    (error: unknown) =>
      error instanceof ImageOptimizationError && error.code === 'IMAGE_TRANSFORM_FAILED',
  )
})

test('düşük pixel limit aşırı çözünürlükte hata verir', async () => {
  const buffer = await jpegFixture(80, 60)
  await assert.rejects(
    () => optimizeRasterImage({ buffer, stem: 'tiny-limit', config: { maxInputPixels: 20 } }),
    (error: unknown) => error instanceof ImageOptimizationError && error.code === 'IMAGE_PIXEL_LIMIT',
  )
})

test('upload response için mevcut alanlar optimize sette korunur', async () => {
  const buffer = await jpegFixture(640, 400)
  const set = await optimizeRasterImage({ buffer, stem: 'compat' })
  const data = {
    id: 'media-1',
    fileName: set.canonical.fileName,
    originalName: 'compat.jpg',
    mimeType: set.canonical.mimeType,
    fileType: 'IMAGE',
    fileSize: set.canonical.fileSize,
    url: `/uploads/catalog/${set.canonical.fileName}`,
    storageKey: null,
    storageProvider: 'LOCAL',
    bucket: null,
    publicUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    width: set.width,
    height: set.height,
    format: set.format,
    variants: set.files.map((file) => ({
      width: file.width,
      format: file.format,
      mimeType: file.mimeType,
      url: `/uploads/catalog/${file.fileName}`,
    })),
  }
  assert.equal(typeof data.id, 'string')
  assert.equal(typeof data.url, 'string')
  assert.equal(typeof data.fileName, 'string')
  assert.equal(typeof data.mimeType, 'string')
  assert.equal(typeof data.fileSize, 'number')
  assert.equal(data.fileType, 'IMAGE')
  assert.ok(data.url.endsWith(set.canonical.fileName))
  assert.ok(Array.isArray(data.variants))
})
