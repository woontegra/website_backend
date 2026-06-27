import { Request, Response } from 'express'
import { campaignsService, type AdminCampaignListQuery } from '../services/campaigns.service'
import type { CampaignType } from '../lib/campaignPricing'

function parseListQuery(req: Request): AdminCampaignListQuery {
  const q: AdminCampaignListQuery = {}
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
  if (search) q.search = search
  const type = req.query.type
  if (type === 'announcement' || type === 'banner' || type === 'product_discount' || type === 'coupon') {
    q.type = type as CampaignType
  }
  const active = req.query.active
  if (active === 'true' || active === 'false') q.active = active
  const schedule = req.query.schedule
  if (
    schedule === 'scheduled' ||
    schedule === 'expired' ||
    schedule === 'product_discount' ||
    schedule === 'coupon'
  ) {
    q.schedule = schedule
  }
  return q
}

export async function adminList(req: Request, res: Response) {
  try {
    const data = await campaignsService.listAdmin(parseListQuery(req))
    return res.json({ success: true, data })
  } catch (err) {
    console.error('[campaigns] adminList', err)
    return res.status(500).json({ success: false, message: 'Kampanyalar yüklenemedi' })
  }
}

export async function adminGetById(req: Request, res: Response) {
  try {
    const data = await campaignsService.getById(String(req.params.id))
    if (!data) return res.status(404).json({ success: false, message: 'Kampanya bulunamadı' })
    return res.json({ success: true, data })
  } catch (err) {
    console.error('[campaigns] adminGetById', err)
    return res.status(500).json({ success: false, message: 'Kampanya yüklenemedi' })
  }
}

export async function adminCreate(req: Request, res: Response) {
  try {
    const data = await campaignsService.create(req.body ?? {})
    return res.status(201).json({ success: true, data })
  } catch (err) {
    const e = err as Error & { status?: number }
    console.error('[campaigns] adminCreate', err)
    return res.status(e.status ?? 500).json({ success: false, message: e.message || 'Kampanya oluşturulamadı' })
  }
}

export async function adminUpdate(req: Request, res: Response) {
  try {
    const data = await campaignsService.update(String(req.params.id), req.body ?? {})
    return res.json({ success: true, data })
  } catch (err) {
    const e = err as Error & { status?: number }
    console.error('[campaigns] adminUpdate', err)
    return res.status(e.status ?? 500).json({ success: false, message: e.message || 'Kampanya güncellenemedi' })
  }
}

export async function adminDelete(req: Request, res: Response) {
  try {
    await campaignsService.remove(String(req.params.id))
    return res.json({ success: true })
  } catch (err) {
    const e = err as Error & { status?: number }
    console.error('[campaigns] adminDelete', err)
    return res.status(e.status ?? 500).json({ success: false, message: e.message || 'Kampanya silinemedi' })
  }
}

export async function publicGetActive(req: Request, res: Response) {
  try {
    const data = await campaignsService.getPublicPayload()
    return res.json({ success: true, data })
  } catch (err) {
    console.error('[campaigns] publicGetActive', err)
    return res.json({ success: true, data: { announcement: null, banners: [] } })
  }
}
