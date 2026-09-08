export class AffiliatePartnersError extends Error {
  status: number
  code?: string

  constructor(message: string, status = 400, code?: string) {
    super(message)
    this.name = 'AffiliatePartnersError'
    this.status = status
    this.code = code
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type AffiliateProductAssignmentInput = {
  productId: string
  commissionRatePercent: number
  discountRatePercent: number
  isActive?: boolean
}

export type AffiliatePartnerCreateInput = {
  name: string
  contactName?: string | null
  email?: string | null
  phone?: string | null
  defaultCommissionRate: number
  isActive?: boolean
  internalNotes?: string | null
  products?: AffiliateProductAssignmentInput[]
}

export type AffiliatePartnerUpdateInput = {
  name?: string
  contactName?: string | null
  email?: string | null
  phone?: string | null
  defaultCommissionRate?: number
  isActive?: boolean
  internalNotes?: string | null
  products?: AffiliateProductAssignmentInput[]
}

export function normalizeEmail(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
}

/** Tam sayı yüzde 0–100 (Bilirkişi ile aynı convention). */
export function parseRatePercent(raw: unknown, fieldLabel: string): number {
  const n =
    typeof raw === 'number'
      ? raw
      : Number.parseFloat(String(raw ?? '').trim().replace(',', '.'))
  if (!Number.isFinite(n)) {
    throw new AffiliatePartnersError(`${fieldLabel} geçerli bir sayı olmalıdır`)
  }
  const rounded = Math.round(n)
  if (rounded < 0 || rounded > 100) {
    throw new AffiliatePartnersError(`${fieldLabel} 0 ile 100 arasında olmalıdır`)
  }
  return rounded
}

export function validateOptionalEmail(email: unknown): string | null {
  if (email == null || String(email).trim() === '') return null
  const normalized = normalizeEmail(email)
  if (!EMAIL_RE.test(normalized)) {
    throw new AffiliatePartnersError('Geçerli bir e-posta adresi girin')
  }
  return normalized
}

export function requirePartnerInviteEmail(email: string | null | undefined): string {
  const normalized = email ? normalizeEmail(email) : ''
  if (!normalized || !normalized.includes('@') || !EMAIL_RE.test(normalized)) {
    throw new AffiliatePartnersError(
      'Partner daveti için iş ortağının e-postası gerekli',
      400,
      'AFFILIATE_PARTNER_EMAIL_REQUIRED',
    )
  }
  return normalized
}

export function parseProductAssignments(raw: unknown): AffiliateProductAssignmentInput[] {
  if (raw == null) return []
  if (!Array.isArray(raw)) {
    throw new AffiliatePartnersError('Ürün atamaları dizi olmalıdır')
  }
  const seen = new Set<string>()
  const out: AffiliateProductAssignmentInput[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') {
      throw new AffiliatePartnersError('Ürün ataması geçersiz')
    }
    const rec = row as Record<string, unknown>
    const productId = String(rec.productId ?? '').trim()
    if (!productId) throw new AffiliatePartnersError('Ürün seçimi zorunludur')
    if (seen.has(productId)) {
      throw new AffiliatePartnersError('Aynı ürün birden fazla kez atanamaz')
    }
    seen.add(productId)
    out.push({
      productId,
      commissionRatePercent: parseRatePercent(rec.commissionRatePercent, 'Komisyon oranı'),
      discountRatePercent: parseRatePercent(
        rec.discountRatePercent == null ? 0 : rec.discountRatePercent,
        'Müşteri indirim oranı',
      ),
      isActive: rec.isActive === false ? false : true,
    })
  }
  return out
}

function optionalTrimmed(raw: unknown): string | null {
  if (raw == null || String(raw).trim() === '') return null
  return String(raw).trim()
}

export function parseCreateInput(body: unknown): AffiliatePartnerCreateInput {
  const rec = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const name = String(rec.name ?? '').trim()
  if (!name) throw new AffiliatePartnersError('İş ortağı adı zorunludur')
  const isActive = rec.isActive === false ? false : true
  return {
    name,
    contactName: optionalTrimmed(rec.contactName),
    email: validateOptionalEmail(rec.email),
    phone: optionalTrimmed(rec.phone),
    defaultCommissionRate: parseRatePercent(
      rec.defaultCommissionRate == null ? 0 : rec.defaultCommissionRate,
      'Varsayılan komisyon oranı',
    ),
    isActive,
    internalNotes: optionalTrimmed(rec.internalNotes),
    products: parseProductAssignments(rec.products),
  }
}

export function parseUpdateInput(body: unknown): AffiliatePartnerUpdateInput {
  const rec = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const out: AffiliatePartnerUpdateInput = {}
  if ('name' in rec) {
    const name = String(rec.name ?? '').trim()
    if (!name) throw new AffiliatePartnersError('İş ortağı adı zorunludur')
    out.name = name
  }
  if ('contactName' in rec) out.contactName = optionalTrimmed(rec.contactName)
  if ('email' in rec) out.email = validateOptionalEmail(rec.email)
  if ('phone' in rec) out.phone = optionalTrimmed(rec.phone)
  if ('defaultCommissionRate' in rec) {
    out.defaultCommissionRate = parseRatePercent(rec.defaultCommissionRate, 'Varsayılan komisyon oranı')
  }
  if ('isActive' in rec) out.isActive = rec.isActive === false ? false : true
  if ('internalNotes' in rec) out.internalNotes = optionalTrimmed(rec.internalNotes)
  if ('products' in rec) out.products = parseProductAssignments(rec.products)
  return out
}

export const AFFILIATE_PARTNER_MAGIC_TTL_MS = 30 * 60 * 1000
export const AFFILIATE_PARTNER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const AFFILIATE_PARTNER_SESSION_COOKIE = 'wt_partner_sid'
