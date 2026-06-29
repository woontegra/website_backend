/**
 * Vercel Blob bağlantı testi — token değerini yazdırmaz.
 * Kullanım: BLOB_READ_WRITE_TOKEN=... node scripts/test-blob-put.mjs
 */
import 'dotenv/config'
import { put } from '@vercel/blob'

const TOKEN_KEYS = ['BLOB_READ_WRITE_TOKEN', 'VERCEL_BLOB_READ_WRITE_TOKEN', 'BLOB_TOKEN']

function resolveToken() {
  for (const key of TOKEN_KEYS) {
    const value = process.env[key]?.trim()
    if (value) return { key, value }
  }
  return null
}

async function main() {
  const resolved = resolveToken()
  if (!resolved) {
    console.error('blobConfigured=false — BLOB_READ_WRITE_TOKEN tanımlı değil.')
    process.exit(1)
  }

  console.log(`blobConfigured=true tokenEnvKey=${resolved.key}`)

  const pathname = `website-media/hero/blob-self-test-${Date.now()}.png`
  const png1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )

  const blob = await put(pathname, png1x1, {
    access: 'public',
    token: resolved.value,
    contentType: 'image/png',
    addRandomSuffix: false,
  })

  const isBlobUrl = /\.blob\.vercel-storage\.com/i.test(blob.url)
  console.log('upload ok', {
    pathname: blob.pathname,
    isBlobUrl,
    urlHost: new URL(blob.url).host,
  })

  if (!isBlobUrl) {
    console.error('Beklenen Blob URL değil:', blob.url)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('upload failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
