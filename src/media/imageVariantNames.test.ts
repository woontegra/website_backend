/**
 * Run: npx tsx --test src/media/imageVariantNames.test.ts
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildOptimizedFileName,
  isOptimizedFileName,
  parseOptimizedFileName,
  replacePathFileName,
  requireUploadedCanonical,
  variantMarkerForFormats,
} from './imageVariantNames'

test('builds deterministic opt and optavif filenames', () => {
  assert.equal(buildOptimizedFileName('hero-123', 1920, 'jpeg', 'opt'), 'hero-123.opt-w1920.jpg')
  assert.equal(buildOptimizedFileName('hero-123', 480, 'webp', 'opt'), 'hero-123.opt-w480.webp')
  assert.equal(buildOptimizedFileName('hero-123', 960, 'avif', 'optavif'), 'hero-123.optavif-w960.avif')
  assert.equal(variantMarkerForFormats(true), 'optavif')
  assert.equal(variantMarkerForFormats(false), 'opt')
})

test('parses optimized names and rejects legacy cms urls', () => {
  const webpOnly = parseOptimizedFileName('woontegra-slider-1.opt-w1920.jpg')
  assert.deepEqual(webpOnly, {
    stem: 'woontegra-slider-1',
    marker: 'opt',
    width: 1920,
    ext: 'jpg',
    hasAvif: false,
    hasWebp: true,
  })
  const withAvif = parseOptimizedFileName('woontegra-slider-1.optavif-w1920.jpg')
  assert.equal(withAvif?.hasAvif, true)
  assert.equal(withAvif?.marker, 'optavif')
  assert.equal(isOptimizedFileName('woontegra-slider-1.opt-w480.webp'), true)
  assert.equal(
    isOptimizedFileName('woontegra-slider-1-mobil-jpg-1787414087442-13a511870b.jpeg'),
    false,
  )
  assert.equal(isOptimizedFileName('logo.svg'), false)
})

test('replaces only the filename segment of a blob url', () => {
  const url =
    'https://example.public.blob.vercel-storage.com/website-media/hero/hero-123.opt-w1920.jpg'
  assert.equal(
    replacePathFileName(url, 'hero-123.opt-w480.webp'),
    'https://example.public.blob.vercel-storage.com/website-media/hero/hero-123.opt-w480.webp',
  )
})

test('canonical URL dönmez eğer storage upload başarısızsa', () => {
  assert.throws(
    () => requireUploadedCanonical(new Map(), 'hero-123.opt-w1920.jpg'),
    /canonical görsel yüklenemedi/,
  )
  assert.throws(
    () =>
      requireUploadedCanonical(
        new Map([['hero-123.opt-w1920.jpg', { url: '   ' }]]),
        'hero-123.opt-w1920.jpg',
      ),
    /canonical görsel yüklenemedi/,
  )
  const ok = requireUploadedCanonical(
    new Map([
      [
        'hero-123.opt-w1920.jpg',
        { url: 'https://cdn.example.com/hero-123.opt-w1920.jpg', pathname: 'website-media/hero/hero-123.opt-w1920.jpg' },
      ],
    ]),
    'hero-123.opt-w1920.jpg',
  )
  assert.equal(ok.url, 'https://cdn.example.com/hero-123.opt-w1920.jpg')
})
