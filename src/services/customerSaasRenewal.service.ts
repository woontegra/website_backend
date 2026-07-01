import { CustomerSaasMembershipStatus, PaymentProvider, Prisma, ProductType } from '@prisma/client'
import { prisma } from '../lib/prisma'
import {
  formatLegalCartProductTypes,
  orderLegalConsentErrorMessage,
  resolveOrderLegalConsentFlags,
  uniqueCartProductTypes,
  validateOrderLegalConsents,
} from '../lib/orderLegalRequirements'
import { MUVEKKIL_KASA_SAAS_PRODUCT_CODE } from '../lib/muvekkilKasaSaasProduct'
import {
  ANNUAL_SAAS_RENEWAL_PERIOD,
  assertAnnualSaasRenewalPeriod,
  renewalDaysForPeriod,
  renewalPeriodLabel,
  renewalPriceForPeriod,
  type SaasRenewalPeriod,
} from '../lib/saasRenewalPeriod'
import { getBankTransferCustomerInfo, getPublicBankTransferDisplay } from './bankTransferSettings.service'
import { mailService } from './mail.service'
import { campaignsService } from './campaigns.service'

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

async function allocateOrderNo(): Promise<string> {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, '0')
  const prefix = `WNT-${y}${m}${day}-`
  const last = await prisma.order.findFirst({
    where: { orderNo: { startsWith: prefix } },
    orderBy: { orderNo: 'desc' },
    select: { orderNo: true },
  })
  let seq = 1
  if (last?.orderNo) {
    const tail = last.orderNo.slice(prefix.length)
    const n = parseInt(tail, 10)
    if (Number.isFinite(n)) seq = n + 1
  }
  return `${prefix}${String(seq).padStart(6, '0')}`
}

async function loadMembershipForCustomer(customerId: string, membershipId: string) {
  const membership = await prisma.customerSaasMembership.findFirst({
    where: { id: membershipId.trim(), customerId },
    include: {
      product: { select: { id: true, name: true, slug: true, price: true, currency: true, productType: true } },
    },
  })
  if (!membership) {
    const err = new Error('Üyelik bulunamadı.') as Error & { status: number }
    err.status = 404
    throw err
  }
  if (membership.productCode !== MUVEKKIL_KASA_SAAS_PRODUCT_CODE) {
    const err = new Error('Bu üyelik yenilenemez.') as Error & { status: number }
    err.status = 400
    throw err
  }
  if (!membership.productId || !membership.product) {
    const err = new Error('Ürün bilgisi eksik; yenileme siparişi oluşturulamadı.') as Error & { status: number }
    err.status = 400
    throw err
  }
  const renewableStatuses: CustomerSaasMembershipStatus[] = [
    CustomerSaasMembershipStatus.ACTIVE,
    CustomerSaasMembershipStatus.EXPIRED,
  ]
  if (!renewableStatuses.includes(membership.status)) {
    const err = new Error('Bu üyelik şu anda uzatılamaz.') as Error & { status: number }
    err.status = 400
    throw err
  }
  return membership
}

async function resolveRenewalPricing(productId: string, period: SaasRenewalPeriod) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, slug: true, price: true, currency: true, categoryId: true, productType: true, purchaseEnabled: true },
  })
  if (!product) throw new Error('Ürün bulunamadı')
  const { unitPrice } = await campaignsService.resolveProductUnitPrice({
    id: product.id,
    categoryId: product.categoryId,
    productType: product.productType,
    price: Number(product.price),
    purchaseEnabled: product.purchaseEnabled,
  })
  const renewalDays = renewalDaysForPeriod(period)
  const total = renewalPriceForPeriod(unitPrice, period)
  return { product, unitPrice: total, renewalDays, currency: (product.currency || 'TRY').trim() || 'TRY' }
}

export type SaasRenewQuote = {
  membershipId: string
  renewalPeriod: SaasRenewalPeriod
  renewalDays: number
  renewalLabel: string
  productName: string
  lineLabel: string
  total: number
  currency: string
}

export async function getSaasRenewQuote(
  customerId: string,
  membershipId: string,
  renewalPeriodRaw: string,
): Promise<SaasRenewQuote> {
  const period = assertAnnualSaasRenewalPeriod(renewalPeriodRaw)
  const membership = await loadMembershipForCustomer(customerId, membershipId)
  const { product, unitPrice, renewalDays, currency } = await resolveRenewalPricing(membership.productId!, period)
  const renewalLabel = renewalPeriodLabel(period)
  const lineLabel = `${product.name} — 1 Yıllık Uzatma`
  return {
    membershipId: membership.id,
    renewalPeriod: period,
    renewalDays,
    renewalLabel,
    productName: product.name,
    lineLabel,
    total: unitPrice,
    currency,
  }
}

export type CreateSaasRenewOrderInput = {
  customerId: string
  membershipId: string
  renewalPeriod: string
  paymentProvider?: 'PAYTR' | 'BANK_TRANSFER'
  acceptPreInfo: boolean
  acceptDistanceSales: boolean
  acceptKvkk: boolean
  acceptSaasSubscription: boolean
  acceptDigitalServiceWaiver: boolean
  acceptedIp?: string | null
  acceptedUserAgent?: string | null
}

