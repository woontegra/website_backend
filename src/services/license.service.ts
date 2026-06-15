import {
  LicenseActivationStatus,
  LicenseLifecycleStatus,
  ProductType,
} from '@prisma/client'
import { prisma } from '../lib/prisma'
import { generateLicenseKey, normalizeLicenseKeyInput } from '../lib/licenseKey'

function emailsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** orderFulfillment.mergeOrderItemDownloadUrl ile aynı mantık (döngüsel import yok). */
function effectiveItemDownloadUrl(item: {
  downloadUrl: string | null
  product: {
    productType: ProductType
    downloadUrl: string | null
    downloadMedia: { url: string } | null
  } | null
}): string {
  const fromLine = (item.downloadUrl ?? '').trim()
  const fromProduct =
    (item.product?.downloadUrl?.trim() || item.product?.downloadMedia?.url?.trim() || '').trim() || ''
  return fromLine || fromProduct
}

export function isOrderItemEligibleForDesktopLicense(item: {
  downloadUrl: string | null
  product: {
    productType: ProductType
    downloadUrl: string | null
    downloadMedia: { url: string } | null
  } | null
}): boolean {
  if (item.product?.productType === ProductType.SAAS) return false
  const url = effectiveItemDownloadUrl(item)
  if (!url || url.startsWith('saas:')) return false
  if (item.product?.productType === ProductType.DOWNLOAD) return true
  if (item.product?.productType === ProductType.SERVICE) return true
  if (!item.product) return true
  return false
}

/** PAID / PROCESSING siparişte indirilebilir satırlar için lisans üretir (idempotent). */
export async function ensurePaidOrderLicenses(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: {
            select: {
              productType: true,
              downloadUrl: true,
              downloadMedia: { select: { url: true } },
            },
          },
        },
      },
    },
  })
  if (!order) return
  if (order.status !== 'PAID' && order.status !== 'PROCESSING') return

  for (const item of order.items) {
    if (!isOrderItemEligibleForDesktopLicense(item)) continue
    const qty = Math.max(1, Math.min(99, item.quantity))
    for (let u = 0; u < qty; u++) {
      const exists = await prisma.license.findUnique({
        where: { orderItemId_unitIndex: { orderItemId: item.id, unitIndex: u } },
      })
      if (exists) continue
      let key = generateLicenseKey()
      for (let attempt = 0; attempt < 25; attempt++) {
        const clash = await prisma.license.findUnique({ where: { licenseKey: key } })
        if (!clash) break
        key = generateLicenseKey()
      }
      await prisma.license.create({
        data: {
          licenseKey: key,
          orderId: order.id,
          orderNo: order.orderNo,
          orderItemId: item.id,
          unitIndex: u,
          customerId: order.customerId,
          customerEmail: order.customerEmail.trim().toLowerCase(),
          productId: item.productId,
          productName: item.productName,
          status: LicenseLifecycleStatus.ACTIVE,
          maxDevices: 1,
        },
      })
    }
  }
}

export async function getLicenseKeysByOrderItemIds(
  orderId: string,
  orderItemIds: string[],
): Promise<Map<string, string[]>> {
  const m = new Map<string, string[]>()
  if (orderItemIds.length === 0) return m
  const rows = await prisma.license.findMany({
    where: { orderId, orderItemId: { in: orderItemIds } },
    orderBy: [{ orderItemId: 'asc' }, { unitIndex: 'asc' }],
    select: { orderItemId: true, licenseKey: true },
  })
  for (const r of rows) {
    const arr = m.get(r.orderItemId) ?? []
    arr.push(r.licenseKey)
    m.set(r.orderItemId, arr)
  }
  return m
}

export type LicensePublicOk = {
  ok: true
  licenseStatus: string
  productName: string
  expiresAt: string | null
  maxDevices: number
  activatedDevicesCount: number
  message: string
}

export type LicensePublicErr = {
  ok: false
  message: string
}

function okPayload(
  license: { status: LicenseLifecycleStatus; productName: string; expiresAt: Date | null; maxDevices: number },
  activatedCount: number,
  message: string,
): LicensePublicOk {
  return {
    ok: true,
    licenseStatus: license.status,
    productName: license.productName,
    expiresAt: license.expiresAt?.toISOString() ?? null,
    maxDevices: license.maxDevices,
    activatedDevicesCount: activatedCount,
    message,
  }
}

