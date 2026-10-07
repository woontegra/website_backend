import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateCouponQuote } from './couponCheckout'
import { chargeBhDesktop } from './bhDesktopPayable'

const LIST = 15_000

function coupon(endsAt: string | null) {
  return {
    id: 'c1',
    name: 'Bilirkişi',
    code: 'BILIRKISI',
    isActive: true,
    discountType: 'percent' as const,
    discountValue: 25,
    endsAt,
    productIds: [] as string[],
  }
}

test('normal Desktop satın alma 15.000 TL', () => {
  const result = chargeBhDesktop({ listTl: LIST })
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.charge.totalTl, 15_000)
})

test('aktif baro %40', () => {
  const result = chargeBhDesktop({ listTl: LIST, campaignDiscountRate: 40 })
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.charge.totalTl, 9_000)
})

test('baro %40 ve BILIRKISI birleşmez', () => {
  const result = chargeBhDesktop({
    listTl: LIST,
    campaignDiscountRate: 40,
    couponPercent: 25,
    couponRequested: true,
  })
  assert.equal(result.ok, false)
  assert.equal(result.charge.totalTl, 9_000)
  assert.notEqual(result.charge.totalTl, 6_750)
})

test('geçerli BILIRKISI %25', () => {
  const evaluated = evaluateCouponQuote({
    coupon: coupon('2099-01-01T00:00:00.000Z'),
    lines: [{ productId: 'bilirkisi-hesap', quantity: 1, unitPrice: LIST }],
    now: new Date('2026-10-06T00:00:00.000Z'),
  })
  assert.equal(evaluated.ok, true)
  const result = chargeBhDesktop({ listTl: LIST, couponPercent: 25 })
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.charge.totalTl, 11_250)
})

test('süresi geçmiş BILIRKISI indirim uygulamaz', () => {
  const evaluated = evaluateCouponQuote({
    coupon: coupon('2020-01-01T00:00:00.000Z'),
    lines: [{ productId: 'bilirkisi-hesap', quantity: 1, unitPrice: LIST }],
    now: new Date('2026-10-06T00:00:00.000Z'),
  })
  assert.equal(evaluated.ok, false)
  const result = chargeBhDesktop({ listTl: LIST, couponRequested: false })
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.charge.totalTl, 15_000)
})

test('aktif baro yenilemesi %40, bitmiş anlaşma liste fiyatı', () => {
  const active = chargeBhDesktop({ listTl: LIST, campaignDiscountRate: 40 })
  const expired = chargeBhDesktop({ listTl: LIST, campaignDiscountRate: 0 })
  assert.equal(active.ok && active.charge.totalTl, 9_000)
  assert.equal(expired.ok && expired.charge.totalTl, 15_000)
})

test('PayTR ve Havale/EFT aynı tutarı üretir', () => {
  const input = { listTl: LIST, campaignDiscountRate: 40 as number }
  const paytr = chargeBhDesktop({ ...input, provider: 'PAYTR' })
  const bank = chargeBhDesktop({ ...input, provider: 'BANK_TRANSFER' })
  assert.equal(paytr.charge.totalTl, bank.charge.totalTl)
  assert.equal(paytr.charge.listTl, 15_000)
  assert.equal(bank.charge.totalTl, 9_000)
})
