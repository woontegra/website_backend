import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { AffiliatePartnersError } from '../lib/affiliatePartners'
import {
  invitePartnerAccess,
  revokePartnerAccess,
} from '../services/affiliatePartnerAuth.service'
import { affiliateLinksService } from '../services/affiliateLinks.service'
import { affiliatePartnersService } from '../services/affiliatePartners.service'
import { affiliateReportingService } from '../services/affiliateReporting.service'
import {
  AffiliatePayoutError,
  affiliatePayoutService,
} from '../services/affiliatePayout.service'

function handleError(res: Response, err: unknown, fallback: string) {
  if (err instanceof AffiliatePartnersError) {
    return res.status(err.status).json({ success: false, message: err.message, code: err.code })
  }
  if (err instanceof AffiliatePayoutError) {
    return res.status(err.status).json({ success: false, message: err.message, code: err.code })
  }
  console.error('[affiliate-partners]', err)
  return res.status(500).json({ success: false, message: fallback })
}

function actorUserId(req: Request): string | null {
  return (req as Request & { user?: { userId?: string } }).user?.userId ?? null
}

function preferredOriginFrom(req: Request): unknown {
  const body = req.body as { publicOrigin?: unknown } | undefined
  const query = req.query as { publicOrigin?: unknown }
  const header = req.get('x-public-origin')
  return body?.publicOrigin ?? query?.publicOrigin ?? header ?? req.get('origin') ?? undefined
}

export async function adminList(req: Request, res: Response) {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined
    const activeRaw = typeof req.query.isActive === 'string' ? req.query.isActive : undefined
    const isActive = activeRaw === 'true' ? true : activeRaw === 'false' ? false : undefined
    const data = await affiliatePartnersService.list({ search, isActive })
    return res.json({ success: true, data })
  } catch (err) {
    return handleError(res, err, 'İş ortakları yüklenemedi')
  }
}

export async function adminGetById(req: Request, res: Response) {
  try {
    const data = await affiliatePartnersService.getById(
      String(req.params.id),
      req,
      preferredOriginFrom(req),
    )
    return res.json({ success: true, data })
  } catch (err) {
    return handleError(res, err, 'İş ortağı yüklenemedi')
  }
}

export async function adminCreate(req: Request, res: Response) {
  try {
    const data = await affiliatePartnersService.create(req.body ?? {})
    return res.status(201).json({ success: true, data })
  } catch (err) {
    return handleError(res, err, 'İş ortağı oluşturulamadı')
  }
}

export async function adminUpdate(req: Request, res: Response) {
  try {
    const data = await affiliatePartnersService.update(String(req.params.id), req.body ?? {})
    return res.json({ success: true, data })
  } catch (err) {
    return handleError(res, err, 'İş ortağı güncellenemedi')
  }
}

export async function adminDeactivate(req: Request, res: Response) {
  try {
    const data = await affiliatePartnersService.setActive(String(req.params.id), false)
    return res.json({ success: true, data })
  } catch (err) {
    return handleError(res, err, 'İş ortağı pasifleştirilemedi')
  }
}

export async function adminActivate(req: Request, res: Response) {
  try {
    const data = await affiliatePartnersService.setActive(String(req.params.id), true)
    return res.json({ success: true, data })
  } catch (err) {
    return handleError(res, err, 'İş ortağı aktifleştirilemedi')
  }
}

export async function adminInvitePartnerAccess(req: Request, res: Response) {
  try {
    const data = await invitePartnerAccess({
      partnerId: String(req.params.id),
      actorUserId: actorUserId(req),
      req,
      preferredOrigin: preferredOriginFrom(req),
    })
    return res.json({ success: true, data })
  } catch (err) {
    return handleError(res, err, 'Partner erişimi oluşturulamadı')
  }
}

export async function adminRevokePartnerAccess(req: Request, res: Response) {
  try {
    const data = await revokePartnerAccess({
      partnerId: String(req.params.id),
      actorUserId: actorUserId(req),
    })
    return res.json({ success: true, data })
  } catch (err) {
    return handleError(res, err, 'Partner erişimi iptal edilemedi')
  }
}

