/**
 * Run: npx tsx --test src/lib/koopplusIntegration.test.ts
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import {
  koopPlusApiBase,
  postKoopPlusJson,
  signKoopPlusBody,
} from './koopplusIntegration'
import { isKoopPlusProduct, isKoopPlusSlug, normalizeKoopPlusLicenseKey } from './koopplusProduct'
import {
  buildKoopPlusOrderPayload,
  formatKoopPlusPaymentDate,
  isRetryableKoopPlusStatus,
  sanitizeKoopPlusError,
} from './koopplusOrderPayload'
import { callKoopPlusOrderWithRetry } from '../services/koopplusProvision.service'

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef'

test('signKoopPlusBody: HMAC-SHA256 of `${timestamp}.${rawBody}`', () => {
  const raw = JSON.stringify({ orderId: 'ORD-1', amount: 6000 })
  const { timestamp, signature } = signKoopPlusBody(raw, { secret: SECRET, nowSeconds: 1_700_000_000 })
  assert.equal(timestamp, '1700000000')
  const expected = createHmac('sha256', SECRET).update(`1700000000.${raw}`, 'utf8').digest('hex')
  assert.equal(signature, expected)
  assert.match(signature, /^[0-9a-f]{64}$/)
})

test('signKoopPlusBody: throws without secret', () => {
  const prev = process.env.INTEGRATION_SECRET
  delete process.env.INTEGRATION_SECRET
  try {
    assert.throws(() => signKoopPlusBody('{}'))
  } finally {
    if (prev !== undefined) process.env.INTEGRATION_SECRET = prev
  }
})

test('koopPlusApiBase: default and trailing slash', () => {
  const prev = process.env.KOOPPLUS_API_URL
  delete process.env.KOOPPLUS_API_URL
  assert.equal(koopPlusApiBase(), 'https://api.koopplus.woontegra.com')
  process.env.KOOPPLUS_API_URL = 'https://example.test/'
  assert.equal(koopPlusApiBase(), 'https://example.test')
  if (prev === undefined) delete process.env.KOOPPLUS_API_URL
  else process.env.KOOPPLUS_API_URL = prev
})

test('postKoopPlusJson: signs the exact sent body, no Origin header (mock fetch)', async () => {
  const prevSecret = process.env.INTEGRATION_SECRET
  const prevFetch = globalThis.fetch
  process.env.INTEGRATION_SECRET = SECRET
  let captured: { url: string; init: RequestInit } | null = null
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    captured = { url: String(url), init: init ?? {} }
    return new Response(JSON.stringify({ success: true, data: { action: 'created' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const res = await postKoopPlusJson('/api/integrations/orders', { orderId: 'ORD-9', amount: 1 })
    assert.equal(res.ok, true)
    assert.equal(res.status, 200)
    assert.ok(captured)
    const c = captured as unknown as { url: string; init: RequestInit }
    assert.ok(c.url.endsWith('/api/integrations/orders'))
    const headers = c.init.headers as Record<string, string>
    const lower = Object.keys(headers).map((h) => h.toLowerCase())
    assert.ok(!lower.includes('origin'))
    assert.ok(!lower.includes('sec-fetch-site'))
    const body = c.init.body as string
    assert.equal(body, JSON.stringify({ orderId: 'ORD-9', amount: 1 }))
    const expected = createHmac('sha256', SECRET)
      .update(`${headers['X-Koop-Timestamp']}.${body}`, 'utf8')
      .digest('hex')
    assert.equal(headers['X-Koop-Signature'], expected)
  } finally {
    globalThis.fetch = prevFetch
    if (prevSecret === undefined) delete process.env.INTEGRATION_SECRET
    else process.env.INTEGRATION_SECRET = prevSecret
  }
})

test('postKoopPlusJson: network error → status 0, no throw', async () => {
  const prevSecret = process.env.INTEGRATION_SECRET
  const prevFetch = globalThis.fetch
  process.env.INTEGRATION_SECRET = SECRET
  globalThis.fetch = (async () => {
    throw new Error('boom')
  }) as typeof fetch
  try {
    const res = await postKoopPlusJson('/x', {})
    assert.equal(res.ok, false)
    assert.equal(res.status, 0)
  } finally {
    globalThis.fetch = prevFetch
    if (prevSecret === undefined) delete process.env.INTEGRATION_SECRET
    else process.env.INTEGRATION_SECRET = prevSecret
  }
})

test('isKoopPlusProduct: slug detection', () => {
  assert.equal(isKoopPlusSlug('koopplus'), true)
  assert.equal(isKoopPlusSlug(' KoopPlus '), true)
  assert.equal(isKoopPlusSlug('muvekkil-kasa-saas'), false)
  assert.equal(isKoopPlusSlug(null), false)
  assert.equal(isKoopPlusProduct({ productSlug: 'koopplus' }), true)
  assert.equal(isKoopPlusProduct({ product: { slug: 'koopplus' } }), true)
  assert.equal(isKoopPlusProduct({ slug: 'bilirkisi-hesap' }), false)
  assert.equal(isKoopPlusProduct(null), false)
})

test('normalizeKoopPlusLicenseKey', () => {
  assert.equal(normalizeKoopPlusLicenseKey(' koop-abcd-1234-efgh-5678 '), 'KOOP-ABCD-1234-EFGH-5678')
  assert.equal(normalizeKoopPlusLicenseKey('x'), null)
  assert.equal(normalizeKoopPlusLicenseKey('bad key!'), null)
  assert.equal(normalizeKoopPlusLicenseKey(null), null)
})

test('buildKoopPlusOrderPayload', () => {
  const payload = buildKoopPlusOrderPayload({
    order: {
      orderNo: 'WNT-20261107-0001',
      customerName: 'Ayşe Yılmaz',
      customerEmail: ' Ayse@Ornek.com ',
      customerPhone: '0532 000 00 00',
      companyName: 'Güneş Tarım Kooperatifi',
      billingCity: 'Konya',
      billingDistrict: 'Selçuklu',
      paidAt: new Date('2026-11-07T22:30:00Z'), // 01:30 TR → 8 Kasım
    },
    amount: 6000.004,
    licenseKey: 'KOOP-AAAA-BBBB-CCCC-DDDD',
  })
  assert.equal(payload.orderId, 'WNT-20261107-0001')
  assert.equal(payload.email, 'ayse@ornek.com')
  assert.equal(payload.cooperativeName, 'Güneş Tarım Kooperatifi')
  assert.equal(payload.paymentDate, '2026-11-08')
  assert.equal(payload.amount, 6000)
  assert.equal(payload.licenseKey, 'KOOP-AAAA-BBBB-CCCC-DDDD')

  const minimal = buildKoopPlusOrderPayload({
    order: { orderNo: 'N1', customerName: 'Ali', customerEmail: 'a@b.co' },
    amount: 10,
    now: new Date('2026-01-02T10:00:00Z'),
  })
  assert.equal(minimal.cooperativeName, 'Ali')
  assert.equal('phone' in minimal, false)
  assert.equal('licenseKey' in minimal, false)
  assert.equal(minimal.paymentDate, '2026-01-02')
  assert.equal(formatKoopPlusPaymentDate(new Date('2026-01-01T21:00:00Z')), '2026-01-02')
})

test('sanitizeKoopPlusError masks emails and license keys', () => {
  const msg = sanitizeKoopPlusError('Kullanıcı ayse@ornek.com KOOP-AAAA-BBBB-CCCC-DDDD hata', 409)
  assert.ok(!msg.includes('ayse@ornek.com'))
  assert.ok(!msg.includes('KOOP-AAAA'))
  assert.ok(msg.startsWith('KoopPlus HTTP 409'))
})

test('retry classification', () => {
  assert.equal(isRetryableKoopPlusStatus(0), true)
  assert.equal(isRetryableKoopPlusStatus(500), true)
  assert.equal(isRetryableKoopPlusStatus(429), true)
  assert.equal(isRetryableKoopPlusStatus(400), false)
  assert.equal(isRetryableKoopPlusStatus(409), false)
})

test('callKoopPlusOrderWithRetry: 3 attempts with 0/2s/8s backoff, stops on success', async () => {
  const waits: number[] = []
  let calls = 0
  const res = await callKoopPlusOrderWithRetry(
    { orderId: 'X' },
    {
      post: async () => {
        calls += 1
        return calls < 3
          ? { ok: false, status: 502, json: { success: false } }
          : { ok: true, status: 200, json: { success: true } }
      },
      sleepFn: async (ms) => {
        waits.push(ms)
      },
    },
  )
  assert.equal(res.ok, true)
  assert.equal(res.attempts, 3)
  assert.deepEqual(waits, [2000, 8000])
})

test('callKoopPlusOrderWithRetry: no retry on 4xx', async () => {
  let calls = 0
  const res = await callKoopPlusOrderWithRetry(
    {},
    {
      post: async () => {
        calls += 1
        return { ok: false, status: 400, json: { success: false, error: 'x' } }
      },
      sleepFn: async () => {},
    },
  )
  assert.equal(res.ok, false)
  assert.equal(calls, 1)
})
