/**
 * Run: npx tsx --test src/lib/productGallery.test.ts
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PRODUCT_GALLERY_MAX_IMAGES,
  normalizeProductGalleryMediaIds,
  publicProductScreenshotAlt,
} from './productGallery'

test('gallery media ids keep order, drop blanks/duplicates, cap at 10', () => {
  const ids = [' a ', 'b', 'a', '', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l']
  const out = normalizeProductGalleryMediaIds(ids)
  assert.equal(PRODUCT_GALLERY_MAX_IMAGES, 10)
  assert.deepEqual(out, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'])
})

test('empty gallery is valid', () => {
  assert.deepEqual(normalizeProductGalleryMediaIds(null), [])
  assert.deepEqual(normalizeProductGalleryMediaIds([]), [])
})

test('public screenshot alt is numbered only when there are multiple images', () => {
  assert.equal(publicProductScreenshotAlt('KoopPlus', 0, 1), 'KoopPlus ekran görüntüsü')
  assert.equal(publicProductScreenshotAlt('KoopPlus', 0, 3), 'KoopPlus ekran görüntüsü 1')
  assert.equal(publicProductScreenshotAlt('KoopPlus', 2, 3), 'KoopPlus ekran görüntüsü 3')
})
