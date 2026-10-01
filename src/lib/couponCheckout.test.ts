import test from 'node:test'
import assert from 'node:assert/strict'
import * as campaignPricing from './campaignPricing'
import { type CouponCheckoutRule, evaluateCouponQuote } from './couponCheckout'
import { shouldDeferPaytrAdminMailUntilPaid } from './orderAdminMail'

const NOW = new Date('2026-10-01T12:00:00.000Z')
const PRODUCT_A = 'prod-bilir-kisi'
const PRODUCT_B = 'prod-muvekkil-kasa'

function rule(overrides: Partial<CouponCheckoutRule> = {}): CouponCheckoutRule {
  return {
    id: 'coupon-1',
    name: 'Yeni Bilirkişi',
    code: 'YENIBILIRKISI',
    isActive: true,
    discountType: 'percent',
    discountValue: 10,
    startsAt: '2026-09-01T00:00:00.000Z',
    endsAt: '2026-12-01T00:00:00.000Z',
    productIds: [PRODUCT_A],
    ...overrides,
  }
}

function paytrKurus(totalTl: number): number {
  return Math.round(totalTl * 100)
}

test('valid coupon discounts only through the coupon rule, not a campaign list', () => {
  const result = evaluateCouponQuote({
    coupon: rule(),
    lines: [{ productId: PRODUCT_A, quantity: 1, unitPrice: 2000 }],
    now: NOW,
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.quote.code, 'YENIBILIRKISI')
  assert.equal(result.quote.couponName, 'Yeni Bilirkişi')
  assert.equal(result.quote.discountAmount, 200)
  assert.equal(result.quote.subtotal, 2000)
  assert.equal(result.quote.total, 1800)
  const orderTotal = result.quote.total
  assert.equal(paytrKurus(orderTotal), 180000)
  assert.equal(Number(orderTotal), 1800)
})

test('fixed amount is applied once to the cart total', () => {
  const result = evaluateCouponQuote({
    coupon: rule({ discountType: 'fixed_amount', discountValue: 150 }),
    lines: [{ productId: PRODUCT_A, quantity: 2, unitPrice: 1000 }],
    now: NOW,
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.quote.discountAmount, 150)
  assert.equal(result.quote.total, 1850)
})

test('wrong product is rejected', () => {
  const result = evaluateCouponQuote({
    coupon: rule(),
    lines: [{ productId: PRODUCT_B, quantity: 1, unitPrice: 2000 }],
    now: NOW,
  })
  assert.deepEqual(result, { ok: false, message: 'Bu kupon seçili ürün için geçerli değildir.' })
})

test('mixed cart is rejected when the coupon lists products', () => {
  const result = evaluateCouponQuote({
    coupon: rule(),
    lines: [
      { productId: PRODUCT_A, quantity: 1, unitPrice: 2000 },
      { productId: PRODUCT_B, quantity: 1, unitPrice: 500 },
    ],
    now: NOW,
  })
  assert.deepEqual(result, { ok: false, message: 'Bu kupon seçili ürün için geçerli değildir.' })
})

test('inactive coupon is rejected', () => {
  const result = evaluateCouponQuote({
    coupon: rule({ isActive: false, endsAt: '2020-01-01T00:00:00.000Z' }),
    lines: [{ productId: PRODUCT_A, quantity: 1, unitPrice: 2000 }],
    now: NOW,
  })
  assert.deepEqual(result, { ok: false, message: 'Bu kupon aktif değildir.' })
})

test('expired coupon is rejected', () => {
  const result = evaluateCouponQuote({
    coupon: rule({ endsAt: '2026-09-01T00:00:00.000Z' }),
    lines: [{ productId: PRODUCT_A, quantity: 1, unitPrice: 2000 }],
    now: NOW,
  })
  assert.deepEqual(result, { ok: false, message: 'Bu kuponun kullanım süresi dolmuştur.' })
})

test('missing coupon is rejected and campaign json is not an input', () => {
  assert.equal('evaluateCheckoutCoupon' in campaignPricing, false)
  const legacyCampaignCoupon = {
    type: 'coupon',
    couponCode: 'ESKIKAMPANYA',
    discountType: 'percent',
    discountValue: 90,
  }
  const result = evaluateCouponQuote({
    coupon: null,
    lines: [{ productId: PRODUCT_A, quantity: 1, unitPrice: 2000 }],
    now: NOW,
  })
  assert.equal(legacyCampaignCoupon.type, 'coupon')
  assert.deepEqual(result, { ok: false, message: 'Bu kupon bulunamadı.' })
})

test('archived coupon is treated as missing', () => {
  const result = evaluateCouponQuote({
    coupon: rule({ archivedAt: '2026-09-15T00:00:00.000Z' }),
    lines: [{ productId: PRODUCT_A, quantity: 1, unitPrice: 2000 }],
    now: NOW,
  })
  assert.deepEqual(result, { ok: false, message: 'Bu kupon bulunamadı.' })
})

test('minimum cart is enforced', () => {
  const result = evaluateCouponQuote({
    coupon: rule({ minimumCartTotal: 3000, productIds: [] }),
    lines: [{ productId: PRODUCT_B, quantity: 1, unitPrice: 2000 }],
    now: NOW,
  })
  assert.deepEqual(result, { ok: false, message: 'Bu kupon için minimum sepet tutarı sağlanmıyor.' })
})

test('usage limit uses the supplied order snapshot count', () => {
  const result = evaluateCouponQuote({
    coupon: rule({ usageLimit: 1 }),
    lines: [{ productId: PRODUCT_A, quantity: 1, unitPrice: 2000 }],
    usage: { totalUses: 1, customerUses: 0, customerPriorOrders: 0 },
    now: NOW,
  })
  assert.deepEqual(result, { ok: false, message: 'Bu kuponun kullanım limiti dolmuştur.' })
})

test('PayTR pending admin mail stays deferred and paid callback mail stays allowed', () => {
  assert.equal(shouldDeferPaytrAdminMailUntilPaid('PAYTR', false), true)
  assert.equal(shouldDeferPaytrAdminMailUntilPaid('PAYTR', undefined), true)
  assert.equal(shouldDeferPaytrAdminMailUntilPaid('PAYTR', true), false)
  assert.equal(shouldDeferPaytrAdminMailUntilPaid('BANK_TRANSFER', false), false)
})
