import crypto from 'crypto'
import type { Request } from 'express'
import { prisma } from '../lib/prisma'
import { AffiliatePartnersError } from '../lib/affiliatePartners'
import {
  buildAffiliateReferralPublicUrl,
  buildProductLandingPath,
} from '../lib/affiliateSiteOrigin'

const CODE_BYTES = 12
const CODE_MAX_RETRIES = 8

function generateLinkCode(): string {
  return crypto.randomBytes(CODE_BYTES).toString('base64url')
}

function mapLink(
  row: {
    id: string
    partnerId: string
    productId: string
    partnerProductId: string | null
    code: string
    customerDiscountRate: number
    commissionRatePercent: number
    isActive: boolean
    expiresAt: Date | null
    createdAt: Date
    updatedAt: Date
    product: { id: string; name: string; slug: string; isActive: boolean }
  },
  req?: Request | null,
  preferredOrigin?: unknown,
) {
  return {
    id: row.id,
    partnerId: row.partnerId,
    productId: row.productId,
    partnerProductId: row.partnerProductId,
    code: row.code,
    customerDiscountRate: row.customerDiscountRate,
    commissionRatePercent: row.commissionRatePercent,
    isActive: row.isActive,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    product: {
      id: row.product.id,
      name: row.product.name,
      slug: row.product.slug,
      isActive: row.product.isActive,
    },
    publicUrl: buildAffiliateReferralPublicUrl(row.code, req, preferredOrigin),
    landingPath: buildProductLandingPath(row.product.slug),
  }
}

export const affiliateLinksService = {
  async listForPartner(
    partnerId: string,
    req?: Request | null,
    preferredOrigin?: unknown,
    opts?: { page?: number; limit?: number },
  ) {
    const page = Math.max(1, opts?.page ?? 1)
    const limit = Math.min(100, Math.max(1, opts?.limit ?? 10))
    const where = { partnerId }
    const [total, rows] = await Promise.all([
      prisma.affiliateLink.count({ where }),
      prisma.affiliateLink.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, slug: true, isActive: true } },
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])
    return {
      items: rows.map((row) => mapLink(row, req, preferredOrigin)),
      pagination: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    }
  },

  async createForPartner(
    partnerId: string,
    body: unknown,
    req?: Request | null,
    preferredOrigin?: unknown,
  ) {
    const partner = await prisma.affiliatePartner.findUnique({ where: { id: partnerId } })
    if (!partner) throw new AffiliatePartnersError('İş ortağı bulunamadı', 404)
    if (!partner.isActive) {
      throw new AffiliatePartnersError('Pasif iş ortağı için bağlantı oluşturulamaz')
    }

    const rec = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
    const productId = String(rec.productId ?? '').trim()
    if (!productId) throw new AffiliatePartnersError('Ürün seçimi zorunludur')

    const assignment = await prisma.affiliatePartnerProduct.findUnique({
      where: { partnerId_productId: { partnerId, productId } },
      include: { product: { select: { id: true, name: true, slug: true, isActive: true } } },
    })
    if (!assignment || !assignment.isActive) {
      throw new AffiliatePartnersError('Bu ürün iş ortağına atanmamış veya pasif')
    }
    if (!assignment.product.isActive) {
      throw new AffiliatePartnersError('Seçilen ürün satışa kapalı')
    }

    let lastError: unknown = null
    for (let attempt = 0; attempt < CODE_MAX_RETRIES; attempt += 1) {
      const code = generateLinkCode()
      try {
        const created = await prisma.affiliateLink.create({
          data: {
            partnerId,
            productId,
            partnerProductId: assignment.id,
            code,
            customerDiscountRate: assignment.discountRatePercent,
            commissionRatePercent: assignment.commissionRatePercent,
            isActive: true,
          },
          include: {
            product: { select: { id: true, name: true, slug: true, isActive: true } },
          },
        })
        return mapLink(created, req, preferredOrigin)
      } catch (err) {
        lastError = err
        const e = err as { code?: string }
        if (e.code === 'P2002') continue
        throw err
      }
    }
    throw new AffiliatePartnersError('Benzersiz bağlantı kodu üretilemedi', 500)
  },

  async setActive(linkId: string, isActive: boolean, req?: Request | null, preferredOrigin?: unknown) {
    const existing = await prisma.affiliateLink.findUnique({
      where: { id: linkId },
      include: { product: { select: { id: true, name: true, slug: true, isActive: true } } },
    })
    if (!existing) throw new AffiliatePartnersError('Bağlantı bulunamadı', 404)
    const updated = await prisma.affiliateLink.update({
      where: { id: linkId },
      data: { isActive },
      include: { product: { select: { id: true, name: true, slug: true, isActive: true } } },
    })
    return mapLink(updated, req, preferredOrigin)
  },
}

export type ResolvedAffiliateLink = {
  ok: true
  link: {
    id: string
    code: string
    partnerId: string
    productId: string
    productSlug: string
    isActive: boolean
  }
}

export async function resolveActiveReferralLink(code: string): Promise<ResolvedAffiliateLink | { ok: false }> {
  const link = await prisma.affiliateLink.findUnique({
    where: { code },
    include: {
      partner: { select: { isActive: true } },
      product: { select: { slug: true, isActive: true } },
    },
  })
  if (!link) return { ok: false }
  if (!link.isActive || !link.partner.isActive || !link.product.isActive) return { ok: false }
  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) return { ok: false }
  return {
    ok: true,
    link: {
      id: link.id,
      code: link.code,
      partnerId: link.partnerId,
      productId: link.productId,
      productSlug: link.product.slug,
      isActive: true,
    },
  }
}

export async function recordAffiliateVisit(input: {
  linkId: string
  partnerId: string
  productId: string
  code: string
  ipAddress?: string | null
  userAgent?: string | null
  referer?: string | null
  landingPath?: string | null
}) {
  try {
    await prisma.affiliateVisit.create({
      data: {
        linkId: input.linkId,
        partnerId: input.partnerId,
        productId: input.productId,
        code: input.code,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        referer: input.referer ?? null,
        landingPath: input.landingPath ?? null,
      },
    })
  } catch (err) {
    console.error('[affiliate] visit kaydı başarısız', err)
  }
}
