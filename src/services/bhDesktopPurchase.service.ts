import { PaymentProvider, Prisma, ProductType } from '@prisma/client'
import type { Request } from 'express'
import { prisma } from '../lib/prisma'
import { getClientIp } from '../lib/clientIp'
import {
  BH_DESKTOP_LICENSE_DAYS,
  BH_DESKTOP_MAX_DEVICES,
  BH_DESKTOP_YEARLY_PRICE_KURUS,
  selectDesktopYearlyOffer,
} from '../lib/bhDesktopYearlyOffer'
import {
  hashDesktopPurchaseToken,
  isOpaqueDesktopPurchaseToken,
  publicDesktopPurchaseQuote,
} from '../lib/bhDesktopPurchaseQuote'
import {
  BILIRKISI_DESKTOP_FIRST_PURCHASE_CONTEXT,
  DESKTOP_LICENSE_PURCHASE_CONTEXT_RENEWAL,
} from '../lib/desktopLicensePurchaseContext'
import { chargeBhDesktop } from '../lib/bhDesktopPayable'
import { CAMPAIGN_COUPON_EXCLUSIVE_MESSAGE } from '../lib/bhCampaignCouponExclusive'
import { bhUpstreamFetch } from './bhWebapi.client'
import { couponsService } from './coupons.service'
import {
  bindDesktopLicenseRenewalToken,
  resolveDesktopLicenseRenewalToken,
} from './desktopLicenseRenewal.service'
import { readBhPublicProduct } from './bhWebapi.client'
import { ensureBilirkisiHesapCatalogProduct } from './ensureBilirkisiHesapProduct.service'
import { getPublicBankTransferDisplay, getBankTransferCustomerInfo } from './bankTransferSettings.service'
import { resolveBilirkisiDesktopPurchase } from './woontegraLicenseServer.client'

function allocateOrderNo(): string {
  const t = Date.now().toString(36).toUpperCase()
  const r = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `WTBD-${t}${r}`
}

function kurusToTryDecimal(kurus: number): Prisma.Decimal {
  return new Prisma.Decimal((Math.round(kurus) / 100).toFixed(2))
}

async function previousDesktopBarCampaignCode(customerEmail: string | null | undefined): Promise<string | null> {
  const email = customerEmail?.trim().toLowerCase() || ''
  if (!email) return null
  const previous = await prisma.order.findFirst({
    where: {
      customerEmail: { equals: email, mode: 'insensitive' },
      status: { in: ['PAID', 'PROCESSING'] },
      bhCampaignPublicCode: { not: null },
      items: { some: { downloadUrl: 'license:BILIRKISI_DESKTOP' } },
    },
    orderBy: { createdAt: 'desc' },
    select: { bhCampaignPublicCode: true },
  })
  const code = previous?.bhCampaignPublicCode?.trim() || ''
  return code || null
}

async function readDesktopCampaignRate(input: {
  purpose: 'NEW' | 'RENEWAL'
  campaignPublicCode?: string | null
  barAssociationKey?: string | null
}) {
  const code = input.campaignPublicCode?.trim() || ''
  const barKey = input.barAssociationKey?.trim() || ''
  if (input.purpose === 'NEW' && !code) return { discountRate: 0, campaign: null as Record<string, unknown> | null }
  if (input.purpose === 'RENEWAL' && !code && !barKey) {
    return { discountRate: 0, campaign: null as Record<string, unknown> | null }
  }
  const result = await bhUpstreamFetch(
    'POST',
    '/api/campaigns/desktop-discount',
    {
      purpose: input.purpose,
      campaignPublicCode: code || undefined,
      barAssociationKey: barKey || undefined,
    },
    { timeoutMs: 20_000 },
  )
  if (!result.ok) {
    const err = new Error('Kampanya oranı doğrulanamadı') as Error & { status: number }
    err.status = 503
    throw err
  }
  const data = (result.data || {}) as { discountRate?: unknown; campaign?: Record<string, unknown> | null }
  const rate = Number(data.discountRate)
  return {
    discountRate: Number.isFinite(rate) && rate > 0 ? rate : 0,
    campaign: data.campaign ?? null,
  }
}

