import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  emptyAffiliatePartnerSummary,
  emptyAffiliatePagination,
  formatAffiliateKurusToTry,
} from '../services/affiliateReporting.service'

describe('affiliateReporting helpers', () => {
  it('returns zero summary shape', () => {
    const s = emptyAffiliatePartnerSummary()
    assert.equal(s.saleCount, 0)
    assert.equal(s.pendingCommissionKurus, 0)
  })

  it('returns empty pagination', () => {
    assert.deepEqual(emptyAffiliatePagination(1, 20), {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    })
  })

  it('formats kuruş as Turkish lira text', () => {
    assert.equal(formatAffiliateKurusToTry(0), '0,00 TL')
    assert.equal(formatAffiliateKurusToTry(1250), '12,50 TL')
  })
})
