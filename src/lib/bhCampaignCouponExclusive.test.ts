import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CAMPAIGN_COUPON_EXCLUSIVE_MESSAGE,
  institutionalCampaignDiscountActive,
  resolveExclusiveBhPayable,
} from './bhCampaignCouponExclusive'

test('normal checkout without coupon stays at list price', () => {
  const result = resolveExclusiveBhPayable({ listPrice: 20000, campaignDiscountRate: 0, couponPercent: 0 })
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.total, 20000)
})

test('normal checkout with 25 percent coupon', () => {
  const result = resolveExclusiveBhPayable({ listPrice: 20000, campaignDiscountRate: null, couponPercent: 25 })
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.total, 15000)
})

test('40 percent institutional campaign without coupon', () => {
  const result = resolveExclusiveBhPayable({ listPrice: 20000, campaignDiscountRate: 40, couponRequested: false })
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.total, 12000)
})

test('campaign plus coupon is rejected and does not produce 9000', () => {
  const result = resolveExclusiveBhPayable({
    listPrice: 20000,
    campaignDiscountRate: 40,
    couponPercent: 25,
    couponRequested: true,
  })
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.message, CAMPAIGN_COUPON_EXCLUSIVE_MESSAGE)
    assert.equal(result.total, 12000)
    assert.notEqual(result.total, 9000)
  }
})

test('invalid campaign code with equal prices does not block coupon', () => {
  assert.equal(
    institutionalCampaignDiscountActive({
      discountRate: 0,
      hasCampaign: true,
      normalPrice: 20000,
      finalPrice: 20000,
    }),
    false,
  )
  const result = resolveExclusiveBhPayable({ listPrice: 20000, campaignDiscountRate: 0, couponPercent: 25 })
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.total, 15000)
})

test('price drop with campaign present counts as active discount', () => {
  assert.equal(
    institutionalCampaignDiscountActive({
      discountRate: null,
      hasCampaign: true,
      normalPrice: 20000,
      finalPrice: 12000,
    }),
    true,
  )
})
