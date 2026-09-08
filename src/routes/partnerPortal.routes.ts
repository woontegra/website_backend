import { NextFunction, Request, Response, Router } from 'express'
import { AffiliatePartnersError } from '../lib/affiliatePartners'
import {
  clearPartnerSessionCookie,
  setPartnerSessionCookie,
} from '../lib/affiliateCookies'
import {
  consumePartnerMagicToken,
  logoutPartnerSession,
  resolvePartnerSession,
} from '../services/affiliatePartnerAuth.service'
import { affiliateLinksService } from '../services/affiliateLinks.service'
import { affiliateReportingService } from '../services/affiliateReporting.service'

type PartnerReq = Request & {
  partnerSession?: NonNullable<Awaited<ReturnType<typeof resolvePartnerSession>>>
}

function handleError(res: Response, err: unknown, fallback: string) {
  if (err instanceof AffiliatePartnersError) {
    return res.status(err.status).json({ success: false, message: err.message, code: err.code })
  }
  console.error('[partner-portal]', err)
  return res.status(500).json({ success: false, message: fallback })
}

async function partnerAuth(req: PartnerReq, res: Response, next: NextFunction) {
  try {
    const session = await resolvePartnerSession(req)
    if (!session) {
      return res.status(401).json({ success: false, message: 'İş ortağı oturumu gerekli' })
    }
    req.partnerSession = session
    next()
  } catch (err) {
    return handleError(res, err, 'Oturum doğrulanamadı')
  }
}

export const partnerPortalRoutes = Router()

partnerPortalRoutes.post('/auth/consume', async (req, res) => {
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token : ''
    const result = await consumePartnerMagicToken(token)
    // Çerez süresi = oturum expiresAt (30 gün); magic link TTL buraya karışmaz
    setPartnerSessionCookie(res, result.rawSessionToken, result.sessionExpiresAt)
    return res.json({
      success: true,
      data: {
        partner: result.partner,
        expiresAt: result.sessionExpiresAt.toISOString(),
      },
    })
  } catch (err) {
    return handleError(res, err, 'Giriş başarısız')
  }
})

partnerPortalRoutes.post('/auth/logout', async (req, res) => {
  try {
    await logoutPartnerSession(req)
    clearPartnerSessionCookie(res)
    return res.json({ success: true })
  } catch (err) {
    return handleError(res, err, 'Çıkış başarısız')
  }
})

partnerPortalRoutes.get('/me', partnerAuth, async (req: PartnerReq, res) => {
  return res.json({
    success: true,
    data: {
      id: req.partnerSession!.partner.id,
      name: req.partnerSession!.partner.name,
      email: req.partnerSession!.partner.email,
    },
  })
})

partnerPortalRoutes.get('/links', partnerAuth, async (req: PartnerReq, res) => {
  try {
    const preferredOrigin =
      (typeof req.query.publicOrigin === 'string' ? req.query.publicOrigin : undefined) ??
      req.get('origin')
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1)
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? '10'), 10) || 10))
    const data = await affiliateLinksService.listForPartner(
      req.partnerSession!.partnerId,
      req,
      preferredOrigin,
      { page, limit },
    )
    return res.json({ success: true, data })
  } catch (err) {
    return handleError(res, err, 'Bağlantılar yüklenemedi')
  }
})

partnerPortalRoutes.get('/summary', partnerAuth, async (req: PartnerReq, res) => {
  try {
    const data = await affiliateReportingService.getPartnerSummary(req.partnerSession!.partnerId)
    return res.json({ success: true, data })
  } catch (err) {
    return handleError(res, err, 'Özet yüklenemedi')
  }
})

partnerPortalRoutes.get('/commissions', partnerAuth, async (req: PartnerReq, res) => {
  try {
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1)
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? '10'), 10) || 10))
    const data = await affiliateReportingService.listPartnerCommissions(
      req.partnerSession!.partnerId,
      page,
      limit,
    )
    return res.json({ success: true, data })
  } catch (err) {
    return handleError(res, err, 'Satış geçmişi yüklenemedi')
  }
})

partnerPortalRoutes.get('/payouts', partnerAuth, async (req: PartnerReq, res) => {
  try {
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1)
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? '10'), 10) || 10))
    const data = await affiliateReportingService.listPartnerPayouts(
      req.partnerSession!.partnerId,
      page,
      limit,
    )
    return res.json({ success: true, data })
  } catch (err) {
    return handleError(res, err, 'Ödeme geçmişi yüklenemedi')
  }
})
