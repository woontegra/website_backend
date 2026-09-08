import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  emptyAffiliatePartnerSummary,
  emptyAffiliatePagination,
  formatAffiliateKurusToTry,
} from '../services/affiliateReporting.service'
import {
  commissionAmountFromMatrahKurus,
  exclusiveMatrahFromInclusiveKurus,
  resolveVatInclusiveRatePercent,
  tlToKurus,
} from '../lib/affiliateVatPricing'
import { deriveDiscountRatePercent, resolveMaxDiscountPolicy } from '../lib/affiliateDiscountPolicy'
import { AFFILIATE_COMMISSION_STATUS, AFFILIATE_SALE_TYPE } from '../lib/affiliateCommissionEvaluate'

describe('affiliate commission math (Bilirkişi-aligned)', () => {
  it('computes matrah and commission from KDV-inclusive gross', () => {
    const gross = 2_000_000
    const matrah = exclusiveMatrahFromInclusiveKurus(gross, 20)
    assert.equal(matrah, 1_666_667)
    assert.equal(commissionAmountFromMatrahKurus(matrah, 30), 500_000)
  })

  it('converts TL to kuruş', () => {
    assert.equal(tlToKurus(12.5), 1250)
    assert.equal(tlToKurus(0), 0)
  })

  it('resolves VAT percent from env or default 20', () => {
    assert.equal(resolveVatInclusiveRatePercent('18'), 18)
    assert.equal(resolveVatInclusiveRatePercent(''), 20)
  })
})

describe('affiliate Policy C discount', () => {
  it('uses max of campaign and affiliate; tie prefers campaign', () => {
    const affiliateWins = resolveMaxDiscountPolicy({
      listPriceTl: 1000,
      campaignRatePercent: 5,
      affiliateRatePercent: 10,
      campaignEffectivePriceTl: 950,
    })
    assert.equal(affiliateWins.appliedDiscountSource, 'affiliate')
    assert.equal(affiliateWins.unitPriceTl, 900)

    const campaignWins = resolveMaxDiscountPolicy({
      listPriceTl: 1000,
      campaignRatePercent: 15,
      affiliateRatePercent: 10,
      campaignEffectivePriceTl: 850,
    })
    assert.equal(campaignWins.appliedDiscountSource, 'campaign')
    assert.equal(campaignWins.unitPriceTl, 850)
  })

  it('derives rate from list vs effective', () => {
    assert.equal(deriveDiscountRatePercent(1000, 900), 10)
  })
})

describe('affiliate reporting helpers', () => {
  it('formats kuruş and empty summary', () => {
    assert.equal(formatAffiliateKurusToTry(0), '0,00 TL')
    assert.equal(emptyAffiliatePartnerSummary().saleCount, 0)
    assert.equal(emptyAffiliatePagination(2, 10).page, 2)
    assert.equal(AFFILIATE_COMMISSION_STATUS.EARNED, 'EARNED')
    assert.equal(AFFILIATE_SALE_TYPE.FIRST_SALE, 'FIRST_SALE')
  })
})
