import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isAffiliateCommissionEligibleForProduct } from './affiliateCommissionMatch'

describe('affiliateCommissionMatch', () => {
  it('allows commission only when link product matches purchased product', () => {
    assert.equal(isAffiliateCommissionEligibleForProduct('desk-1', 'desk-1'), true)
    assert.equal(isAffiliateCommissionEligibleForProduct('desk-1', 'saas-1'), false)
    assert.equal(isAffiliateCommissionEligibleForProduct('saas-1', 'desk-1'), false)
  })

  it('rejects missing ids', () => {
    assert.equal(isAffiliateCommissionEligibleForProduct('', 'desk-1'), false)
    assert.equal(isAffiliateCommissionEligibleForProduct('desk-1', null), false)
    assert.equal(isAffiliateCommissionEligibleForProduct(undefined, undefined), false)
  })
})