export async function adminCreateLink(req: Request, res: Response) {
  try {
    const data = await affiliateLinksService.createForPartner(
      String(req.params.id),
      req.body ?? {},
      req,
      preferredOriginFrom(req),
    )
    return res.status(201).json({ success: true, data })
  } catch (err) {
    return handleError(res, err, 'Bağlantı oluşturulamadı')
  }
}

export async function adminListLinks(req: Request, res: Response) {
  try {
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1)
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? '10'), 10) || 10))
    const data = await affiliateLinksService.listForPartner(
      String(req.params.id),
      req,
      preferredOriginFrom(req),
      { page, limit },
    )
    return res.json({ success: true, data })
  } catch (err) {
    return handleError(res, err, 'Bağlantılar yüklenemedi')
  }
}

export async function adminDeactivateLink(req: Request, res: Response) {
  try {
    const data = await affiliateLinksService.setActive(
      String(req.params.linkId),
      false,
      req,
      preferredOriginFrom(req),
    )
    return res.json({ success: true, data })
  } catch (err) {
    return handleError(res, err, 'Bağlantı pasifleştirilemedi')
  }
}

export async function adminActivateLink(req: Request, res: Response) {
  try {
    const data = await affiliateLinksService.setActive(
      String(req.params.linkId),
      true,
      req,
      preferredOriginFrom(req),
    )
    return res.json({ success: true, data })
  } catch (err) {
    return handleError(res, err, 'Bağlantı aktifleştirilemedi')
  }
}

async function assertPartnerExists(id: string) {
  const row = await prisma.affiliatePartner.findUnique({ where: { id }, select: { id: true } })
  if (!row) throw new AffiliatePartnersError('İş ortağı bulunamadı', 404)
}

export async function adminGetSummary(req: Request, res: Response) {
  try {
    await assertPartnerExists(String(req.params.id))
    const data = await affiliateReportingService.getPartnerSummary(String(req.params.id))
    return res.json({ success: true, data })
  } catch (err) {
    return handleError(res, err, 'Finansal özet yüklenemedi')
  }
}

export async function adminListCommissions(req: Request, res: Response) {
  try {
    await assertPartnerExists(String(req.params.id))
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1)
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? '10'), 10) || 10))
    const data = await affiliateReportingService.listPartnerCommissions(String(req.params.id), page, limit)
    return res.json({ success: true, data })
  } catch (err) {
    return handleError(res, err, 'Komisyonlar yüklenemedi')
  }
}

export async function adminListPayouts(req: Request, res: Response) {
  try {
    await assertPartnerExists(String(req.params.id))
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1)
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? '10'), 10) || 10))
    const data = await affiliateReportingService.listPartnerPayouts(String(req.params.id), page, limit)
    return res.json({ success: true, data })
  } catch (err) {
    return handleError(res, err, 'Ödeme geçmişi yüklenemedi')
  }
}

export async function adminListEarnedForPayout(req: Request, res: Response) {
  try {
    await assertPartnerExists(String(req.params.id))
    const data = await affiliatePayoutService.listEarnedForPayout(String(req.params.id))
    return res.json({ success: true, data })
  } catch (err) {
    return handleError(res, err, 'Ödenecek komisyonlar yüklenemedi')
  }
}

export async function adminCreatePayout(req: Request, res: Response) {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>
    const result = await affiliatePayoutService.createPayout({
      partnerId: String(req.params.id),
      allocations: body.allocations as { commissionId: string; amountKurus: number }[],
      paymentMethod: String(body.paymentMethod ?? ''),
      reference: body.reference == null ? null : String(body.reference),
      notes: body.notes == null ? null : String(body.notes),
      paidAt: body.paidAt == null || body.paidAt === '' ? null : String(body.paidAt),
      idempotencyKey: String(body.idempotencyKey ?? ''),
      actorUserId: actorUserId(req),
    })
    return res.status(result.created ? 201 : 200).json({
      success: true,
      data: result.payout,
      meta: { created: result.created, idempotent: result.idempotent },
    })
  } catch (err) {
    return handleError(res, err, 'Ödeme kaydı oluşturulamadı')
  }
}
