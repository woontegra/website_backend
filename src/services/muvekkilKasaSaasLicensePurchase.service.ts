import { prisma } from '../lib/prisma'

import { MUVEKKIL_KASA_SAAS_PRODUCT_CODE } from '../lib/muvekkilKasaSaasProduct'

import { resolveMuvekkilKasaSaasLoginHref } from '../lib/mailDownloadLink'

import {
  isMkSaasLicensePurchaseConfigured,
  requestMkSaasLicensePurchaseFulfill,
} from './mkSaasLicensePurchase.client'

import { isMkSaasExistingAccountOrderContext, MK_SAAS_PURCHASE_CONTEXT_RENEWAL } from '../lib/mkSaasPurchaseContext'
import { isOrderItemMuvekkilKasaSaas } from './muvekkilKasaSaasProvision.service'

export type MuvekkilKasaSaasLicensePurchaseError = {
  orderItemId: string
  productName: string
  error: string
}

export type MuvekkilKasaSaasLicensePurchaseSuccess = {
  orderItemId: string
  productName: string
  licenseStatus: 'licensed' | 'already_licensed'
  tenantId: string
  tenantSlug: string
  licenseKey: string | null
  newEndDate: string
}

const FULFILL_NOTES_RENEWAL = 'Woontegra Website — mevcut hesap lisans yenileme'
const FULFILL_NOTES_DEMO = 'Woontegra Website — mevcut hesap lisanslama (demo → ücretli)'

function renewalDaysForItem(item: {
  quantity: number
  product?: { licenseDays: number | null } | null
}): number {
  const perUnit = Math.max(1, item.product?.licenseDays ?? 365)
  const qty = Math.max(1, item.quantity)
  return perUnit * qty
}

/**
 * Demo / mevcut MK SaaS hesabı lisanslama satırları (yeni tenant provision değil).
 */
export async function ensureMuvekkilKasaSaasLicensePurchases(orderId: string): Promise<{
  errors: MuvekkilKasaSaasLicensePurchaseError[]
  licensed: MuvekkilKasaSaasLicensePurchaseSuccess[]
}> {
  const errors: MuvekkilKasaSaasLicensePurchaseError[] = []
  const licensed: MuvekkilKasaSaasLicensePurchaseSuccess[] = []

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: {
            select: {
              slug: true,
              licenseAppCode: true,
              licenseDays: true,
            },
          },
        },
      },
    },
  })

  if (!order) return { errors, licensed }
  if (order.status !== 'PAID' && order.status !== 'PROCESSING') return { errors, licensed }
  if (!isMkSaasExistingAccountOrderContext(order.mkSaasPurchaseContext)) return { errors, licensed }

  const paidAt = order.paidAt ?? order.paymentConfirmedAt ?? order.bankTransferPaymentDate ?? new Date()
  let fulfilledForOrder = false

  for (const item of order.items) {
    if (!isOrderItemMuvekkilKasaSaas(item)) continue

    const already = item.licenseServerUnitsNotified ?? 0
    if (already >= 1) {
      licensed.push({
        orderItemId: item.id,
        productName: item.productName,
        licenseStatus: 'already_licensed',
        tenantId: '',
        tenantSlug: '',
        licenseKey: item.licenseServerLicenseKey,
        newEndDate: '',
      })
      continue
    }

    if (fulfilledForOrder) {
      await prisma.orderItem.update({
        where: { id: item.id },
        data: {
          licenseServerUnitsNotified: 1,
          licenseServerLastError: null,
          licenseServerLastNotifiedAt: new Date(),
        },
      })
      continue
    }

    if (!isMkSaasLicensePurchaseConfigured()) {
      const err = 'Müvekkil Kasa SaaS API yapılandırması eksik (MUVEKKIL_KASA_SAAS_API_URL / SECRET).'
      errors.push({ orderItemId: item.id, productName: item.productName, error: err })
      await prisma.orderItem.update({
        where: { id: item.id },
        data: { licenseServerLastError: err },
      })
      continue
    }

    const renewalDays = renewalDaysForItem(item)
    const fulfillNotes =
      order.mkSaasPurchaseContext === MK_SAAS_PURCHASE_CONTEXT_RENEWAL
        ? FULFILL_NOTES_RENEWAL
        : FULFILL_NOTES_DEMO
    const result = await requestMkSaasLicensePurchaseFulfill({
      externalOrderId: order.orderNo,
      renewalDays,
      externalCustomerId: order.customerId,
      billing: {
        amount: Number(item.total),
        currency: order.currency || 'TRY',
        paidAt: paidAt.toISOString(),
      },
      notes: fulfillNotes,
    })

    if (!result.success) {
      const err = result.error
      errors.push({ orderItemId: item.id, productName: item.productName, error: err })
      await prisma.orderItem.update({
        where: { id: item.id },
        data: { licenseServerLastError: err },
      })
      console.error('[mk-saas-license-purchase] fulfill failed', {
        orderNo: order.orderNo,
        orderItemId: item.id,
        status: result.status ?? null,
        error: err,
      })
      continue
    }

    fulfilledForOrder = true
    const data = result.data

    await prisma.order.update({
      where: { id: order.id },
      data: {
        mkSaasPurchaseNewEndDate: new Date(data.newEndDate),
        mkSaasPurchasePreviousEndDate: order.mkSaasPurchasePreviousEndDate ?? new Date(data.previousEndDate),
      },
    })

    await prisma.orderItem.update({
      where: { id: item.id },
      data: {
        licenseServerUnitsNotified: 1,
        licenseServerLastError: null,
        licenseServerLastNotifiedAt: new Date(),
        licenseServerLicenseKey: data.licenseKey?.trim() || null,
      },
    })

    licensed.push({
      orderItemId: item.id,
      productName: item.productName,
      licenseStatus: data.status,
      tenantId: data.tenantId,
      tenantSlug: data.tenantSlug,
      licenseKey: data.licenseKey,
      newEndDate: data.newEndDate,
    })

    console.info('[mk-saas-license-purchase] fulfill ok', {
      orderNo: order.orderNo,
      orderItemId: item.id,
      status: data.status,
      tenantId: data.tenantId,
      newEndDate: data.newEndDate,
      productCode: MUVEKKIL_KASA_SAAS_PRODUCT_CODE,
    })
  }

  return { errors, licensed }
}

export async function buildMuvekkilKasaSaasLicensePurchaseMailLines(
  items: { id: string; productName: string }[],
  licensed: MuvekkilKasaSaasLicensePurchaseSuccess[],
): Promise<
  import('./muvekkilKasaSaasProvision.service').MuvekkilKasaSaasMailLine[]
> {
  const byItemId = new Map(licensed.filter((r) => r.licenseKey?.trim()).map((r) => [r.orderItemId, r]))
  return items
    .filter((i) => byItemId.has(i.id))
    .map((i) => {
      const r = byItemId.get(i.id)!
      return {
        id: i.id,
        productName: i.productName,
        downloadUrl: 'saas:muvekkil-kasa',
        saas: {
          licenseKey: r.licenseKey ?? '',
          ownerEmail: '',
          tenantSlug: r.tenantSlug,
          tenantName: r.tenantSlug,
          licenseStartDate: '',
          licenseEndDate: r.newEndDate,
          mkActivationMailSent: true,
          ownerUsername: null,
          temporaryPassword: null,
          loginUrl: resolveMuvekkilKasaSaasLoginHref(),
          musteriNo: null,
        },
      }
    })
    .filter((line) => line.saas.licenseKey?.trim())
}