function desktopYearlyOffer(productData: unknown, platform: 'WINDOWS' | 'MACOS') {
  return (
    selectDesktopYearlyOffer(productData, platform) ??
    selectDesktopYearlyOffer(
      {
        windowsPriceYearly: BH_DESKTOP_YEARLY_PRICE_KURUS,
        macosPriceYearly: BH_DESKTOP_YEARLY_PRICE_KURUS,
        windowsLicenseDays: BH_DESKTOP_LICENSE_DAYS,
        macosLicenseDays: BH_DESKTOP_LICENSE_DAYS,
        windowsDeviceLimit: BH_DESKTOP_MAX_DEVICES,
        macosDeviceLimit: BH_DESKTOP_MAX_DEVICES,
      },
      platform,
    )
  )
}

async function applyDesktopCommercialPrice<T extends { priceKurus: number; platform: 'WINDOWS' | 'MACOS' }>(
  quote: T,
  input: {
    purpose: 'NEW' | 'RENEWAL'
    campaignPublicCode?: string | null
    barAssociationKey?: string | null
    couponCode?: string | null
    customerEmail?: string | null
  },
) {
  const listTl = quote.priceKurus / 100
  let campaignPublicCode = input.campaignPublicCode
  let barAssociationKey = input.barAssociationKey
  if (input.purpose === 'RENEWAL' && !campaignPublicCode?.trim() && !barAssociationKey?.trim()) {
    campaignPublicCode = await previousDesktopBarCampaignCode(input.customerEmail)
  }
  const campaign = await readDesktopCampaignRate({
    purpose: input.purpose,
    campaignPublicCode,
    barAssociationKey,
  })
  const requestedCoupon = input.couponCode?.trim() || ''
  if (requestedCoupon && campaign.discountRate > 0) {
    const err = new Error(CAMPAIGN_COUPON_EXCLUSIVE_MESSAGE) as Error & { status: number }
    err.status = 400
    throw err
  }
  let couponPercent: number | null = null
  let couponQuote: Awaited<ReturnType<typeof couponsService.quoteCouponForPricedLines>> | null = null
  if (requestedCoupon) {
    const catalog = await ensureBilirkisiHesapCatalogProduct()
    couponQuote = await couponsService.quoteCouponForPricedLines({
      code: requestedCoupon,
      customerEmail: input.customerEmail,
      lines: [{ productId: catalog.id, quantity: 1, unitPrice: listTl }],
    })
    if (couponQuote.discountType === 'percent') couponPercent = couponQuote.discountValue
  }
  const charged = chargeBhDesktop({
    listTl,
    campaignDiscountRate: campaign.discountRate,
    couponPercent,
    couponRequested: Boolean(requestedCoupon),
  })
  if (!charged.ok) {
    const err = new Error(charged.message) as Error & { status: number }
    err.status = 400
    throw err
  }
  const totalTl = couponQuote && campaign.discountRate <= 0 ? couponQuote.total : charged.charge.totalTl
  return {
    quote: {
      ...quote,
      priceKurus: Math.round(totalTl * 100),
      normalPriceKurus: quote.priceKurus,
      campaign: campaign.campaign,
    },
    couponQuote,
    campaignRate: campaign.discountRate,
  }
}

