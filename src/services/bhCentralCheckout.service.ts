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
import {
  bhUpstreamFetch,
  localBhUpstreamDown,
  quoteFromBhListedProduct,
  readBhPublicProduct,
  type BhListedProduct,
} from './bhWebapi.client'
import { safeProcessAffiliateCommissionForOrder } from './affiliateCommission.service'
import { couponsService } from './coupons.service'
import {
  CAMPAIGN_COUPON_EXCLUSIVE_MESSAGE,
  institutionalCampaignDiscountActive,
} from '../lib/bhCampaignCouponExclusive'
import { getBankTransferCustomerInfo, getPublicBankTransferDisplay } from './bankTransferSettings.service'
import { BILIRKISI_HESAP_PRODUCT_SLUG } from '../lib/bhAffiliateConstants'

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

function listedFromProductRead(data: unknown): BhListedProduct | null {
  if (!data || typeof data !== 'object') return null
  const body = data as { data?: BhListedProduct }
  if (body.data && typeof body.data === 'object') return body.data
  return data as BhListedProduct
}

/**
 * PayTR tutarı sipariş toplamından üretilir. prepare-sale başarılı olsa bile
 * BH v2 plan fiyatını değil, admin aylık/yıllık kaydını kullan.
 * İndirim varsa yalnız prepare-sale oranını admin liste fiyatına uygula.
 */