export async function activateLicenseForDevice(input: {
  licenseKey: string
  customerEmail: string
  deviceHash: string
  deviceName?: string | null
  platform?: string | null
  appVersion?: string | null
}): Promise<LicensePublicOk | LicensePublicErr> {
  const licenseKey = normalizeLicenseKeyInput(input.licenseKey)
  const customerEmail = input.customerEmail.trim()
  const deviceHash = input.deviceHash.trim()
  if (!licenseKey || !customerEmail || deviceHash.length < 16 || deviceHash.length > 256) {
    return { ok: false, message: 'Lisans kodu geçersiz.' }
  }

  const license = await prisma.license.findUnique({ where: { licenseKey } })
  if (!license || !emailsMatch(license.customerEmail, customerEmail)) {
    return { ok: false, message: 'Lisans kodu geçersiz.' }
  }

  if (license.status === LicenseLifecycleStatus.DISABLED) {
    return { ok: false, message: 'Lisans pasif durumda. Destek ile iletişime geçin.' }
  }
  if (license.status === LicenseLifecycleStatus.EXPIRED) {
    return { ok: false, message: 'Lisans kodu geçersiz.' }
  }
  if (license.expiresAt && license.expiresAt.getTime() < Date.now()) {
    return { ok: false, message: 'Lisans kodu geçersiz.' }
  }

  const activeActs = await prisma.licenseActivation.findMany({
    where: { licenseId: license.id, status: LicenseActivationStatus.ACTIVE },
  })

  const sameDevice = activeActs.find((a) => a.deviceHash === deviceHash)
  if (sameDevice) {
    await prisma.licenseActivation.update({
      where: { id: sameDevice.id },
      data: {
        lastValidatedAt: new Date(),
        appVersion: input.appVersion?.trim().slice(0, 80) ?? sameDevice.appVersion,
      },
    })
    return okPayload(license, activeActs.length, 'Lisansınız başarıyla aktifleştirildi.')
  }

  if (activeActs.length >= license.maxDevices) {
    return {
      ok: false,
      message: 'Bu lisans başka bir cihazda aktif. Bilgisayar değiştirdiyseniz destek ile iletişime geçin.',
    }
  }

  await prisma.licenseActivation.create({
    data: {
      licenseId: license.id,
      deviceHash,
      deviceName: input.deviceName?.trim().slice(0, 200) || null,
      platform: input.platform?.trim().slice(0, 120) || null,
      appVersion: input.appVersion?.trim().slice(0, 80) || null,
      status: LicenseActivationStatus.ACTIVE,
    },
  })

  return okPayload(license, activeActs.length + 1, 'Lisansınız başarıyla aktifleştirildi.')
}

export async function validateLicenseForDevice(input: {
  licenseKey: string
  deviceHash: string
  appVersion?: string | null
}): Promise<LicensePublicOk | LicensePublicErr> {
  const licenseKey = normalizeLicenseKeyInput(input.licenseKey)
  const deviceHash = input.deviceHash.trim()
  if (!licenseKey || deviceHash.length < 16) {
    return { ok: false, message: 'Lisans kodu geçersiz.' }
  }

  const license = await prisma.license.findUnique({ where: { licenseKey } })
  if (!license) {
    return { ok: false, message: 'Lisans kodu geçersiz.' }
  }
  if (license.status !== LicenseLifecycleStatus.ACTIVE) {
    return { ok: false, message: 'Lisans pasif durumda. Destek ile iletişime geçin.' }
  }
  if (license.expiresAt && license.expiresAt.getTime() < Date.now()) {
    return { ok: false, message: 'Lisans kodu geçersiz.' }
  }

  const act = await prisma.licenseActivation.findFirst({
    where: {
      licenseId: license.id,
      deviceHash,
      status: LicenseActivationStatus.ACTIVE,
    },
  })
  if (!act) {
    return {
      ok: false,
      message: 'Bu lisans başka bir cihazda aktif. Bilgisayar değiştirdiyseniz destek ile iletişime geçin.',
    }
  }

  await prisma.licenseActivation.update({
    where: { id: act.id },
    data: {
      lastValidatedAt: new Date(),
      appVersion: input.appVersion?.trim().slice(0, 80) ?? act.appVersion,
    },
  })

  const count = await prisma.licenseActivation.count({
    where: { licenseId: license.id, status: LicenseActivationStatus.ACTIVE },
  })

  return okPayload(license, count, 'Lisans doğrulandı.')
}

export async function adminSetLicenseStatus(licenseId: string, status: LicenseLifecycleStatus): Promise<void> {
  await prisma.license.update({
    where: { id: licenseId },
    data: { status },
  })
}

export async function adminResetLicenseActivations(licenseId: string): Promise<void> {
  await prisma.licenseActivation.deleteMany({ where: { licenseId } })
}

export async function adminSetLicenseMaxDevices(licenseId: string, maxDevices: number): Promise<void> {
  const m = Math.max(1, Math.min(50, Math.floor(maxDevices)))
  await prisma.license.update({
    where: { id: licenseId },
    data: { maxDevices: m },
  })
}
