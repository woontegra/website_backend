import { Request, Response } from 'express'
import { LegalDocumentType } from '@prisma/client'
import { legalDocumentsService } from '../services/legalDocuments.service'

const TYPES: LegalDocumentType[] = [
  'PRE_INFORMATION',
  'DISTANCE_SALES',
  'KVKK_CLARIFICATION',
  'EXPLICIT_CONSENT',
  'COMMERCIAL_ELECTRONIC_MESSAGE',
  'TERMS_OF_USE',
  'PRIVACY_POLICY',
  'SOFTWARE_LICENSE',
  'SAAS_SUBSCRIPTION',
  'DIGITAL_IMMEDIATE_DELIVERY_WAIVER',
]

function parseType(s: string): LegalDocumentType | null {
  return TYPES.includes(s as LegalDocumentType) ? (s as LegalDocumentType) : null
}

export async function publicList(_req: Request, res: Response) {
  try {
    const data = await legalDocumentsService.listPublicActive()
    res.json({ success: true, data })
  } catch {
    res.status(500).json({ success: false, message: 'Yüklenemedi' })
  }
}

export async function publicGetByType(req: Request, res: Response) {
  const t = parseType(String(req.params.type ?? ''))
  if (!t) return res.status(400).json({ success: false, message: 'Geçersiz belge tipi' })
  try {
    const row = await legalDocumentsService.getPublicByType(t)
    if (!row) return res.status(404).json({ success: false, message: 'Bulunamadı' })
    res.json({ success: true, data: row })
  } catch {
    res.status(500).json({ success: false, message: 'Yüklenemedi' })
  }
}

/** Checkout: şablon + sipariş öncesi değişkenlerle render (ham {{}} dönmez). */
export async function publicPreview(req: Request, res: Response) {
  const body = req.body as { type?: unknown; variables?: unknown; variant?: unknown }
  const t = parseType(String(body.type ?? ''))
  if (!t) return res.status(400).json({ success: false, message: 'Geçersiz belge tipi' })
  try {
    const vars =
      body.variables && typeof body.variables === 'object' && !Array.isArray(body.variables)
        ? (body.variables as Record<string, unknown>)
        : {}
    const variantRaw = String(body.variant ?? '').trim().toUpperCase()
    const variant = variantRaw === 'DOWNLOAD' || variantRaw === 'SAAS' ? variantRaw : undefined
    const data = await legalDocumentsService.getRenderedPreview(t, vars, variant)
    res.json({ success: true, data })
  } catch {
    res.status(500).json({ success: false, message: 'Yüklenemedi' })
  }
}

export async function adminList(_req: Request, res: Response) {
  try {
    const data = await legalDocumentsService.listAdmin()
    res.json({ success: true, data })
  } catch {
    res.status(500).json({ success: false, message: 'Yüklenemedi' })
  }
}

export async function adminGetById(req: Request, res: Response) {
  try {
    const row = await legalDocumentsService.getAdminById(req.params.id)
    if (!row) return res.status(404).json({ success: false, message: 'Bulunamadı' })
    res.json({ success: true, data: row })
  } catch {
    res.status(500).json({ success: false, message: 'Yüklenemedi' })
  }
}

export async function adminCreate(req: Request, res: Response) {
  const body = req.body as Record<string, unknown>
  const type = parseType(String(body.type ?? ''))
  const title = String(body.title ?? '').trim()
  const content = String(body.content ?? '')
  if (!type || !title) {
    return res.status(400).json({ success: false, message: 'type ve title zorunlu' })
  }
  try {
    const data = await legalDocumentsService.createAdmin({
      type,
      title,
      content,
      version: typeof body.version === 'number' ? body.version : undefined,
      isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
    })
    res.status(201).json({ success: true, data })
  } catch {
    res.status(500).json({ success: false, message: 'Oluşturulamadı' })
  }
}

export async function adminPatch(req: Request, res: Response) {
  const body = req.body as Record<string, unknown>
  try {
    const data = await legalDocumentsService.patchAdmin(req.params.id, {
      title: typeof body.title === 'string' ? body.title : undefined,
      content: typeof body.content === 'string' ? body.content : undefined,
      version: typeof body.version === 'number' ? body.version : undefined,
      isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
    })
    res.json({ success: true, data })
  } catch {
    res.status(500).json({ success: false, message: 'Güncellenemedi' })
  }
}

export async function adminDelete(req: Request, res: Response) {
  try {
    await legalDocumentsService.deactivateAdmin(req.params.id)
    res.json({ success: true })
  } catch {
    res.status(500).json({ success: false, message: 'İşlem başarısız' })
  }
}