async function adminCheckoutKurus(
  productType: string,
  upstreamFinalKurus: number | null,
  upstreamNormalKurus: number | null,
): Promise<{ finalKurus: number; normalKurus: number } | null> {
  const productRead = await readBhPublicProduct()
  if (!productRead.ok) return null
  const listed = listedFromProductRead(productRead.data)
  if (!listed) return null
  const quote = quoteFromBhListedProduct(listed, productType)
  if (!quote) return null
  let finalTl = quote.finalPrice
  if (
    upstreamNormalKurus != null &&
    Number.isFinite(upstreamNormalKurus) &&
    upstreamNormalKurus > 0 &&
    upstreamFinalKurus != null &&
    Number.isFinite(upstreamFinalKurus) &&
    upstreamFinalKurus >= 0 &&
    upstreamFinalKurus < upstreamNormalKurus
  ) {
    finalTl = Math.round(quote.normalPrice * (upstreamFinalKurus / upstreamNormalKurus) * 100) / 100
  }
  return {
    finalKurus: Math.round(finalTl * 100),
    normalKurus: Math.round(quote.normalPrice * 100),
  }
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
  couponCode?: string | null
  paymentProvider?: 'PAYTR' | 'BANK_TRANSFER'
}): Promise<{
  orderId: string
  orderNo: string
  totalTl: number
  saleRef: string
  amountFormatted?: string
  bankTransfer?: Record<string, string>
}> {
  const email = String(input.customerEmail || '').trim().toLowerCase()
  if (!email) {
    const err = new Error('Müşteri e-postası gerekli') as Error & { status: number }
    err.status = 400
    throw err
  }

  const idem = String(input.checkoutIdempotencyKey || '').trim() || null
  if (idem) {
    const existing = await prisma.order.findUnique({ where: { checkoutIdempotencyKey: idem } })
    if (existing) {
      return {
        orderId: existing.id,
        orderNo: existing.orderNo,
        totalTl: Number(existing.total),
        saleRef: existing.bhSaleRef || existing.orderNo,
      }
    }
  }

  const paymentProvider =
    input.paymentProvider === 'BANK_TRANSFER' ? PaymentProvider.BANK_TRANSFER : PaymentProvider.PAYTR
  let bankDisplay: Awaited<ReturnType<typeof getPublicBankTransferDisplay>> | undefined
  if (paymentProvider === PaymentProvider.BANK_TRANSFER) {
    bankDisplay = await getPublicBankTransferDisplay()
    if (!bankDisplay.bankTransferEnabled) {
      const err = new Error('Havale/EFT ödeme yöntemi şu anda kullanılamıyor.') as Error & { status: number }
      err.status = 400
      throw err
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
    // Renewal: BH ignores promo when bar campaign applies; GENERAL promo allowed otherwise.
    campaignId: input.campaignPublicCode || undefined,
    campaign_id: input.campaignPublicCode || undefined,
    campaignPublicCode: input.campaignPublicCode || undefined,
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
  let localPriceFallback = false
  if (!prepare.ok) {
    if (!localBhUpstreamDown(prepare)) {
      const data = prepare.data as { message?: string; code?: string } | undefined
      const err = new Error(data?.message || prepare.error || 'BH prepare-sale başarısız') as Error & {
        status: number
        code?: string
      }
      err.status = prepare.status || 502
      err.code = data?.code
      throw err
    }
    localPriceFallback = true
  }

  let prep: {
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
  if (localPriceFallback) {
    const productRead = await readBhPublicProduct()
    if (!productRead.ok) {
      const err = new Error('Bilirkişi Hesap servisine şu an ulaşılamıyor. Lütfen kısa süre sonra tekrar deneyin.') as Error & {
        status: number
      }
      err.status = 502
      throw err
    }
    const body = productRead.data as { data?: BhListedProduct } | BhListedProduct | null
    const listed =
      body && typeof body === 'object' && 'data' in body && body.data && typeof body.data === 'object'
        ? body.data
        : (body as BhListedProduct)
    const quote = quoteFromBhListedProduct(listed, input.productType)
    if (!quote) {
      const err = new Error('Seçilen paket için fiyat bulunamadı.') as Error & { status: number }
      err.status = 502
      throw err
    }
    prep = {
      success: true,
      finalPriceKurus: Math.round(quote.finalPrice * 100),
      normalPriceKurus: Math.round(quote.normalPrice * 100),
      productType: input.productType,
      subscriptionPeriod: input.subscriptionPeriod ?? null,
      orderPurpose: input.renewalToken ? 'RENEWAL' : 'NEW',
    }
  } else {
    prep = (prepare.data || {}) as typeof prep
  }
  const adminKurus = await adminCheckoutKurus(
    String(prep.productType || input.productType),
    Number.isFinite(Number(prep.finalPriceKurus)) ? Number(prep.finalPriceKurus) : null,
    prep.normalPriceKurus == null || !Number.isFinite(Number(prep.normalPriceKurus))
      ? null
      : Number(prep.normalPriceKurus),
  )
  if (adminKurus) {
    prep.finalPriceKurus = adminKurus.finalKurus
    prep.normalPriceKurus = adminKurus.normalKurus
  }
  if (!prep.success) {
    const err = new Error(prep.message || 'BH prepare-sale reddedildi') as Error & { status: number }
    err.status = 400
    throw err
  }

  const saleRef = String(prep.saleRef || prep.merchantOid || '').trim()
  const finalKurus = Number(prep.finalPriceKurus)
  if (!Number.isFinite(finalKurus) || finalKurus < 0 || (!localPriceFallback && !saleRef)) {
    const err = new Error('BH prepare-sale yanıtı geçersiz') as Error & { status: number }
    err.status = 502
    throw err
  }

  const merchandise = kurusToTryDecimal(finalKurus)
  let couponQuote: Awaited<ReturnType<typeof couponsService.quoteCouponForPricedLines>> | null = null
  const requestedCoupon = input.couponCode?.trim() || ''
  const campaignRate = Number(prep.campaignDiscountRate)
  const campaignDiscountActive = institutionalCampaignDiscountActive({
    discountRate: Number.isFinite(campaignRate) ? campaignRate : null,
  })
  if (requestedCoupon && campaignDiscountActive) {
    if (saleRef) {
      try {
        await bhUpstreamFetch(
          'POST',
          '/api/payment/woontegra/abandon-sale',
          { merchantOid: saleRef, saleRef },
          { headers: channelHeaders, timeoutMs: 30_000 },
        )
      } catch {
        /* kampanya+kupon reddi asıl hatadır */
      }
    }
    const err = new Error(CAMPAIGN_COUPON_EXCLUSIVE_MESSAGE) as Error & {
      status: number
      publicMessage?: string
    }
    err.status = 400
    err.publicMessage = CAMPAIGN_COUPON_EXCLUSIVE_MESSAGE
    throw err
  }
  if (requestedCoupon) {
    try {
      couponQuote = await couponsService.quoteCouponForPricedLines({
        code: requestedCoupon,
        customerEmail: email,
        lines: [{ productId: product.id, quantity: 1, unitPrice: Number(merchandise) }],
      })
    } catch (err) {
      if (saleRef) {
        try {
          await bhUpstreamFetch(
            'POST',
            '/api/payment/woontegra/abandon-sale',
            { merchantOid: saleRef, saleRef },
            { headers: channelHeaders, timeoutMs: 30_000 },
          )
        } catch {
          /* kupon reddi asıl hatadır */
        }
      }
      throw err
    }
  }
  const total = couponQuote
    ? new Prisma.Decimal((Number(merchandise) - couponQuote.discountAmount).toFixed(2))
    : merchandise
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
      paymentProvider,
      subtotal: merchandise,
      total,
      currency: 'TRY',
      couponCodeSnapshot: couponQuote?.code ?? null,
      couponCampaignSlugSnapshot: couponQuote?.couponId ?? null,
      couponCampaignNameSnapshot: couponQuote?.couponName ?? null,
      couponDiscountTypeSnapshot: couponQuote?.discountType ?? null,
      couponDiscountValueSnapshot: couponQuote
        ? new Prisma.Decimal(couponQuote.discountValue.toFixed(2))
        : null,
      couponDiscountAmount: couponQuote
        ? new Prisma.Decimal(couponQuote.discountAmount.toFixed(2))
        : null,
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
      bhPurchaseContext:
        prep.orderPurpose === 'RENEWAL'
          ? 'RENEWAL'
          : prep.orderPurpose === 'DEMO_CONVERSION'
            ? 'DEMO_CONVERSION'
            : 'NEW',
      bhSaleRef: saleRef || null,
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
            unitPrice: merchandise,
            quantity: 1,
            total: merchandise,
            downloadUrl: `saas:${product.slug}`,
          },
        ],
      },
    },
  })

  let amountFormatted: string | undefined
  let bankTransfer: Record<string, string> | undefined
  if (paymentProvider === PaymentProvider.BANK_TRANSFER) {
    const info = await getBankTransferCustomerInfo(
      { orderNo: order.orderNo, total: Number(order.total), currency: order.currency },
      bankDisplay,
    )
    if (!info) {
      const err = new Error('Havale/EFT ödeme yöntemi şu anda kullanılamıyor.') as Error & { status: number }
      err.status = 400
      throw err
    }
    amountFormatted = info.amountFormatted
    bankTransfer = {
      bankName: info.bankName,
      accountHolder: info.accountHolder,
      iban: info.iban,
      ...(info.branchName ? { branchName: info.branchName } : {}),
      ...(info.accountNumber ? { accountNumber: info.accountNumber } : {}),
      paymentReference: info.paymentReference,
    }
  }

  return {
    orderId: order.id,
    orderNo: order.orderNo,
    totalTl: Number(order.total),
    saleRef: saleRef || order.orderNo,
    amountFormatted,
    bankTransfer,
  }
}

