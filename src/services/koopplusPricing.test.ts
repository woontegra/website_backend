/**
 * Run: npx tsx --test src/services/koopplusPricing.test.ts
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { clampKoopPlusQuantity, computeKoopPlusLinePrice } from './koopplusPricing.service'

const base = { firstPrice: 9000, additionalPrice: 5000, hasActiveYearlyCooperative: false, renewalTier: null }

test('yeni müşteri: ilk kooperatif 9.000, ek kooperatifler 5.000', () => {
  assert.equal(computeKoopPlusLinePrice({ ...base, quantity: 1 }).total, 9000)
  const three = computeKoopPlusLinePrice({ ...base, quantity: 3 })
  assert.equal(three.total, 19000)
  assert.equal(three.firstUnits, 1)
  assert.equal(three.additionalUnits, 2)
  assert.equal(three.reason, 'new_customer')
})

test('aktif yıllık kooperatifi olan müşteri: bütün adetler ek fiyattan', () => {
  const r = computeKoopPlusLinePrice({ ...base, quantity: 2, hasActiveYearlyCooperative: true })
  assert.equal(r.total, 10000)
  assert.equal(r.firstUnits, 0)
  assert.equal(r.reason, 'existing_customer')
})

test('yenileme: ilk kooperatif ilk fiyattan, ek kooperatif ek fiyattan', () => {
  assert.equal(computeKoopPlusLinePrice({ ...base, quantity: 1, renewalTier: 'first' }).total, 9000)
  assert.equal(computeKoopPlusLinePrice({ ...base, quantity: 1, renewalTier: 'additional' }).total, 5000)
  // Yenilemede başka aktif kooperatif olması ilk kooperatifin fiyatını değiştirmez.
  assert.equal(
    computeKoopPlusLinePrice({ ...base, quantity: 1, renewalTier: 'first', hasActiveYearlyCooperative: true }).total,
    9000,
  )
})

test('adet 1–20 arasına sıkıştırılır', () => {
  assert.equal(clampKoopPlusQuantity(0), 1)
  assert.equal(clampKoopPlusQuantity('abc'), 1)
  assert.equal(clampKoopPlusQuantity(25), 20)
  assert.equal(clampKoopPlusQuantity(3.7), 3)
})