export async function loadDesktopPurchaseQuote(input: {
  purchaseToken?: string | null
  platform?: 'WINDOWS' | 'MACOS' | null
  campaignPublicCode?: string | null
  barAssociationKey?: string | null
  couponCode?: string | null
  customerEmail?: string | null
  purpose?: 'NEW' | 'RENEWAL'
}) {
  const product = await readBhPublicProduct()
  if (!product.ok) {
    const err = new Error('Masaüstü fiyatı alınamadı') as Error & { status: number }
    err.status = 503
    throw err
  }
  const token = input.purchaseToken?.trim() || ''
  if (token) {
    if (!isOpaqueDesktopPurchaseToken(token)) {
      const err = new Error('Satın alma bağlantısı geçersiz') as Error & { status: number }
      err.status = 400
      throw err
    }
    const resolved = await resolveBilirkisiDesktopPurchase(token)
    if (!resolved.ok || resolved.data.success !== true) {
      const err = new Error(
        typeof resolved.data.error === 'string' ? resolved.data.error : 'Satın alma bağlantısı doğrulanamadı',
      ) as Error & { status: number }
      err.status = resolved.status || 400
      throw err
    }
    const platform = resolved.data.platform === 'MACOS' ? 'MACOS' : resolved.data.platform === 'WINDOWS' ? 'WINDOWS' : null
    if (!platform) {
      const err = new Error('Satın alma platformu doğrulanamadı') as Error & { status: number }
      err.status = 400
      throw err
    }
    const offer = desktopYearlyOffer(product.data, platform)
    const quote = offer ? publicDesktopPurchaseQuote(resolved.data, offer) : null
    if (!quote) {
      const err = new Error('Masaüstü yıllık fiyatı bulunamadı') as Error & { status: number }
      err.status = 409
      throw err
    }
    const priced = await applyDesktopCommercialPrice(quote, { ...input, purpose: input.purpose ?? 'NEW' })
    return { ...priced, tokenHash: hashDesktopPurchaseToken(token), renewalToken: null as string | null }
  }

  const platform = input.platform
  if (platform !== 'WINDOWS' && platform !== 'MACOS') {
    const err = new Error('Platform seçilmedi') as Error & { status: number }
    err.status = 400
    throw err
  }
  const offer = desktopYearlyOffer(product.data, platform)
  if (!offer) {
    const err = new Error('Masaüstü yıllık fiyatı bulunamadı') as Error & { status: number }
    err.status = 409
    throw err
  }
  const priced = await applyDesktopCommercialPrice(
    {
      product: 'BILIRKISI_DESKTOP' as const,
      platform,
      period: 'yearly' as const,
      purpose: input.purpose === 'RENEWAL' ? ('RENEWAL' as const) : ('FIRST_PURCHASE' as const),
      fromTrial: false,
      priceKurus: offer.priceKurus,
      licenseDays: offer.licenseDays,
      maxDevices: offer.maxDevices,
    },
    { ...input, purpose: input.purpose ?? 'NEW' },
  )
  return { ...priced, tokenHash: null as string | null, renewalToken: null as string | null }
}

