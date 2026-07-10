import { Request, Response } from 'express'
import { adminSaasMembershipsService } from '../services/saasMemberships.admin.service'

function readQueryString(q: Request['query'], key: string): string | undefined {
  const v = q[key]
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  return s === '' ? undefined : s
}

function readBodyString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key]
  if (value == null) return undefined
  const text = String(value).trim()
  return text || undefined
}

function readBodyNumber(body: Record<string, unknown>, key: string): number | undefined {
  const value = body[key]
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : undefined
}

export async function adminListSaasMemberships(req: Request, res: Response) {
  const data = await adminSaasMembershipsService.list({
    q: readQueryString(req.query, 'q'),
    status: readQueryString(req.query, 'status'),
    productId: readQueryString(req.query, 'productId'),
    expiringSoon: readQueryString(req.query, 'expiringSoon') === 'true',
  })
  return res.json({ success: true, data })
}

export async function adminGetSaasMembership(req: Request, res: Response) {
  const id = String(req.params.id ?? '').trim()
  if (!id) return res.status(400).json({ success: false, message: 'Geçersiz id' })
  const data = await adminSaasMembershipsService.getById(id)
  if (!data) return res.status(404).json({ success: false, message: 'Üyelik bulunamadı' })
  return res.json({ success: true, data })
}

export async function adminCreateSaasMembership(req: Request, res: Response) {
  const body = req.body as Record<string, unknown>
  try {
    const data = await adminSaasMembershipsService.create({
      customerEmail: readBodyString(body, 'customerEmail') ?? '',
      productId: readBodyString(body, 'productId') ?? '',
      licenseStartDate: readBodyString(body, 'licenseStartDate') ?? '',
      licenseEndDate: readBodyString(body, 'licenseEndDate') ?? '',
      status: readBodyString(body, 'status') ?? 'ACTIVE',
      tenantId: readBodyString(body, 'tenantId') ?? '',
      tenantSlug: readBodyString(body, 'tenantSlug') ?? '',
      licenseKey: readBodyString(body, 'licenseKey') ?? '',
      orderRef: readBodyString(body, 'orderRef') ?? null,
    })
    return res.status(201).json({ success: true, data })
  } catch (e) {
    const err = e as Error & { status?: number }
    return res.status(err.status ?? 500).json({ success: false, message: err.message || 'Üyelik oluşturulamadı' })
  }
}

export async function adminPatchSaasMembership(req: Request, res: Response) {
  const id = String(req.params.id ?? '').trim()
  if (!id) return res.status(400).json({ success: false, message: 'Geçersiz id' })
  const body = req.body as Record<string, unknown>
  try {
    const data = await adminSaasMembershipsService.patch(id, {
      licenseStartDate: readBodyString(body, 'licenseStartDate'),
      licenseEndDate: readBodyString(body, 'licenseEndDate'),
      status: readBodyString(body, 'status'),
      tenantId: readBodyString(body, 'tenantId'),
      tenantSlug: readBodyString(body, 'tenantSlug'),
      licenseKey: readBodyString(body, 'licenseKey'),
    })
    return res.json({ success: true, data })
  } catch (e) {
    const err = e as Error & { status?: number }
    return res.status(err.status ?? 500).json({ success: false, message: err.message || 'Üyelik güncellenemedi' })
  }
}

export async function adminPatchSaasMembershipStatus(req: Request, res: Response) {
  const id = String(req.params.id ?? '').trim()
  if (!id) return res.status(400).json({ success: false, message: 'Geçersiz id' })
  const body = req.body as Record<string, unknown>
  try {
    const data = await adminSaasMembershipsService.patchStatus(id, readBodyString(body, 'status') ?? '')
    return res.json({ success: true, data })
  } catch (e) {
    const err = e as Error & { status?: number }
    return res.status(err.status ?? 500).json({ success: false, message: err.message || 'Durum güncellenemedi' })
  }
}

export async function adminExtendSaasMembership(req: Request, res: Response) {
  const id = String(req.params.id ?? '').trim()
  if (!id) return res.status(400).json({ success: false, message: 'Geçersiz id' })
  const body = req.body as Record<string, unknown>
  try {
    const data = await adminSaasMembershipsService.extend(id, readBodyNumber(body, 'days') ?? 0)
    return res.json({ success: true, data })
  } catch (e) {
    const err = e as Error & { status?: number }
    return res.status(err.status ?? 500).json({ success: false, message: err.message || 'Üyelik uzatılamadı' })
  }
}
