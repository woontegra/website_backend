import { prisma } from '../lib/prisma'
import { desktopPurchaseMayCreateLicense } from '../lib/bhDesktopPurchaseQuote'
import { isBilirkisiDesktopFirstPurchaseContext } from '../lib/desktopLicensePurchaseContext'
import {
  consumeBilirkisiDesktopPurchase,
  requestWebsiteOrderLicense,
} from './woontegraLicenseServer.client'
import type { ExternalLicenseProvisionSuccess } from './license.service'

export async function ensureBilirkisiDesktopFirstPurchases(orderId: string): Promise<{
  errors: { orderItemId: string; productName: string; error: string }[]
  provisioned: ExternalLicenseProvisionSuccess[]
}> {
  const errors: { orderItemId: string; productName: string; error: string }[] = []
  const provisioned: ExternalLicenseProvisionSuccess[] = []
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  })
  if (!order || !isBilirkisiDesktopFirstPurchaseContext(order.desktopLicensePurchaseContext)) {
    return { errors, provisioned }
  }
  if (!desktopPurchaseMayCreateLicense(order.status)) return { errors, provisioned }

  const platform = order.desktopPurchasePlatform === 'MACOS' ? 'MACOS' : order.desktopPurchasePlatform === 'WINDOWS' ? 'WINDOWS' : null
  if (!platform) {
    for (const item of order.items) {
      errors.push({ orderItemId: item.id, productName: item.productName, error: 'Masaüstü platformu eksik.' })
    }
    return { errors, provisioned }
  }

  for (const item of order.items) {
    if ((item.licenseServerUnitsNotified ?? 0) >= 1 && item.licenseServerLicenseKey?.trim()) {
      provisioned.push({
        orderItemId: item.id,
        productName: item.productName,
        licenseKey: item.licenseServerLicenseKey,
        activationPassword: item.licenseServerActivationPasswordPending ?? undefined,
        downloadUrl: item.downloadUrl,
        mailSentByLicenseServer: false,
        deliveryType: 'DESKTOP',
      })
      continue
    }

    let licenseKey = ''
    let activationPassword = ''
    let error = ''
    if (order.desktopLicenseSessionId) {
      const consumed = await consumeBilirkisiDesktopPurchase({
        tokenHash: order.desktopLicenseSessionId,
        orderNo: `${order.orderNo}:${item.id}:0`,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
      })
      licenseKey = typeof consumed.data.licenseKey === 'string' ? consumed.data.licenseKey : ''
      activationPassword =
        typeof consumed.data.activationPassword === 'string' ? consumed.data.activationPassword : ''
      if (!consumed.ok || consumed.data.success !== true || !licenseKey) {
        error =
          (typeof consumed.data.error === 'string' && consumed.data.error) ||
          'Ücretli lisans oluşturulamadı'
      }
    } else {
      const created = await requestWebsiteOrderLicense({
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        appCode: 'BILIRKISI_DESKTOP',
        orderNo: `${order.orderNo}:${item.id}:0`,
        licenseDays: 365,
        maxDevices: 1,
        platform,
        downloadUrl: item.downloadUrl,
      })
      licenseKey = created.licenseKey?.trim() || ''
      activationPassword = created.activationPassword?.trim() || ''
      if (!created.success || !licenseKey) {
        error = created.error || 'Ücretli lisans oluşturulamadı'
      }
    }

    if (error || !licenseKey) {
      const message = error || 'Ücretli lisans oluşturulamadı'
      errors.push({ orderItemId: item.id, productName: item.productName, error: message })
      await prisma.orderItem.update({
        where: { id: item.id },
        data: { licenseServerLastError: message },
      })
      continue
    }

    await prisma.orderItem.update({
      where: { id: item.id },
      data: {
        licenseServerLicenseKey: licenseKey,
        licenseServerActivationPasswordPending: activationPassword || null,
        licenseServerUnitsNotified: 1,
        licenseServerLastError: null,
      },
    })
    provisioned.push({
      orderItemId: item.id,
      productName: item.productName,
      licenseKey,
      activationPassword: activationPassword || undefined,
      downloadUrl: item.downloadUrl,
      mailSentByLicenseServer: false,
      deliveryType: 'DESKTOP',
    })
  }

  return { errors, provisioned }
}
