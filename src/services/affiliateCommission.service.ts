import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import {
  AFFILIATE_COMMISSION_STATUS,
  evaluateAffiliateCommissionForPaidOrder,
  type AffiliateCommissionEvalLink,
  type AffiliateCommissionEvalOrder,
} from '../lib/affiliateCommissionEvaluate'

export {
  AFFILIATE_COMMISSION_STATUS,
  AFFILIATE_SALE_TYPE,
} from '../lib/affiliateCommissionEvaluate'

export const ORDER_AFFILIATE_COMMISSION_STATUS = {
  APPLIED: 'APPLIED',
  SKIPPED: 'SKIPPED',
  FAILED: 'FAILED',
} as const

export type AffiliateCommissionProcessResult = {
  created: boolean
  skipped?: boolean
  reason?: string
  commissionId?: string
}

async function markOrderCommissionMeta(
  orderId: string,
  status: string,
  error: string | null,
) {
  await prisma.order.update({
    where: { id: orderId },
    data: {
      affiliateCommissionStatus: status,
      affiliateCommissionError: error,
      affiliateCommissionAt: new Date(),
    },
  })
}

/**
 * Başarılı (PAID) sipariş için komisyon oluştur — orderId unique.
 * Ödeme/lisans/e-posta akışını engellemez; çağıran try/catch kullanmalı.
 */
export async function createAffiliateCommissionForPaidOrder(
  orderId: string,
): Promise<AffiliateCommissionProcessResult> {
  const existing = await prisma.affiliateCommission.findUnique({ where: { orderId } })
  if (existing) {
    await markOrderCommissionMeta(orderId, ORDER_AFFILIATE_COMMISSION_STATUS.APPLIED, null)
    return { created: false, skipped: true, reason: 'already_exists', commissionId: existing.id }
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        select: {
          productId: true,
          productName: true,
          total: true,
          quantity: true,
          saasMembershipId: true,
          saasRenewalDays: true,
          product: { select: { productType: true } },
        },
      },
      affiliateLink: {
        include: {
          partner: { select: { id: true, email: true, phone: true, isActive: true } },
          product: { select: { id: true, name: true, isActive: true } },
        },
      },
    },
  })

  if (!order) {
    return { created: false, skipped: true, reason: 'order_missing' }
  }

  const evalOrder: AffiliateCommissionEvalOrder = {
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    currency: order.currency,
    affiliateLinkId: order.affiliateLinkId,
    affiliateCustomerDiscountRate: order.affiliateCustomerDiscountRate,
    campaignDiscountRateSnapshot: order.campaignDiscountRateSnapshot,
    effectiveCustomerDiscountRate: order.effectiveCustomerDiscountRate,
    desktopLicensePurchaseContext: order.desktopLicensePurchaseContext,
    mkSaasPurchaseContext: order.mkSaasPurchaseContext,
    items: order.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      total: Number(item.total),
      quantity: item.quantity,
      saasMembershipId: item.saasMembershipId,
      saasRenewalDays: item.saasRenewalDays,
      productType: item.product?.productType ?? null,
    })),
  }

  const link: AffiliateCommissionEvalLink | null = order.affiliateLink
    ? {
        id: order.affiliateLink.id,
        partnerId: order.affiliateLink.partnerId,
        productId: order.affiliateLink.productId,
        customerDiscountRate: order.affiliateLink.customerDiscountRate,
        commissionRatePercent: order.affiliateLink.commissionRatePercent,
        partner: {
          email: order.affiliateLink.partner.email,
          phone: order.affiliateLink.partner.phone,
          isActive: order.affiliateLink.partner.isActive,
        },
        product: {
          id: order.affiliateLink.product.id,
          name: order.affiliateLink.product.name,
          isActive: order.affiliateLink.product.isActive,
        },
      }
    : null

  const decision = evaluateAffiliateCommissionForPaidOrder({
    order: evalOrder,
    link,
    existingCommissionId: null,
  })

  if (decision.action === 'skip') {
    if (decision.reason !== 'order_not_paid' && decision.reason !== 'order_missing') {
      await markOrderCommissionMeta(
        orderId,
        ORDER_AFFILIATE_COMMISSION_STATUS.SKIPPED,
        decision.reason,
      )
    }
    return {
      created: false,
      skipped: true,
      reason: decision.reason,
      commissionId: decision.commissionId,
    }
  }

  try {
    const commission = await prisma.affiliateCommission.create({
      data: decision.data,
    })
    await markOrderCommissionMeta(orderId, ORDER_AFFILIATE_COMMISSION_STATUS.APPLIED, null)
    return { created: true, commissionId: commission.id }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const again = await prisma.affiliateCommission.findUnique({ where: { orderId } })
      await markOrderCommissionMeta(orderId, ORDER_AFFILIATE_COMMISSION_STATUS.APPLIED, null)
      return {
        created: false,
        skipped: true,
        reason: 'unique_race',
        commissionId: again?.id,
      }
    }
    throw err
  }
}

/** Lisans/e-posta akışını asla bozmaz. */
export async function safeProcessAffiliateCommissionForOrder(orderId: string): Promise<void> {
  try {
    await createAffiliateCommissionForPaidOrder(orderId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[affiliate] commission processing failed (non-blocking)', {
      orderId,
      error: message,
    })
    try {
      await markOrderCommissionMeta(orderId, ORDER_AFFILIATE_COMMISSION_STATUS.FAILED, message.slice(0, 2000))
    } catch (metaErr) {
      console.error('[affiliate] failed to persist commission error meta', metaErr)
    }
  }
}
