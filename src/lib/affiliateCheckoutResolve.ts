import { prisma } from './prisma'
import { isValidReferralCodeFormat, readReferralCodeFromRequest } from './affiliateCookies'
import type { Request } from 'express'

export type ResolvedAffiliateCheckoutLink = {
  linkId: string
  partnerId: string
  productId: string
  code: string
  customerDiscountRate: number
  commissionRatePercent: number
  partnerEmail: string | null
  partnerPhone: string | null
}

/**
 * Checkout anında çerezden aktif bağlantıyı çöz.
 * Pasif / süresi dolmuş / eksik → null (indirim ve komisyon yok).
 */
export async function resolveAffiliateLinkFromRequest(
  req?: Request | null,
): Promise<ResolvedAffiliateCheckoutLink | null> {
  if (!req) return null
  const code = readReferralCodeFromRequest(req)
  if (!code || !isValidReferralCodeFormat(code)) return null
  return resolveAffiliateLinkByCode(code)
}

export async function resolveAffiliateLinkByCode(
  code: string,
): Promise<ResolvedAffiliateCheckoutLink | null> {
  const link = await prisma.affiliateLink.findUnique({
    where: { code },
    include: {
      partner: { select: { id: true, isActive: true, email: true, phone: true } },
      product: { select: { id: true, isActive: true } },
    },
  })
  if (!link) return null
  if (!link.isActive || !link.partner.isActive || !link.product.isActive) return null
  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) return null
  return {
    linkId: link.id,
    partnerId: link.partnerId,
    productId: link.productId,
    code: link.code,
    customerDiscountRate: link.customerDiscountRate,
    commissionRatePercent: link.commissionRatePercent,
    partnerEmail: link.partner.email,
    partnerPhone: link.partner.phone,
  }
}

/** İş ortağı kendi e-postasıyla satın alırsa komisyon yok (Bilirkişi self-referral). */
export function isAffiliateSelfReferral(
  partner: { email?: string | null; phone?: string | null },
  buyer: { email?: string | null; phone?: string | null },
): boolean {
  const pEmail = partner.email?.trim().toLowerCase()
  const bEmail = buyer.email?.trim().toLowerCase()
  if (pEmail && bEmail && pEmail === bEmail) return true
  const pPhone = normalizePhoneDigits(partner.phone)
  const bPhone = normalizePhoneDigits(buyer.phone)
  if (pPhone && bPhone && pPhone.length >= 10 && pPhone === bPhone) return true
  return false
}

function normalizePhoneDigits(raw?: string | null): string {
  if (!raw) return ''
  return String(raw).replace(/\D/g, '')
}
