import type { Request } from 'express'
import { OrderStatus, PaymentProvider, Prisma, ProductType } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { getClientIp } from '../lib/clientIp'
import { buildWoontegraBhSalesChannelHeaders } from '../lib/bhSalesChannel'
import { ensureBilirkisiHesapCatalogProduct } from './ensureBilirkisiHesapProduct.service'
import {
  buildBhAffiliateBridgeHeaders,
  resolveBhAffiliateFromRequest,
} from './bhAffiliate.service'
import { bhUpstreamFetch } from './bhWebapi.client'
import { safeProcessAffiliateCommissionForOrder } from './affiliateCommission.service'

export type BhCheckoutBilling = {
  invoiceType?: string
  fullName?: string
  name?: string
  email?: string
  phone?: string
  address?: string
  openAddress?: string
  city?: string
  district?: string
  identityNumber?: string
  companyName?: string
  taxOffice?: string
  taxNumber?: string
}

function allocateOrderNo(): string {
  const t = Date.now().toString(36).toUpperCase()
  const r = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `WTBH-${t}${r}`
}

function kurusToTryDecimal(kurus: number): Prisma.Decimal {
  return new Prisma.Decimal((Math.round(kurus) / 100).toFixed(2))
}

export async function createBhCentralCheckoutOrder(input: {
  req: Request
  customerId: string
  customerEmail: string
  customerName: string
  customerPhone?: string | null
  productType: 'monthly' | 'annual'
  subscriptionPeriod?: number
  campaignPublicCode?: string | null
  renewalToken?: string | null
  billingInfo: BhCheckoutBilling
  legalConsents?: Record<string, unknown>
  checkoutIdempotencyKey?: string | null
}): Promise<{ orderId: string; orderNo: string; totalTl: number; saleRef: string }> {
  const email = String(input.customerEmail || '').trim().toLowerCase()
  if (!email) {
    const err = new Error('Müşteri e-postası gerekli') as Error & { status: number }
    err.status = 400
    throw err
  }

  const idem = String(input.checkoutIdempotencyKey || '').trim() || null
  if (idem) {
    const existing = await prisma.order.findUnique({ where: { checkoutIdempotencyKey: idem } })
    if (existing?.bhSaleRef) {
      return {
        orderId: existing.id,
        orderNo: existing.orderNo,
        totalTl: Number(existing.total),
        saleRef: existing.bhSaleRef,
      }
    }
  }

  const product = await ensureBilirkisiHesapCatalogProduct()
  const affiliate = await resolveBhAffiliateFromRequest(input.req, {
    email,
    phone: input.customerPhone || input.billingInfo.phone || null,
  })
  const channelHeaders = {
    ...buildWoontegraBhSalesChannelHeaders(),
    ...buildBhAffiliateBridgeHeaders(affiliate),
  }

  const prepareBody = {
    productType: input.productType,
    product_type: input.productType,
    subscriptionPeriod: input.subscriptionPeriod,
    campaignId: input.renewalToken ? undefined : input.campaignPublicCode || undefined,
    campaign_id: input.renewalToken ? undefined : input.campaignPublicCode || undefined,
    renewalToken: input.renewalToken || undefined,
    billingInfo: {
      ...input.billingInfo,
      email: input.billingInfo.email || email,
      fullName: input.billingInfo.fullName || input.billingInfo.name || input.customerName,
      name: input.billingInfo.name || input.billingInfo.fullName || input.customerName,
    },
    legalConsents: input.legalConsents,
    legal_consents: input.legalConsents,
    customerNote: `woontegraCustomerId:${input.customerId}`,
  }

  const prepare = await bhUpstreamFetch('POST', '/api/payment/woontegra/prepare-sale', prepareBody, {
    headers: channelHeaders,
    timeoutMs: 45_000,
  })
  if (!prepare.ok) {
    const data = prepare.data as { message?: string; code?: string } | undefined
    const err = new Error(data?.message || prepare.error || 'BH prepare-sale başarısız') as Error & {
      status: number
      code?: string
    }
    err.status = prepare.status || 502
    err.code = data?.code
    throw err
  }

  const prep = (prepare.data || {}) as {
    success?: boolean
    saleRef?: string
    merchantOid?: string
    finalPriceKurus?: number
    normalPriceKurus?: number | null
    productType?: string
    subscriptionPeriod?: number | null
    orderPurpose?: string
    campaignPublicCode?: string | null
    campaignId?: string | null
    campaignDiscountRate?: number | null
    renewalSessionId?: string | null
    message?: string
  }
  if (!prep.success) {
    const err = new Error(prep.message || 'BH prepare-sale reddedildi') as Error & { status: number }
    err.status = 400
    throw err
  }

  const saleRef = String(prep.saleRef || prep.merchantOid || '').trim()
  const finalKurus = Number(prep.finalPriceKurus)
  if (!saleRef || !Number.isFinite(finalKurus) || finalKurus < 0) {
    const err = new Error('BH prepare-sale yanıtı geçersiz') as Error & { status: number }
    err.status = 502
    throw err
  }

  const total = kurusToTryDecimal(finalKurus)
  const orderNo = allocateOrderNo()
  const ip = getClientIp(input.req)
  const ua = String(input.req.headers['user-agent'] || '').slice(0, 500) || null
  const billing = input.billingInfo
  const corporate = String(billing.invoiceType || '').toLowerCase() === 'corporate'

  const order = await prisma.order.create({
    data: {
      orderNo,
      customerId: input.customerId,
      customerName: String(billing.fullName || billing.name || input.customerName).trim(),
      customerEmail: email,
      customerPhone: String(billing.phone || input.customerPhone || '').trim() || null,
      billingType: corporate ? 'corporate' : 'individual',
      taxOffice: corporate ? String(billing.taxOffice || '').trim() || null : null,
      taxNumber: corporate
        ? String(billing.taxNumber || '').trim() || null
        : String(billing.identityNumber || '').trim() || null,
      companyName: corporate ? String(billing.companyName || '').trim() || null : null,
      status: OrderStatus.PENDING,
      paymentProvider: PaymentProvider.PAYTR,
      subtotal: total,
      total,
      currency: 'TRY',
      acceptedIp: ip || null,
      acceptedUserAgent: ua,
      preInfoAcceptedAt: new Date(),
      distanceSalesAcceptedAt: new Date(),
      kvkkReadAt: new Date(),
      saasSubscriptionAcceptedAt: new Date(),
      digitalServiceWaiverAcceptedAt: new Date(),
      legalCartProductTypes: String(ProductType.SAAS),
      checkoutIdempotencyKey: idem,
      affiliateLinkId: affiliate?.linkId ?? null,
      affiliatePartnerId: affiliate?.partnerId ?? null,
      affiliateCode: affiliate?.code ?? null,
      affiliateCustomerDiscountRate: affiliate?.customerDiscountRate ?? null,
      campaignDiscountRateSnapshot: prep.campaignDiscountRate ?? null,
      effectiveCustomerDiscountRate: Math.max(
        prep.campaignDiscountRate ?? 0,
        affiliate?.customerDiscountRate ?? 0,
      ),
      bhPurchaseContext: prep.orderPurpose === 'RENEWAL' ? 'RENEWAL' : 'NEW',
      bhSaleRef: saleRef,
      bhProductType: String(prep.productType || input.productType),
      bhSubscriptionPeriod:
        prep.subscriptionPeriod == null ? null : Number(prep.subscriptionPeriod),
      bhCampaignPublicCode: prep.campaignPublicCode ?? null,
      bhCampaignId: prep.campaignId ?? null,
      bhRenewalSessionId: prep.renewalSessionId ?? null,
      bhQuoteFinalKurus: Math.round(finalKurus),
      bhQuoteNormalKurus:
        prep.normalPriceKurus == null ? null : Math.round(Number(prep.normalPriceKurus)),
      bhFulfillmentStatus: 'PENDING',
      items: {
        create: [
          {
            productId: product.id,
            productName: product.name,
            productSlug: product.slug,
            unitPrice: total,
            quantity: 1,
            total,
            downloadUrl: `saas:${product.slug}`,
          },
        ],
      },
    },
  })

  return {
    orderId: order.id,
    orderNo: order.orderNo,
    totalTl: Number(order.total),
    saleRef,
  }
}

