/**
 * Saf (DB’siz) komisyon değerlendirme — birim testler production’a yazmaz.
 */

import { isAffiliateCommissionEligibleForProduct } from './affiliateCommissionMatch'
import { isAffiliateSelfReferral } from './affiliateCheckoutResolve'
import {
  commissionAmountFromMatrahKurus,
  exclusiveMatrahFromInclusiveKurus,
  resolveVatInclusiveRatePercent,
  tlToKurus,
} from './affiliateVatPricing'

export const AFFILIATE_COMMISSION_STATUS = {
  EARNED: 'EARNED',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  REVERSED: 'REVERSED',
} as const

export const AFFILIATE_SALE_TYPE = {
  FIRST_SALE: 'FIRST_SALE',
  RENEWAL: 'RENEWAL',
} as const

export type AffiliateCommissionEvalOrder = {
  id: string
  orderNo: string
  status: string
  customerEmail: string
  customerPhone?: string | null
  currency?: string | null
  affiliateLinkId?: string | null
  affiliateCustomerDiscountRate?: number | null
  campaignDiscountRateSnapshot?: number | null
  effectiveCustomerDiscountRate?: number | null
  desktopLicensePurchaseContext?: string | null
  mkSaasPurchaseContext?: string | null
  items: Array<{
    productId?: string | null
    productName: string
    total: number | string
    quantity: number
    saasMembershipId?: string | null
    saasRenewalDays?: number | null
    productType?: string | null
  }>
}

export type AffiliateCommissionEvalLink = {
  id: string
  partnerId: string
  productId: string
  customerDiscountRate: number
  commissionRatePercent: number
  partner: { email?: string | null; phone?: string | null; isActive: boolean }
  product: { id: string; name: string; isActive: boolean }
}

export type AffiliateCommissionCreatePayload = {
  orderId: string
  orderNo: string
  partnerId: string
  linkId: string
  productId: string
  productNameSnapshot: string
  saleType: string
  productType: string | null
  subscriptionPeriod: number | null
  currency: string
  grossPaidAmountKurus: number
  affiliateCustomerDiscountRateSnapshot: number
  campaignDiscountRateSnapshot: number
  effectiveCustomerDiscountRateSnapshot: number
  vatRateSnapshot: number
  commissionBaseAmountKurus: number
  commissionRateSnapshot: number
  commissionAmountKurus: number
  status: string
}

export type AffiliateCommissionEvaluation =
  | { action: 'skip'; reason: string; commissionId?: string }
  | { action: 'create'; data: AffiliateCommissionCreatePayload }

export function saleTypeFromOrderFields(order: AffiliateCommissionEvalOrder): string {
  if (order.desktopLicensePurchaseContext === 'DESKTOP_LICENSE_RENEWAL') {
    return AFFILIATE_SALE_TYPE.RENEWAL
  }
  if (order.items.some((i) => i.saasMembershipId || (i.saasRenewalDays != null && i.saasRenewalDays > 0))) {
    return AFFILIATE_SALE_TYPE.RENEWAL
  }
  if (order.mkSaasPurchaseContext && /RENEW|YENILE/i.test(order.mkSaasPurchaseContext)) {
    return AFFILIATE_SALE_TYPE.RENEWAL
  }
  return AFFILIATE_SALE_TYPE.FIRST_SALE
}

/**
 * PayTR başarı / havale onayı sonrası komisyon kararı (sahte sipariş nesnesiyle test edilir).
 */
