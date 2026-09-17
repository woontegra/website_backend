import { prisma } from '../lib/prisma'

export type ActiveReferralLink = {
  id: string
  code: string
  partnerId: string
  productId: string
  productSlug: string
}

/**
 * Public /api/r/:code — aktif iş ortağı + ürün + süresi dolmamış bağlantı.
 * Checkout resolve ile aynı aktiflik kuralları (pasif/expired → yok).
 */
export async function resolveActiveReferralLink(
  code: string,
): Promise<{ ok: true; link: ActiveReferralLink } | { ok: false }> {
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
    },
  }
}

/** Best-effort visit ledger; redirect must not fail if insert fails. */
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
