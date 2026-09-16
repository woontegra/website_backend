import type { Request } from 'express'
import { OrderStatus, PaymentProvider, Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import {
  isAffiliateSelfReferral,
  resolveAffiliateLinkFromRequest,
  type ResolvedAffiliateCheckoutLink,
} from '../lib/affiliateCheckoutResolve'
import { ensureBilirkisiHesapCatalogProduct } from './ensureBilirkisiHesapProduct.service'
import { safeProcessAffiliateCommissionForOrder } from './affiliateCommission.service'
import {
  BILIRKISI_HESAP_PRODUCT_SLUG,
  bhAffiliateOrderNo,
} from '../lib/bhAffiliateConstants'

export type BhAffiliateBridgeHeaders = Record<string, string>

/**
 * Resolve wt_aff_ref for Bilirkişi Hesap catalog product.
 * Returns null when no active attribution or product mismatch / self-referral.
 */
export async function resolveBhAffiliateFromRequest(
  req: Request,
  buyer?: { email?: string | null; phone?: string | null },
): Promise<ResolvedAffiliateCheckoutLink | null> {
  const product = await ensureBilirkisiHesapCatalogProduct()
  const link = await resolveAffiliateLinkFromRequest(req)
  if (!link) return null
  if (link.productId !== product.id) return null
  if (
    buyer &&
    isAffiliateSelfReferral(
      { email: link.partnerEmail, phone: link.partnerPhone },
      buyer,
    )
  ) {
    return null
  }
  return link
}

/** Trusted headers so local/prod BH webapi can apply Woontegra affiliate rate (Policy C already on BH). */
export function buildBhAffiliateBridgeHeaders(
  affiliate: ResolvedAffiliateCheckoutLink | null,
): BhAffiliateBridgeHeaders {
  const secret = (process.env.WOONTEGRA_BH_AFFILIATE_BRIDGE_SECRET || '').trim()
  if (!secret || !affiliate) return {}
  const rate = Math.max(0, Math.min(100, Math.trunc(affiliate.customerDiscountRate)))
  return {
    'X-Woontegra-Affiliate-Secret': secret,
    'X-Woontegra-Affiliate-Discount-Rate': String(rate),
  }
}

export type BhSaleCommissionInput = {
  merchantOid: string
  customerEmail: string
  customerName: string
  customerPhone?: string | null
  customerId?: string | null
  /** Final paid amount in TRY (not kuruş). */
  finalPriceTl: number
  campaignDiscountRate?: number | null
  affiliate: ResolvedAffiliateCheckoutLink | null
  paymentProvider?: 'PAYTR' | 'BANK_TRANSFER'
}

/**
 * Ledger a BH payment as Woontegra Order (orderNo=BH-{merchantOid}) and run existing commission motor.
 * No Woontegra license fulfillment — BH already fulfilled the license.
 * Idempotent on orderNo + AffiliateCommission.orderId.
 */
export async function recordBhAffiliateCommissionForPaidSale(
  input: BhSaleCommissionInput,
): Promise<{
  orderId: string
  orderNo: string
  commission: Awaited<ReturnType<typeof safeProcessAffiliateCommissionForOrder>> | null
  createdOrder: boolean
}> {
  const merchantOid = String(input.merchantOid || '').trim()
  if (!merchantOid) {
    throw new Error('merchantOid gerekli')
  }
  const orderNo = bhAffiliateOrderNo(merchantOid)
  const product = await ensureBilirkisiHesapCatalogProduct()
  const total = Number(input.finalPriceTl)
  const safeTotal = Number.isFinite(total) && total >= 0 ? Math.round(total * 100) / 100 : 0

  let affiliate = input.affiliate
  if (
    affiliate &&
    isAffiliateSelfReferral(
      { email: affiliate.partnerEmail, phone: affiliate.partnerPhone },
      { email: input.customerEmail, phone: input.customerPhone },
    )
  ) {
    affiliate = null
  }
  if (affiliate && affiliate.productId !== product.id) {
    affiliate = null
  }

  const existing = await prisma.order.findUnique({ where: { orderNo } })
  let orderId: string
  let createdOrder = false

  if (existing) {
    orderId = existing.id
    if (existing.status !== OrderStatus.PAID) {
      await prisma.order.update({
        where: { id: existing.id },
        data: {
          status: OrderStatus.PAID,
          paidAt: existing.paidAt ?? new Date(),
          total: new Prisma.Decimal(safeTotal),
          subtotal: new Prisma.Decimal(safeTotal),
          ...(affiliate
            ? {
                affiliateLinkId: affiliate.linkId,
                affiliatePartnerId: affiliate.partnerId,
                affiliateCode: affiliate.code,
                affiliateCustomerDiscountRate: affiliate.customerDiscountRate,
                campaignDiscountRateSnapshot: input.campaignDiscountRate ?? 0,
                effectiveCustomerDiscountRate: Math.max(
                  affiliate.customerDiscountRate,
                  input.campaignDiscountRate ?? 0,
                ),
              }
            : {}),
        },
      })
    }
  } else {
    const order = await prisma.order.create({
      data: {
        orderNo,
        customerId: input.customerId || null,
        customerName: input.customerName || input.customerEmail,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone || null,
        status: OrderStatus.PAID,
        paymentProvider:
          input.paymentProvider === 'BANK_TRANSFER'
            ? PaymentProvider.BANK_TRANSFER
            : PaymentProvider.PAYTR,
        subtotal: new Prisma.Decimal(safeTotal),
        total: new Prisma.Decimal(safeTotal),
        currency: 'TRY',
        paidAt: new Date(),
        affiliateLinkId: affiliate?.linkId ?? null,
        affiliatePartnerId: affiliate?.partnerId ?? null,
        affiliateCode: affiliate?.code ?? null,
        affiliateCustomerDiscountRate: affiliate?.customerDiscountRate ?? null,
        campaignDiscountRateSnapshot: input.campaignDiscountRate ?? null,
        effectiveCustomerDiscountRate: affiliate
          ? Math.max(affiliate.customerDiscountRate, input.campaignDiscountRate ?? 0)
          : input.campaignDiscountRate ?? null,
        adminNote: `BH external sale ledger (${BILIRKISI_HESAP_PRODUCT_SLUG}); merchantOid=${merchantOid}`,
        items: {
          create: [
            {
              productId: product.id,
              productName: product.name,
              productSlug: product.slug,
              unitPrice: new Prisma.Decimal(safeTotal),
              quantity: 1,
              total: new Prisma.Decimal(safeTotal),
            },
          ],
        },
      },
    })
    orderId = order.id
    createdOrder = true
  }

  // Only run commission when attribution exists (or already on order).
  const orderForCommission = await prisma.order.findUnique({
    where: { id: orderId },
    select: { affiliateLinkId: true },
  })
  if (!orderForCommission?.affiliateLinkId) {
    return { orderId, orderNo, commission: null, createdOrder }
  }

  await safeProcessAffiliateCommissionForOrder(orderId)
  return { orderId, orderNo, commission: null, createdOrder }
}