export async function ensureBilirkisiHesapFulfillment(orderId: string): Promise<{
  attempted: boolean
  ok: boolean
  error?: string
}> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: { select: { slug: true } } } } },
  })
  if (!order?.bhSaleRef) return { attempted: false, ok: true }
  if (order.bhFulfillmentStatus === 'APPLIED') return { attempted: false, ok: true }
  if (order.status !== OrderStatus.PAID) {
    return { attempted: false, ok: false, error: 'ORDER_NOT_PAID' }
  }

  const isBhLine = order.items.some(
    (i) => i.product?.slug === 'bilirkisi-hesap' || i.productSlug === 'bilirkisi-hesap',
  )
  if (!isBhLine) {
    return { attempted: false, ok: false, error: 'CROSS_PRODUCT_BLOCKED' }
  }

  const headers = buildWoontegraBhSalesChannelHeaders()
  const result = await bhUpstreamFetch(
    'POST',
    '/api/payment/woontegra/complete-sale',
    {
      merchantOid: order.bhSaleRef,
      saleRef: order.bhSaleRef,
      wtOrderNo: order.orderNo,
      expectedFinalKurus: order.bhQuoteFinalKurus,
      finalPriceKurus: order.bhQuoteFinalKurus,
      customerEmail: order.customerEmail,
    },
    { headers, timeoutMs: 60_000 },
  )

  if (!result.ok) {
    const msg =
      (result.data as { message?: string } | undefined)?.message || result.error || 'complete-sale failed'
    await prisma.order.update({
      where: { id: order.id },
      data: {
        bhFulfillmentStatus: 'FAILED',
        bhFulfillmentError: String(msg).slice(0, 2000),
      },
    })
    return { attempted: true, ok: false, error: msg }
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      bhFulfillmentStatus: 'APPLIED',
      bhFulfillmentAt: new Date(),
      bhFulfillmentError: null,
    },
  })

  // Commission on the real WT order (not synthetic BH-{oid}) — once.
  try {
    await safeProcessAffiliateCommissionForOrder(order.id)
  } catch (e) {
    console.error('[bh-fulfill] affiliate commission error', e)
  }

  return { attempted: true, ok: true }
}
