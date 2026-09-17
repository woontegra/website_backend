import type { Request, Response } from 'express'
import {
  clearReferralCookie,
  isValidReferralCodeFormat,
  readReferralCodeFromRequest,
  setReferralCookie,
} from '../lib/affiliateCookies'
import {
  buildProductLandingPath,
  buildProductLandingUrl,
  getPublicSiteOrigin,
} from '../lib/affiliateSiteOrigin'
import {
  recordAffiliateVisit,
  resolveActiveReferralLink,
} from '../services/affiliateReferral.public.service'

/**
 * GET /api/r/:code
 * Opak kod doğrular, first-touch çerez yazar, ürün sayfasına yönlendirir.
 * (c46c2c5 davranışı — mevcut P0 cookie/checkout resolve ile uyumlu)
 */
export async function getPublicReferralRedirect(req: Request, res: Response) {
  const code = typeof req.params.code === 'string' ? req.params.code.trim() : ''
  const homeUrl = `${getPublicSiteOrigin(req)}/`

  try {
    const existing = readReferralCodeFromRequest(req)

    if (!isValidReferralCodeFormat(code)) {
      return res.redirect(302, homeUrl)
    }

    const resolved = await resolveActiveReferralLink(code)
    if (!resolved.ok) {
      return res.redirect(302, homeUrl)
    }

    const landingPath = buildProductLandingPath(resolved.link.productSlug)
    const productUrl = buildProductLandingUrl(resolved.link.productSlug, req)

    // First-touch: mevcut çerez varsa üzerine yazma; yine de bu bağlantının ürün landing’ine git.
    if (!existing) {
      setReferralCookie(res, resolved.link.code)
      await recordAffiliateVisit({
        linkId: resolved.link.id,
        partnerId: resolved.link.partnerId,
        productId: resolved.link.productId,
        code: resolved.link.code,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        referer: req.get('referer'),
        landingPath,
      })
    }

    return res.redirect(302, productUrl)
  } catch (error) {
    console.error('[affiliate referral] redirect error:', error)
    try {
      clearReferralCookie(res)
    } catch {
      /* ignore */
    }
    return res.redirect(302, homeUrl)
  }
}