export function evaluateAffiliateCommissionForPaidOrder(input: {
  order: AffiliateCommissionEvalOrder
  link: AffiliateCommissionEvalLink | null
  existingCommissionId?: string | null
  vatRatePercent?: number
}): AffiliateCommissionEvaluation {
  const { order, link } = input

  if (input.existingCommissionId) {
    return {
      action: 'skip',
      reason: 'already_exists',
      commissionId: input.existingCommissionId,
    }
  }

  if (order.status !== 'PAID') {
    return { action: 'skip', reason: 'order_not_paid' }
  }

  if (!order.affiliateLinkId || !link) {
    return { action: 'skip', reason: 'no_affiliate' }
  }

  if (!link.partner.isActive) {
    return { action: 'skip', reason: 'partner_inactive' }
  }

  if (
    isAffiliateSelfReferral(
      { email: link.partner.email, phone: link.partner.phone },
      { email: order.customerEmail, phone: order.customerPhone },
    )
  ) {
    return { action: 'skip', reason: 'self_referral' }
  }

  const matchingItems = order.items.filter(
    (item) =>
      item.productId && isAffiliateCommissionEligibleForProduct(link.productId, item.productId),
  )

  if (matchingItems.length === 0) {
    return { action: 'skip', reason: 'product_mismatch' }
  }

  let grossTl = 0
  for (const item of matchingItems) {
    grossTl += Number(item.total)
  }
  const grossPaidAmountKurus = tlToKurus(grossTl)
  if (!Number.isInteger(grossPaidAmountKurus) || grossPaidAmountKurus < 0) {
    throw Object.assign(new Error('Invalid affiliate gross amount'), {
      code: 'AFFILIATE_COMMISSION_INVALID_AMOUNT',
    })
  }

  const vatRateSnapshot =
    typeof input.vatRatePercent === 'number'
      ? input.vatRatePercent
      : resolveVatInclusiveRatePercent()
  const commissionBaseAmountKurus = exclusiveMatrahFromInclusiveKurus(
    grossPaidAmountKurus,
    vatRateSnapshot,
  )
  const commissionRateSnapshot = link.commissionRatePercent
  const commissionAmountKurus = commissionAmountFromMatrahKurus(
    commissionBaseAmountKurus,
    commissionRateSnapshot,
  )

  const affiliateCustomerDiscountRateSnapshot =
    order.affiliateCustomerDiscountRate ?? link.customerDiscountRate ?? 0
  const campaignDiscountRateSnapshot = order.campaignDiscountRateSnapshot ?? 0
  const effectiveCustomerDiscountRateSnapshot =
    order.effectiveCustomerDiscountRate ??
    Math.max(affiliateCustomerDiscountRateSnapshot, campaignDiscountRateSnapshot)

  return {
    action: 'create',
    data: {
      orderId: order.id,
      orderNo: order.orderNo,
      partnerId: link.partnerId,
      linkId: link.id,
      productId: link.productId,
      productNameSnapshot: matchingItems[0]?.productName || link.product.name || 'Ürün',
      saleType: saleTypeFromOrderFields(order),
      productType: matchingItems[0]?.productType ?? null,
      subscriptionPeriod: matchingItems.reduce((sum, i) => sum + (i.quantity || 0), 0) || null,
      currency: order.currency || 'TRY',
      grossPaidAmountKurus,
      affiliateCustomerDiscountRateSnapshot,
      campaignDiscountRateSnapshot,
      effectiveCustomerDiscountRateSnapshot,
      vatRateSnapshot,
      commissionBaseAmountKurus,
      commissionRateSnapshot,
      commissionAmountKurus,
      status: AFFILIATE_COMMISSION_STATUS.EARNED,
    },
  }
}

/**
 * Ödeme sonrası sıra: önce lisans/e-posta, sonra affiliate.
 * Affiliate hata verse bile önceki adımlar tamamlanmış sayılır.
 */
export async function runPaidFulfillmentThenAffiliate(hooks: {
  fulfillLicenseAndEmail: () => Promise<void>
  processAffiliate: () => Promise<void>
}): Promise<{ licenseEmailDone: boolean; affiliateError: string | null }> {
  await hooks.fulfillLicenseAndEmail()
  try {
    await hooks.processAffiliate()
    return { licenseEmailDone: true, affiliateError: null }
  } catch (err) {
    return {
      licenseEmailDone: true,
      affiliateError: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Yinelenen PayTR başarı bildirimi: ilk tamamlamada işle, sonrakinde atla. */
export function shouldProcessPaytrFirstCompletion(input: {
  paymentAlreadySuccess: boolean
  orderAlreadyPaid: boolean
}): { firstCompletion: boolean; runFulfillment: boolean } {
  if (input.paymentAlreadySuccess || input.orderAlreadyPaid) {
    return { firstCompletion: false, runFulfillment: false }
  }
  return { firstCompletion: true, runFulfillment: true }
}

/** Havale admin onayı: yalnızca PENDING → PAID geçişinde fulfillment. */
export function shouldProcessBankTransferApproval(orderStatus: string): boolean {
  return orderStatus === 'PENDING'
}