export async function createBhDesktopFirstPurchaseOrder(input: {
  req: Request
  customerId: string
  customerEmail: string
  customerName: string
  customerPhone?: string | null
  purchaseToken?: string | null
  renewalToken?: string | null
  platform?: 'WINDOWS' | 'MACOS' | null
  campaignPublicCode?: string | null
  couponCode?: string | null
  billingInfo: Record<string, unknown>
  checkoutIdempotencyKey?: string | null
  paymentProvider?: 'PAYTR' | 'BANK_TRANSFER'
}) {
  const email = input.customerEmail.trim().toLowerCase()
  const idem = input.checkoutIdempotencyKey?.trim() || null
  if (idem) {
    const existing = await prisma.order.findUnique({ where: { checkoutIdempotencyKey: idem } })
    if (
      existing &&
      (existing.desktopLicensePurchaseContext === BILIRKISI_DESKTOP_FIRST_PURCHASE_CONTEXT ||
        existing.desktopLicensePurchaseContext === DESKTOP_LICENSE_PURCHASE_CONTEXT_RENEWAL)
    ) {
      return {
        orderId: existing.id,
        orderNo: existing.orderNo,
        totalTl: Number(existing.total),
        platform: existing.desktopPurchasePlatform,
      }
    }
  }

  const renewalToken = input.renewalToken?.trim() || ''
  let renewalView: Awaited<ReturnType<typeof resolveDesktopLicenseRenewalToken>> | null = null
  if (renewalToken) {
    if (input.purchaseToken?.trim()) {
      const err = new Error('Yenileme ve ilk satın alma aynı siparişte birleşmez.') as Error & { status: number }
      err.status = 400
      throw err
    }
    renewalView = await resolveDesktopLicenseRenewalToken(renewalToken)
    if (renewalView.productCode !== 'BILIRKISI_DESKTOP') {
      const err = new Error('Bu yenileme bağlantısı Bilirkişi Desktop lisansı için değil.') as Error & { status: number }
      err.status = 400
      throw err
    }
  }
  const loaded = await loadDesktopPurchaseQuote({
    purchaseToken: renewalView ? null : input.purchaseToken,
    platform: input.platform,
    campaignPublicCode: input.campaignPublicCode,
    couponCode: input.couponCode,
    customerEmail: email,
    purpose: renewalView ? 'RENEWAL' : 'NEW',
  })
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
  const total = kurusToTryDecimal(loaded.quote.priceKurus)
  const billing = input.billingInfo
  const corporate = String(billing.invoiceType || '').toLowerCase() === 'corporate'
  const order = await prisma.order.create({
    data: {
      orderNo: allocateOrderNo(),
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
      status: 'PENDING',
      paymentProvider,
      subtotal: total,
      total,
      currency: 'TRY',
      acceptedIp: getClientIp(input.req) || null,
      acceptedUserAgent: String(input.req.headers['user-agent'] || '').slice(0, 500) || null,
      preInfoAcceptedAt: new Date(),
      distanceSalesAcceptedAt: new Date(),
      kvkkReadAt: new Date(),
      softwareLicenseAcceptedAt: new Date(),
      saasSubscriptionAcceptedAt: new Date(),
      digitalServiceWaiverAcceptedAt: new Date(),
      legalCartProductTypes: String(ProductType.DOWNLOAD),
      checkoutIdempotencyKey: idem,
      desktopLicensePurchaseContext: renewalView
        ? DESKTOP_LICENSE_PURCHASE_CONTEXT_RENEWAL
        : BILIRKISI_DESKTOP_FIRST_PURCHASE_CONTEXT,
      desktopLicenseSessionId: renewalView ? null : loaded.tokenHash,
      desktopPurchasePlatform: loaded.quote.platform,
      couponCodeSnapshot: loaded.couponQuote?.code ?? null,
      couponCampaignSlugSnapshot: loaded.couponQuote?.couponId ?? null,
      couponCampaignNameSnapshot: loaded.couponQuote?.couponName ?? null,
      couponDiscountTypeSnapshot: loaded.couponQuote?.discountType ?? null,
      couponDiscountValueSnapshot: loaded.couponQuote
        ? new Prisma.Decimal(loaded.couponQuote.discountValue.toFixed(2))
        : null,
      couponDiscountAmount: loaded.couponQuote
        ? new Prisma.Decimal(loaded.couponQuote.discountAmount.toFixed(2))
        : null,
      campaignDiscountRateSnapshot: Math.round(loaded.campaignRate),
      bhCampaignPublicCode:
        loaded.quote.campaign && typeof loaded.quote.campaign.publicCode === 'string'
          ? loaded.quote.campaign.publicCode
          : input.campaignPublicCode?.trim() || null,
      bhPurchaseContext: null,
      bhSaleRef: null,
      items: {
        create: [
          {
            productId: product.id,
            productName: 'Bilirkişi Hesap Masaüstü',
            productSlug: product.slug,
            unitPrice: total,
            quantity: 1,
            total,
            downloadUrl: 'license:BILIRKISI_DESKTOP',
          },
        ],
      },
    },
  })

  if (renewalToken) {
    await bindDesktopLicenseRenewalToken({ renewalToken, externalOrderId: order.orderNo })
  }

  let amountFormatted: string | undefined
  let bankTransfer: Record<string, string> | undefined
  if (paymentProvider === PaymentProvider.BANK_TRANSFER && bankDisplay) {
    const info = await getBankTransferCustomerInfo(
      { orderNo: order.orderNo, total: Number(order.total), currency: order.currency },
      bankDisplay,
    )
    if (info) {
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
  }

  return {
    orderId: order.id,
    orderNo: order.orderNo,
    totalTl: Number(order.total),
    platform: loaded.quote.platform,
    quote: loaded.quote,
    amountFormatted,
    bankTransfer,
  }
}
