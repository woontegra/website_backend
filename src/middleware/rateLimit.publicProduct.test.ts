import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import type { AddressInfo } from 'node:net'
import type { Request } from 'express'
import {
  LICENSE_PUBLIC_RATE_LIMIT_MAX,
  PUBLIC_BH_PRODUCT_READ_MAX,
  createLicensePublicRateLimiter,
  createPublicBhProductReadRateLimiter,
  shouldSkipGlobalRateLimit,
} from './rateLimit.middleware'

const previousNodeEnv = process.env.NODE_ENV

function listen(app: express.Express): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((done, reject) => {
            server.close((err) => (err ? reject(err) : done()))
          }),
      })
    })
  })
}

test('public BH fiyat okuması lisans deneme limitinden ayrıdır', async () => {
  process.env.NODE_ENV = 'production'
  process.env.SMOKE_TEST_MODE = 'false'
  assert.equal(LICENSE_PUBLIC_RATE_LIMIT_MAX, 40)
  assert.ok(PUBLIC_BH_PRODUCT_READ_MAX >= 120)

  const licenseLimiter = createLicensePublicRateLimiter()
  const app = express()
  app.set('trust proxy', 1)
  app.get('/api/bh/product', createPublicBhProductReadRateLimiter(), (_req, res) => {
    res.json({ success: true, data: { price: 2_000_000, priceMonthly: 2_000 } })
  })
  app.post('/api/bh/demo/request', licenseLimiter, (_req, res) => {
    res.json({ success: true })
  })
  app.post('/api/bh/checkout/create-order', licenseLimiter, (_req, res) => {
    res.json({ success: true })
  })

  const server = await listen(app)
  try {
    for (let i = 0; i < 12; i += 1) {
      const res = await fetch(`${server.url}/api/bh/product`)
      assert.equal(res.status, 200, `ürün okuma ${i + 1} 429 oldu`)
      const body = (await res.json()) as { data?: { price?: number; priceMonthly?: number } }
      assert.equal(body.data?.price, 2_000_000)
      assert.equal(body.data?.priceMonthly, 2_000)
    }

    for (let i = 0; i < LICENSE_PUBLIC_RATE_LIMIT_MAX; i += 1) {
      const res = await fetch(`${server.url}/api/bh/demo/request`, { method: 'POST' })
      assert.equal(res.status, 200, `demo limiti erken doldu (${i + 1})`)
    }
    const blockedDemo = await fetch(`${server.url}/api/bh/demo/request`, { method: 'POST' })
    assert.equal(blockedDemo.status, 429)
    const blockedBody = (await blockedDemo.json()) as { message?: string }
    assert.equal(blockedBody.message, 'Çok fazla deneme. Lütfen bir süre sonra tekrar deneyin.')

    const blockedCheckout = await fetch(`${server.url}/api/bh/checkout/create-order`, { method: 'POST' })
    assert.equal(blockedCheckout.status, 429)

    const productAfter = await fetch(`${server.url}/api/bh/product`)
    assert.equal(productAfter.status, 200)

    const asRequest = (method: string, originalUrl: string) =>
      ({ method, originalUrl, url: originalUrl, get: () => undefined }) as unknown as Request

    assert.equal(shouldSkipGlobalRateLimit(asRequest('GET', '/api/bh/product')), false)
    assert.equal(shouldSkipGlobalRateLimit(asRequest('GET', '/api/products')), true)
    assert.equal(shouldSkipGlobalRateLimit(asRequest('POST', '/api/bh/quote')), false)
    assert.equal(shouldSkipGlobalRateLimit(asRequest('POST', '/api/bh/demo/request')), false)
    assert.equal(shouldSkipGlobalRateLimit(asRequest('POST', '/api/bh/checkout/create-order')), false)
    assert.equal(shouldSkipGlobalRateLimit(asRequest('POST', '/api/payments/paytr/callback')), true)
    assert.equal(shouldSkipGlobalRateLimit(asRequest('POST', '/api/auth/login')), false)
  } finally {
    await server.close()
    process.env.NODE_ENV = previousNodeEnv
  }
})
