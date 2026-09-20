import assert from 'node:assert/strict'
import {
  hasImageUrl,
  PUBLISH_IMAGE_REQUIRED_MESSAGE,
  resolveNextCoverImageUrl,
} from '../src/lib/publishImageValidation.js'

function testUrlOnlyCoverCounts() {
  const next = resolveNextCoverImageUrl({
    currentCoverUrl: '/images/products/koopplus-icon.png',
    coverImageMediaId: null,
    mediaResolvedUrl: undefined,
    coverImage: '/images/products/koopplus-icon.png',
  })
  assert.equal(next, '/images/products/koopplus-icon.png')
  assert.equal(hasImageUrl(next), true)
}

function testMediaIdClearedWithoutUrlBlocks() {
  const next = resolveNextCoverImageUrl({
    currentCoverUrl: 'https://cdn.example.com/old-media.png',
    coverImageMediaId: null,
    mediaResolvedUrl: undefined,
    coverImage: undefined,
  })
  assert.equal(next, null)
  assert.equal(hasImageUrl(next), false)
}

function testSelectedMediaWins() {
  const next = resolveNextCoverImageUrl({
    currentCoverUrl: '/images/old.png',
    coverImageMediaId: 'media-1',
    mediaResolvedUrl: 'https://cdn.example.com/new.png',
    coverImage: undefined,
  })
  assert.equal(next, 'https://cdn.example.com/new.png')
}

function testKeepCurrentWhenCoverNotInPayload() {
  const next = resolveNextCoverImageUrl({
    currentCoverUrl: '/images/products/sifre-kasasi.png',
    coverImageMediaId: undefined,
    mediaResolvedUrl: undefined,
    coverImage: undefined,
  })
  assert.equal(next, '/images/products/sifre-kasasi.png')
}

function testEmptyUrlDoesNotPublish() {
  const next = resolveNextCoverImageUrl({
    currentCoverUrl: null,
    coverImageMediaId: null,
    coverImage: '   ',
  })
  assert.equal(hasImageUrl(next), false)
}

function main() {
  testUrlOnlyCoverCounts()
  testMediaIdClearedWithoutUrlBlocks()
  testSelectedMediaWins()
  testKeepCurrentWhenCoverNotInPayload()
  testEmptyUrlDoesNotPublish()
  assert.equal(PUBLISH_IMAGE_REQUIRED_MESSAGE, 'Bu içerik yayına alınamaz. Görsel alanı zorunludur.')
  console.log('publish-cover-resolve tests: OK')
}

main()
