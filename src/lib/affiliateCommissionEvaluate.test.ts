import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  evaluateAffiliateCommissionForPaidOrder,
  runPaidFulfillmentThenAffiliate,
  shouldProcessBankTransferApproval,
  shouldProcessPaytrFirstCompletion,
  type AffiliateCommissionEvalLink,
  type AffiliateCommissionEvalOrder,
} from '../lib/affiliateCommissionEvaluate'
import { exclusiveMatrahFromInclusiveKurus, commissionAmountFromMatrahKurus } from '../lib/affiliateVatPricing'

const deskProduct = 'prod-desktop'
const saasProduct = 'prod-saas'

function baseLink(overrides: Partial<AffiliateCommissionEvalLink> = {}): AffiliateCommissionEvalLink {
  return {
    id: 'link-1',
    partnerId: 'partner-1',
    productId: deskProduct,
    customerDiscountRate: 5,
    commissionRatePercent: 30,
    partner: { email: 'partner@example.com', phone: null, isActive: true },
    product: { id: deskProduct, name: 'MK Masaüstü', isActive: true },
    ...overrides,
  }
}

function baseOrder(overrides: Partial<AffiliateCommissionEvalOrder> = {}): AffiliateCommissionEvalOrder {
  return {
    id: 'order-1',
    orderNo: 'WNT-TEST-000001',
    status: 'PAID',
    customerEmail: 'buyer@example.com',
    customerPhone: null,
    currency: 'TRY',
    affiliateLinkId: 'link-1',
    affiliateCustomerDiscountRate: 5,
    campaignDiscountRateSnapshot: 0,
    effectiveCustomerDiscountRate: 5,
    items: [
      {
        productId: deskProduct,
        productName: 'MK Masaüstü',
        total: 20000,
        quantity: 1,
        productType: 'DOWNLOAD',
      },
    ],
    ...overrides,
  }
}

describe('affiliate commission evaluate (fake data, no DB)', () => {
  it('PayTR / havale success + matching product → create with Bilirkişi math', () => {
    const decision = evaluateAffiliateCommissionForPaidOrder({
      order: baseOrder(),
      link: baseLink(),
      vatRatePercent: 20,
    })
    assert.equal(decision.action, 'create')
    if (decision.action !== 'create') return
    // 20_000 TL = 2_000_000 kuruş
    assert.equal(decision.data.grossPaidAmountKurus, 2_000_000)
    assert.equal(decision.data.commissionBaseAmountKurus, exclusiveMatrahFromInclusiveKurus(2_000_000, 20))
    assert.equal(
      decision.data.commissionAmountKurus,
      commissionAmountFromMatrahKurus(decision.data.commissionBaseAmountKurus, 30),
    )
    assert.equal(decision.data.status, 'EARNED')
    assert.equal(decision.data.productNameSnapshot, 'MK Masaüstü')
  })

  it('bank transfer approval only when PENDING', () => {
    assert.equal(shouldProcessBankTransferApproval('PENDING'), true)
    assert.equal(shouldProcessBankTransferApproval('PAID'), false)
    assert.equal(shouldProcessBankTransferApproval('FAILED'), false)
  })

  it('PayTR first completion vs duplicate notification', () => {
    const first = shouldProcessPaytrFirstCompletion({
      paymentAlreadySuccess: false,
      orderAlreadyPaid: false,
    })
    assert.equal(first.firstCompletion, true)
    assert.equal(first.runFulfillment, true)

    const dup = shouldProcessPaytrFirstCompletion({
      paymentAlreadySuccess: true,
      orderAlreadyPaid: true,
    })
    assert.equal(dup.firstCompletion, false)
    assert.equal(dup.runFulfillment, false)
  })

  it('wrong product (desktop link + saas purchase) → skip', () => {
    const decision = evaluateAffiliateCommissionForPaidOrder({
      order: baseOrder({
        items: [
          {
            productId: saasProduct,
            productName: 'MK SaaS',
            total: 40000,
            quantity: 1,
            productType: 'SAAS',
          },
        ],
      }),
      link: baseLink({ productId: deskProduct }),
      vatRatePercent: 20,
    })
    assert.equal(decision.action, 'skip')
    if (decision.action === 'skip') assert.equal(decision.reason, 'product_mismatch')
  })

  it('correct saas product → create', () => {
    const decision = evaluateAffiliateCommissionForPaidOrder({
      order: baseOrder({
        items: [
          {
            productId: saasProduct,
            productName: 'MK SaaS',
            total: 40000,
            quantity: 1,
            productType: 'SAAS',
          },
        ],
      }),
      link: baseLink({
        productId: saasProduct,
        product: { id: saasProduct, name: 'MK SaaS', isActive: true },
      }),
      vatRatePercent: 20,
    })
    assert.equal(decision.action, 'create')
  })

  it('pending/failed/cancelled → no commission', () => {
    for (const status of ['PENDING', 'FAILED', 'CANCELLED', 'PROCESSING']) {
      const decision = evaluateAffiliateCommissionForPaidOrder({
        order: baseOrder({ status }),
        link: baseLink(),
        vatRatePercent: 20,
      })
      assert.equal(decision.action, 'skip')
      if (decision.action === 'skip') assert.equal(decision.reason, 'order_not_paid')
    }
  })

  it('duplicate commission (already_exists) → skip', () => {
    const decision = evaluateAffiliateCommissionForPaidOrder({
      order: baseOrder(),
      link: baseLink(),
      existingCommissionId: 'comm-existing',
      vatRatePercent: 20,
    })
    assert.equal(decision.action, 'skip')
    if (decision.action === 'skip') {
      assert.equal(decision.reason, 'already_exists')
      assert.equal(decision.commissionId, 'comm-existing')
    }
  })

  it('affiliate error after license/email → fulfillment still done', async () => {
    const result = await runPaidFulfillmentThenAffiliate({
      fulfillLicenseAndEmail: async () => {
        /* ok */
      },
      processAffiliate: async () => {
        throw new Error('VAT boom')
      },
    })
    assert.equal(result.licenseEmailDone, true)
    assert.match(result.affiliateError ?? '', /VAT boom/)
  })

  it('no affiliate on order → skip', () => {
    const decision = evaluateAffiliateCommissionForPaidOrder({
      order: baseOrder({ affiliateLinkId: null }),
      link: null,
      vatRatePercent: 20,
    })
    assert.equal(decision.action, 'skip')
    if (decision.action === 'skip') assert.equal(decision.reason, 'no_affiliate')
  })
})