export async function validateBilirkisiCheckoutCoupon(input: {
  productType: 'monthly' | 'annual'
  couponCode: string
  customerEmail?: string | null
  campaignPublicCode?: string | null
}) {
  const code = input.couponCode.trim()
  if (!code) {
    const err = new Error('Bu kupon bulunamadı.') as Error & { status: number; publicMessage?: string }
    err.status = 400
    err.publicMessage = err.message
    throw err
  }
  const product = await prisma.product.findUnique({
    where: { slug: BILIRKISI_HESAP_PRODUCT_SLUG },
    select: { id: true },
  })
  if (!product) {
    const err = new Error('Bu kupon seçili ürün için geçerli değildir.') as Error & {
      status: number
      publicMessage?: string
    }
    err.status = 400
    err.publicMessage = err.message
    throw err
  }
  const productRead = await readBhPublicProduct()
  const listed = listedFromProductRead(productRead.data)
  const quote = listed ? quoteFromBhListedProduct(listed, input.productType) : null
  if (!productRead.ok || !quote) {
    const err = new Error('Seçilen paket için fiyat bulunamadı.') as Error & { status: number }
    err.status = 502
    throw err
  }
  let merchandiseTl = quote.finalPrice
  if (input.campaignPublicCode) {
    const upstream = await bhUpstreamFetch('POST', '/api/campaigns/quote', {
      productType: input.productType,
      product_type: input.productType,
      campaignPublicCode: input.campaignPublicCode,
      campaignId: input.campaignPublicCode,
    })
    const body = upstream.ok
      ? (upstream.data as {
          quote?: { normalPrice?: unknown; finalPrice?: unknown; campaign?: { discountRate?: unknown } | null }
          campaign?: { discountRate?: unknown } | null
        })
      : null
    const upstreamQuote = body?.quote
    const normal = Number(upstreamQuote?.normalPrice)
    const final = Number(upstreamQuote?.finalPrice)
    const rate = Number(upstreamQuote?.campaign?.discountRate ?? body?.campaign?.discountRate)
    const campaignApplied =
      institutionalCampaignDiscountActive({
        discountRate: Number.isFinite(rate) ? rate : null,
        hasCampaign: true,
        normalPrice: Number.isFinite(normal) ? normal : null,
        finalPrice: Number.isFinite(final) ? final : null,
      }) ||
      (Number.isFinite(normal) &&
        normal > 0 &&
        Number.isFinite(final) &&
        final >= 0 &&
        final < normal)
    if (campaignApplied) {
      const err = new Error(CAMPAIGN_COUPON_EXCLUSIVE_MESSAGE) as Error & {
        status: number
        publicMessage?: string
      }
      err.status = 400
      err.publicMessage = CAMPAIGN_COUPON_EXCLUSIVE_MESSAGE
      throw err
    }
  }
  const evaluated = await couponsService.quoteCouponForPricedLines({
    code,
    customerEmail: input.customerEmail,
    lines: [{ productId: product.id, quantity: 1, unitPrice: merchandiseTl }],
  })
  return { ...evaluated, currency: 'TRY' }
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

/**
 * PayTR get-token / start failure ONLY: abandon BH prepare-sale so campaign reservation releases.
 * Idempotent — BH abandon-sale is safe for already-failed/released payments.
 *
 * IN-FLIGHT PROTECTION: must not be called after a successful get-token / while PayTR payment
 * may still be open. Callers must have proven get-token API failure evidence.
 */
export async function abandonBilirkisiHesapPreparedSale(orderId: string): Promise<{
  attempted: boolean
  ok: boolean
  error?: string
}> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNo: true,
      bhSaleRef: true,
      status: true,
      bhFulfillmentStatus: true,
    },
  })
  if (!order?.bhSaleRef) return { attempted: false, ok: true }
  if (order.status === OrderStatus.PAID || order.bhFulfillmentStatus === 'APPLIED') {
    return { attempted: false, ok: false, error: 'ORDER_ALREADY_PAID_OR_FULFILLED' }
  }

  const headers = buildWoontegraBhSalesChannelHeaders()
  const result = await bhUpstreamFetch(
    'POST',
    '/api/payment/woontegra/abandon-sale',
    { merchantOid: order.bhSaleRef, saleRef: order.bhSaleRef },
    { headers, timeoutMs: 30_000 },
  )

  if (!result.ok) {
    const msg =
      (result.data as { message?: string } | undefined)?.message ||
      result.error ||
      'abandon-sale failed'
    console.error('[bh-abandon] abandon-sale failed', {
      orderNo: order.orderNo,
      saleRef: order.bhSaleRef,
      message: msg,
    })
    return { attempted: true, ok: false, error: msg }
  }

  return { attempted: true, ok: true }
}
