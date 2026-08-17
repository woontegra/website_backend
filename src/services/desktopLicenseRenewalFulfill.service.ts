import { prisma } from '../lib/prisma'
import { DESKTOP_LICENSE_PURCHASE_CONTEXT_RENEWAL, isDesktopLicenseRenewalOrderContext } from '../lib/desktopLicensePurchaseContext'
import { isMuvekkilKasaDesktopCentralLicenseProduct } from '../lib/muvekkilKasaDesktopProduct'
import { fulfillDesktopLicenseRenewal } from './desktopLicenseRenewal.service'
import { isLicenseServerConfigured } from './woontegraLicenseServer.client'

export type DesktopLicenseRenewalError = {
  orderItemId: string
  productName: string
  error: string
}

export type DesktopLicenseRenewalSuccess = {
  orderItemId: string
  productName: string
  licenseStatus: 'renewed' | 'already_renewed'
  licenseKeyMasked: string
  newEndDate: string
}

function renewalDaysForItem(item: {
  quantity: number
  product?: { licenseDays: number | null } | null
}): number {
  const perUnit = Math.max(1, item.product?.licenseDays ?? 365)
  const qty = Math.max(1, item.quantity)
  return perUnit * qty
}

function isDesktopRenewalOrderItem(item: {
  product?: { slug: string | null; licenseAppCode: string | null; licenseRequired: boolean | null; productType: string } | null
  productSlug: string | null
}): boolean {
  return isMuvekkilKasaDesktopCentralLicenseProduct({
    slug: item.productSlug ?? item.product?.slug,
    licenseAppCode: item.product?.licenseAppCode,
    licenseRequired: item.product?.licenseRequired,
    productType: item.product?.productType,
  })
}

export async function ensureDesktopLicenseRenewals(orderId: string): Promise<{
  errors: DesktopLicenseRenewalError[]
  renewed: DesktopLicenseRenewalSuccess[]
}> {
  const errors: DesktopLicenseRenewalError[] = []
  const renewed: DesktopLicenseRenewalSuccess[] = []

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: {
            select: { slug: true, licenseAppCode: true, licenseRequired: true, productType: true, licenseDays: true },
          },
        },
      },
    },
  })

  if (!order) return { errors, renewed }
  if (order.status !== 'PAID' && order.status !== 'PROCESSING') return { errors, renewed }
  if (!isDesktopLicenseRenewalOrderContext(order.desktopLicensePurchaseContext)) return { errors, renewed }

  if (!isLicenseServerConfigured()) {
    for (const item of order.items.filter(isDesktopRenewalOrderItem)) {
      const err = 'Lisans sunucusu yapılandırması eksik (LICENSE_SERVER_URL / SECRET).'
      errors.push({ orderItemId: item.id, productName: item.productName, error: err })
      await prisma.orderItem.update({ where: { id: item.id }, data: { licenseServerLastError: err } })
    }
    return { errors, renewed }
  }

  let fulfilledForOrder = false
  for (const item of order.items) {
    if (!isDesktopRenewalOrderItem(item)) continue

    const already = item.licenseServerUnitsNotified ?? 0
    if (already >= 1) {
      renewed.push({
        orderItemId: item.id,
        productName: item.productName,
        licenseStatus: 'already_renewed',
        licenseKeyMasked: order.desktopLicenseKeyMasked ?? '—',
        newEndDate: order.desktopLicenseNewEndDate?.toISOString() ?? '',
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

    try {
      const renewalDays = renewalDaysForItem(item)
      const result = await fulfillDesktopLicenseRenewal({
        externalOrderId: order.orderNo,
        renewalDays,
        notes: 'Woontegra Website — masaüstü lisans yenileme',
      })

      fulfilledForOrder = true
      const newEnd = new Date(result.newExpiresAt)

      await prisma.order.update({
        where: { id: order.id },
        data: {
          desktopLicensePurchaseContext: DESKTOP_LICENSE_PURCHASE_CONTEXT_RENEWAL,
          desktopLicenseNewEndDate: newEnd,
          desktopLicensePreviousEndDate:
            order.desktopLicensePreviousEndDate ?? (result.previousExpiresAt ? new Date(result.previousExpiresAt) : null),
        },
      })

      await prisma.orderItem.update({
        where: { id: item.id },
        data: {
          licenseServerUnitsNotified: 1,
          licenseServerLastError: null,
          licenseServerLastNotifiedAt: new Date(),
        },
      })

      renewed.push({
        orderItemId: item.id,
        productName: item.productName,
        licenseStatus: result.status === 'already_renewed' ? 'already_renewed' : 'renewed',
        licenseKeyMasked: result.licenseKey,
        newEndDate: result.newExpiresAt,
      })

      console.info('[desktop-license-renewal] fulfill ok', {
        orderNo: order.orderNo,
        orderItemId: item.id,
        status: result.status,
        newEndDate: result.newExpiresAt,
      })
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      errors.push({ orderItemId: item.id, productName: item.productName, error: err })
      await prisma.orderItem.update({
        where: { id: item.id },
        data: { licenseServerLastError: err },
      })
      console.error('[desktop-license-renewal] fulfill failed', {
        orderNo: order.orderNo,
        orderItemId: item.id,
        error: err,
      })
    }
  }

  return { errors, renewed }
}
