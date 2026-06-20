import { Request, Response } from 'express'
import { LicenseLifecycleStatus } from '@prisma/client'
import { licensesAdminService } from '../services/license.admin.service'

function readString(body: Record<string, unknown>, key: string): string | undefined {
  const v = body[key]
  if (v === undefined || v === null) return undefined
  return String(v).trim()
}

function readQueryString(q: Request['query'], key: string): string | undefined {
  const v = q[key]
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  return s === '' ? undefined : s
}

function parseDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? undefined : d
}

export async function adminListLicenses(req: Request, res: Response) {
  const sourceRaw = readQueryString(req.query, 'source')
  const statusRaw = readQueryString(req.query, 'status')
  const rows = await licensesAdminService.list({
    source: sourceRaw === 'MANUAL' || sourceRaw === 'WEBSITE_ORDER' ? sourceRaw : undefined,
    status:
      statusRaw === 'ACTIVE' || statusRaw === 'DISABLED' || statusRaw === 'EXPIRED'
        ? statusRaw
        : undefined,
    email: readQueryString(req.query, 'email'),
    productCode: readQueryString(req.query, 'productCode'),
    q: readQueryString(req.query, 'q'),
  })
  return res.json({ success: true, data: rows })
}

export async function adminGetLicense(req: Request, res: Response) {
  const id = String(req.params.id ?? '').trim()
  if (!id) return res.status(400).json({ success: false, message: 'Geçersiz id' })
  const row = await licensesAdminService.getById(id)
  if (!row) return res.status(404).json({ success: false, message: 'Lisans bulunamadı' })
  return res.json({ success: true, data: row })
}

export async function adminCreateLicense(req: Request, res: Response) {
  const body = req.body as Record<string, unknown>
  const customerName = readString(body, 'customerName')
  const customerEmail = readString(body, 'customerEmail')
  const customerPhone = readString(body, 'customerPhone')
  const productCode = readString(body, 'productCode') ?? 'MUVEKKIL_KASA_DESKTOP'
  const startsAt = parseDate(readString(body, 'startsAt')) ?? new Date()
  const expiresAt = parseDate(readString(body, 'expiresAt'))
  const maxDevicesRaw = body.maxDevices
  const maxDevices =
    typeof maxDevicesRaw === 'number'
      ? maxDevicesRaw
      : Number.parseInt(String(maxDevicesRaw ?? '1'), 10)
  const notes = readString(body, 'notes')
  const sendEmail = body.sendEmail === true || body.sendEmail === 'true'

  if (!customerName || !customerEmail || !expiresAt) {
    return res.status(400).json({
      success: false,
      message: 'Müşteri adı, e-posta ve bitiş tarihi zorunludur.',
    })
  }

  try {
    const out = await licensesAdminService.create({
      customerName,
      customerEmail,
      customerPhone,
      productCode,
      startsAt,
      expiresAt,
      maxDevices: Number.isFinite(maxDevices) ? maxDevices : 1,
      notes,
      sendEmail,
    })
    return res.status(201).json({
      success: true,
      data: out.license,
      activationPassword: out.activationPassword,
    })
  } catch (e) {
    console.error('[admin] create license', e)
    return res.status(500).json({ success: false, message: 'Lisans oluşturulamadı.' })
  }
}

export async function adminPatchLicense(req: Request, res: Response) {
  const id = String(req.params.id ?? '').trim()
  if (!id) return res.status(400).json({ success: false, message: 'Geçersiz id' })
  const body = req.body as Record<string, unknown>
  const statusRaw = readString(body, 'status')
  const status =
    statusRaw === 'ACTIVE' || statusRaw === 'DISABLED' || statusRaw === 'EXPIRED'
      ? (statusRaw as LicenseLifecycleStatus)
      : undefined
  const maxDevicesRaw = body.maxDevices
  const maxDevices =
    maxDevicesRaw === undefined
      ? undefined
      : typeof maxDevicesRaw === 'number'
        ? maxDevicesRaw
        : Number.parseInt(String(maxDevicesRaw), 10)
  const expiresAt = parseDate(readString(body, 'expiresAt'))
  const notes = body.notes !== undefined ? readString(body, 'notes') ?? null : undefined
  const customerName = readString(body, 'customerName')
  const customerPhone =
    body.customerPhone !== undefined ? readString(body, 'customerPhone') ?? null : undefined

  const row = await licensesAdminService.patch(id, {
    status,
    maxDevices: Number.isFinite(maxDevices) ? maxDevices : undefined,
    expiresAt,
    notes,
    customerName,
    customerPhone,
  })
  if (!row) return res.status(404).json({ success: false, message: 'Lisans bulunamadı' })
  return res.json({ success: true, data: row })
}

export async function adminExtendLicense(req: Request, res: Response) {
  const id = String(req.params.id ?? '').trim()
  const body = req.body as Record<string, unknown>
  const expiresAt = parseDate(readString(body, 'expiresAt'))
  if (!id || !expiresAt) {
    return res.status(400).json({ success: false, message: 'Geçersiz istek' })
  }
  const row = await licensesAdminService.extend(id, expiresAt)
  if (!row) return res.status(404).json({ success: false, message: 'Lisans bulunamadı' })
  return res.json({ success: true, data: row })
}

export async function adminResetLicenseDevices(req: Request, res: Response) {
  const id = String(req.params.id ?? '').trim()
  if (!id) return res.status(400).json({ success: false, message: 'Geçersiz id' })
  const row = await licensesAdminService.resetDevices(id)
  if (!row) return res.status(404).json({ success: false, message: 'Lisans bulunamadı' })
  return res.json({ success: true, data: row })
}

export async function adminRegenerateLicensePassword(req: Request, res: Response) {
  const id = String(req.params.id ?? '').trim()
  if (!id) return res.status(400).json({ success: false, message: 'Geçersiz id' })
  const body = req.body as Record<string, unknown>
  const sendEmail = body.sendEmail === true || body.sendEmail === 'true'
  const out = await licensesAdminService.regeneratePassword(id, sendEmail)
  if (!out) return res.status(404).json({ success: false, message: 'Lisans bulunamadı' })
  return res.json({
    success: true,
    data: out.license,
    activationPassword: out.activationPassword,
  })
}

export async function adminSendLicenseEmail(req: Request, res: Response) {
  const id = String(req.params.id ?? '').trim()
  if (!id) return res.status(400).json({ success: false, message: 'Geçersiz id' })
  const body = req.body as Record<string, unknown>
  const activationPassword = readString(body, 'activationPassword')
  try {
    await licensesAdminService.sendEmail(id, activationPassword)
    return res.json({ success: true })
  } catch (e) {
    const err = e as Error & { status?: number }
    if (err.status === 404) {
      return res.status(404).json({ success: false, message: 'Lisans bulunamadı' })
    }
    console.error('[admin] send license email', e)
    return res.status(500).json({ success: false, message: 'E-posta gönderilemedi.' })
  }
}
