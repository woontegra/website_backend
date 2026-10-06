import { PaymentProvider, Prisma, ProductType } from '@prisma/client'
import type { Request } from 'express'
import { prisma } from '../lib/prisma'
import { getClientIp } from '../lib/clientIp'
import { selectDesktopYearlyOffer } from '../lib/bhDesktopYearlyOffer'
import {
  hashDesktopPurchaseToken,
  isOpaqueDesktopPurchaseToken,
  publicDesktopPurchaseQuote,
} from '../lib/bhDesktopPurchaseQuote'
import { BILIRKISI_DESKTOP_FIRST_PURCHASE_CONTEXT } from '../lib/desktopLicensePurchaseContext'
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

export async function loadDesktopPurchaseQuote(input: {
  purchaseToken?: string | null
  platform?: 'WINDOWS' | 'MACOS' | null
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
    const offer = selectDesktopYearlyOffer(product.data, platform)
    const quote = offer ? publicDesktopPurchaseQuote(resolved.data, offer) : null
    if (!quote) {
      const err = new Error('Masaüstü yıllık fiyatı bulunamadı') as Error & { status: number }
      err.status = 409
      throw err
    }
    return { quote, tokenHash: hashDesktopPurchaseToken(token) }
  }

  const platform = input.platform
  if (platform !== 'WINDOWS' && platform !== 'MACOS') {
    const err = new Error('Platform seçilmedi') as Error & { status: number }
    err.status = 400
    throw err
  }
  const offer = selectDesktopYearlyOffer(product.data, platform)
  if (!offer) {
    const err = new Error('Masaüstü yıllık fiyatı bulunamadı') as Error & { status: number }
    err.status = 409
    throw err
  }
  return {
    quote: {
      product: 'BILIRKISI_DESKTOP' as const,
      platform,
      period: 'yearly' as const,
      purpose: 'FIRST_PURCHASE' as const,
      fromTrial: false,
      priceKurus: offer.priceKurus,
      licenseDays: offer.licenseDays,
      maxDevices: offer.maxDevices,
    },
    tokenHash: null as string | null,
  }
}

export async function createBhDesktopFirstPurchaseOrder(input: {
  req: Request
  customerId: string
  customerEmail: string
  customerName: string
  customerPhone?: string | null
  purchaseToken?: string | null
  platform?: 'WINDOWS' | 'MACOS' | null
  billingInfo: Record<string, unknown>
  checkoutIdempotencyKey?: string | null
  paymentProvider?: 'PAYTR' | 'BANK_TRANSFER'
}) {
  const email = input.customerEmail.trim().toLowerCase()
  const idem = input.checkoutIdempotencyKey?.trim() || null
  if (idem) {
    const existing = await prisma.order.findUnique({ where: { checkoutIdempotencyKey: idem } })
    if (existing && existing.desktopLicensePurchaseContext === BILIRKISI_DESKTOP_FIRST_PURCHASE_CONTEXT) {
      return {
        orderId: existing.id,
        orderNo: existing.orderNo,
        totalTl: Number(existing.total),
        platform: existing.desktopPurchasePlatform,
      }
    }
  }

  const loaded = await loadDesktopPurchaseQuote({
    purchaseToken: input.purchaseToken,
    platform: input.platform,
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
      desktopLicensePurchaseContext: BILIRKISI_DESKTOP_FIRST_PURCHASE_CONTEXT,
      desktopLicenseSessionId: loaded.tokenHash,
      desktopPurchasePlatform: loaded.quote.platform,
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
