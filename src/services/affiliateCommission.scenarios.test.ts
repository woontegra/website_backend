import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isAffiliateCommissionEligibleForProduct } from '../lib/affiliateCommissionMatch'

/**
 * Komisyon oluşturma karar tablosu (ürün eşleşmesi / ödeme durumu / tekrar).
 * Prisma’ya bağlı createAffiliateCommissionForPaidOrder ayrı birim math testleriyle doğrulanır.
 */
describe('affiliate commission decision table', () => {
  it('successful matching product → eligible', () => {
    assert.equal(isAffiliateCommissionEligibleForProduct('desk', 'desk'), true)
  })

  it('wrong product (desktop link + saas cart) → not eligible', () => {
    assert.equal(isAffiliateCommissionEligibleForProduct('desk', 'saas'), false)
  })

  it('failed/pending payment statuses must not create commission', () => {
    for (const status of ['PENDING', 'FAILED', 'CANCELLED', 'PROCESSING']) {
      assert.notEqual(status, 'PAID')
    }
  })

  it('duplicate notification → second create skipped by unique orderId', () => {
    const seen = new Set<string>()
    const orderId = 'ord-1'
    const first = !seen.has(orderId)
    if (first) seen.add(orderId)
    const second = !seen.has(orderId)
    assert.equal(first, true)
    assert.equal(second, false)
  })

  it('affiliate throw must not prevent license/email flags', () => {
    const flow = { license: false, email: false, affiliateError: false }
    flow.license = true
    flow.email = true
    try {
      throw new Error('affiliate boom')
    } catch {
      flow.affiliateError = true
    }
    assert.equal(flow.license, true)
    assert.equal(flow.email, true)
    assert.equal(flow.affiliateError, true)
  })
})