export async function createSaasRenewOrder(input: CreateSaasRenewOrderInput) {
  const renewalPeriod = assertAnnualSaasRenewalPeriod(input.renewalPeriod)

  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    include: {
      addresses: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })
  if (!customer) {
    const err = new Error('Müşteri hesabı bulunamadı.') as Error & { status: number }
    err.status = 404
    throw err
  }

  const membership = await loadMembershipForCustomer(input.customerId, input.membershipId)
  const quote = await getSaasRenewQuote(input.customerId, membership.id, renewalPeriod)
  const { product, renewalDays } = await resolveRenewalPricing(membership.productId!, renewalPeriod)

  const cartProductTypes = [ProductType.SAAS]
  const legalFlags = resolveOrderLegalConsentFlags(cartProductTypes)
  if (
    !validateOrderLegalConsents(legalFlags, {
      acceptPreInfo: input.acceptPreInfo,
      acceptDistanceSales: input.acceptDistanceSales,
      acceptKvkk: input.acceptKvkk,
      acceptSoftwareLicense: false,
      acceptSaasSubscription: input.acceptSaasSubscription,
      acceptDigitalProductWaiver: false,
      acceptDigitalServiceWaiver: input.acceptDigitalServiceWaiver,
    })
  ) {
    const err = new Error(orderLegalConsentErrorMessage(legalFlags)) as Error & { status: number }
    err.status = 400
    throw err
  }

  const paymentProvider =
    input.paymentProvider === 'BANK_TRANSFER' ? PaymentProvider.BANK_TRANSFER : PaymentProvider.PAYTR

  if (paymentProvider === PaymentProvider.BANK_TRANSFER) {
    const bankPub = await getPublicBankTransferDisplay()
    if (!bankPub.bankTransferEnabled) {
      const err = new Error('Havale/EFT ödeme yöntemi şu anda kullanılamıyor.') as Error & { status: number }
      err.status = 400
      throw err
    }
  }

  const addr = customer.addresses[0]
  const total = new Prisma.Decimal(quote.total)
  const unit = new Prisma.Decimal(quote.total)
  const currency = quote.currency
  const now = new Date()
  const lineName = quote.lineLabel
  const downloadUrl = `saas:${product.slug}`

  for (let attempt = 0; attempt < 20; attempt++) {
    const orderNo = await allocateOrderNo()
    try {
      const order = await prisma.order.create({
        data: {
          orderNo,
          customerId: customer.id,
          customerName: customer.name,
          customerEmail: customer.email,
          customerPhone: customer.phone,
          billingType: addr?.companyName ? 'Kurumsal' : 'Bireysel',
          taxOffice: addr?.taxOffice,
          taxNumber: addr?.taxNumber,
          companyName: addr?.companyName,
          paymentProvider,
          subtotal: total,
          total,
          currency,
          preInfoAcceptedAt: now,
          distanceSalesAcceptedAt: now,
          kvkkReadAt: now,
          saasSubscriptionAcceptedAt: legalFlags.needsSaasSubscription && input.acceptSaasSubscription ? now : null,
          digitalServiceWaiverAcceptedAt:
            legalFlags.needsDigitalServiceWaiver && input.acceptDigitalServiceWaiver ? now : null,
          legalCartProductTypes: formatLegalCartProductTypes(cartProductTypes),
          acceptedIp: input.acceptedIp?.trim() || null,
          acceptedUserAgent: input.acceptedUserAgent?.trim()?.slice(0, 500) || null,
          items: {
            create: [
              {
                productId: product.id,
                productName: lineName,
                productSlug: product.slug,
                unitPrice: unit,
                quantity: 1,
                total,
                downloadUrl,
                saasMembershipId: membership.id,
                saasRenewalDays: renewalDays,
              },
            ],
          },
        },
        include: { items: true },
      })

      if (paymentProvider === PaymentProvider.BANK_TRANSFER) {
        const info = await getBankTransferCustomerInfo({
          orderNo: order.orderNo,
          total: Number(order.total),
          currency: order.currency,
        })
        if (info) {
          try {
            await mailService.sendBankTransferOrderCreated({
              customerName: order.customerName,
              customerEmail: order.customerEmail,
              info,
            })
          } catch (e) {
            console.error('[saas-renew] Havale bilgilendirme e-postası gönderilemedi', e)
          }
        }
      }

      try {
        await mailService.sendNewOrderAdminNotification({
          orderNo: order.orderNo,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          customerPhone: order.customerPhone,
          total: Number(order.total),
          currency: order.currency,
          paymentProvider: order.paymentProvider,
          items: order.items.map((i) => ({
            productName: i.productName,
            quantity: i.quantity,
            total: Number(i.total),
          })),
        })
      } catch (e) {
        console.error('[saas-renew] Admin bildirimi gönderilemedi', e)
      }

      return {
        id: order.id,
        orderNo: order.orderNo,
        total: Number(order.total),
        currency: order.currency,
        paymentProvider: order.paymentProvider,
        renewalPeriod,
        renewalDays,
        renewalLabel: quote.renewalLabel,
        productName: quote.productName,
        membershipId: membership.id,
      }
    } catch (e) {
      if (isUniqueViolation(e)) continue
      throw e
    }
  }

  const err = new Error('Sipariş numarası oluşturulamadı') as Error & { status: number }
  err.status = 500
  throw err
}
