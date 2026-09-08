import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AffiliatePartnersError,
  parseCreateInput,
  parseProductAssignments,
  parseRatePercent,
  parseUpdateInput,
  requirePartnerInviteEmail,
  validateOptionalEmail,
} from '../lib/affiliatePartners'
import {
  buildAffiliateReferralPublicUrl,
  buildPartnerMagicAuthUrl,
  buildProductLandingPath,
  getPublicSiteOrigin,
  isLocalhostOrigin,
  mkCompareSurumForProductSlug,
} from '../lib/affiliateSiteOrigin'
import { hashPartnerToken } from '../services/affiliatePartnerAuth.service'
import { isValidReferralCodeFormat } from '../lib/affiliateCookies'

describe('affiliatePartners validation (Bilirkişi-aligned)', () => {
  it('parses integer rates 0–100', () => {
    assert.equal(parseRatePercent('12,4', 'Komisyon oranı'), 12)
    assert.equal(parseRatePercent(20.6, 'Komisyon oranı'), 21)
    assert.throws(() => parseRatePercent(101, 'Komisyon oranı'), (err: unknown) => err instanceof AffiliatePartnersError)
  })

  it('allows optional email and requires it for invite', () => {
    assert.equal(validateOptionalEmail(''), null)
    assert.equal(validateOptionalEmail('A@B.com'), 'a@b.com')
    assert.throws(() => validateOptionalEmail('x'), (err: unknown) => err instanceof AffiliatePartnersError)
    assert.equal(requirePartnerInviteEmail('ortak@example.com'), 'ortak@example.com')
    assert.throws(() => requirePartnerInviteEmail(null), (err: unknown) => err instanceof AffiliatePartnersError)
  })

  it('parses create without password or partner code', () => {
    const created = parseCreateInput({
      name: 'Demo Ortak',
      contactName: 'Ali',
      email: 'ortak@example.com',
      defaultCommissionRate: 15,
      products: [{ productId: 'prod-1', commissionRatePercent: 15, discountRatePercent: 3 }],
    })
    assert.equal(created.name, 'Demo Ortak')
    assert.equal(created.contactName, 'Ali')
    assert.equal(created.defaultCommissionRate, 15)
    assert.equal((created as { password?: string }).password, undefined)
  })

  it('parses product assignments and update payload', () => {
    const rows = parseProductAssignments([
      { productId: 'p1', commissionRatePercent: 20, discountRatePercent: 5 },
    ])
    assert.equal(rows[0].commissionRatePercent, 20)
    const updated = parseUpdateInput({ isActive: false, products: [] })
    assert.equal(updated.isActive, false)
    assert.deepEqual(updated.products, [])
  })

  it('builds magic and referral urls from preferred localhost origin (not hardcoded 5173)', () => {
    const magic = buildPartnerMagicAuthUrl('abc123', null, 'http://localhost:5174')
    assert.equal(magic, 'http://localhost:5174/is-ortagi/giris?token=abc123')
    const referral = buildAffiliateReferralPublicUrl('Ab_12-xy', null, 'http://localhost:5174')
    assert.equal(referral, 'http://localhost:5174/r/Ab_12-xy')
    assert.equal(buildProductLandingPath('muvekkil-kasa'), '/yazilimlar/muvekkil-kasa')
    assert.equal(
      buildProductLandingPath('muvekkil-kasa-defteri-yazilimi'),
      '/yazilimlar/muvekkil-kasa-defteri?surum=masaustu',
    )
    assert.equal(
      buildProductLandingPath('muvekkil-kasa-defteri-web-tabanli'),
      '/yazilimlar/muvekkil-kasa-defteri?surum=saas',
    )
    assert.equal(mkCompareSurumForProductSlug('muvekkil-kasa-defteri-yazilimi'), 'masaustu')
    assert.equal(mkCompareSurumForProductSlug('muvekkil-kasa-defteri-web-tabanli'), 'saas')
    assert.equal(mkCompareSurumForProductSlug('other-product'), null)
    assert.equal(isLocalhostOrigin('http://localhost:5174'), true)
    assert.equal(hashPartnerToken('secret').length, 64)
    assert.equal(isValidReferralCodeFormat('Ab_12-xyZZ'), true)
    assert.equal(isValidReferralCodeFormat('short'), false)
  })

  it('falls back to live site when no preferred/local origin', () => {
    const prevPublic = process.env.PUBLIC_SITE_URL
    const prevFront = process.env.FRONTEND_URL
    delete process.env.PUBLIC_SITE_URL
    delete process.env.FRONTEND_URL
    try {
      assert.equal(getPublicSiteOrigin(null), 'https://woontegra.com')
    } finally {
      if (prevPublic !== undefined) process.env.PUBLIC_SITE_URL = prevPublic
      else delete process.env.PUBLIC_SITE_URL
      if (prevFront !== undefined) process.env.FRONTEND_URL = prevFront
      else delete process.env.FRONTEND_URL
    }
  })
})
