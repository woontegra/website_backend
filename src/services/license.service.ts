import {
  LicenseActivationStatus,
  LicenseLifecycleStatus,
  LicenseSource,
  ProductType,
} from '@prisma/client'
import { prisma } from '../lib/prisma'
import {
  generateActivationPassword,
  hashActivationPassword,
  verifyActivationPassword,
} from '../lib/activationPassword'
import { generateLicenseKey, normalizeLicenseKeyInput } from '../lib/licenseKey'
import {
  isValidDesktopAppCode,
  PRODUCT_CODE_MUVEKKIL_KASA_DESKTOP,
  resolveProductCodeFromProduct,
} from '../lib/productCode'
import { isSingleLicenseQuantityProduct } from '../lib/productOrderValidation'
import { isValidLicenseAppCodeFormat, normalizeLicenseAppCodeInput } from '../lib/licenseAppCode'
import { requestWebsiteOrderLicense } from './woontegraLicenseServer.client'
import { resolveMailDownloadHref } from '../lib/mailDeliveryUrl'
import { resolveOrderItemDeliveryRawUrl, resolveProductDeliveryRawUrl } from '../lib/productDeliveryUrl'

function emailsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** Lisans sunucusuna gönderilecek müşteri adı — checkout alıcı adı önceliklidir. */
export function resolveOrderCustomerNameForLicense(order: {
  customerName: string
  customerEmail: string
  companyName?: string | null
  customer?: { name: string } | null
}): string {
  const checkoutName = order.customerName?.trim()
  if (checkoutName) return checkoutName
  const companyName = order.companyName?.trim()
  if (companyName) return companyName
  const accountName = order.customer?.name?.trim()
  if (accountName) return accountName
  return order.customerEmail.trim()
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + Math.max(1, months))
  return d
}

function effectiveLicenseItemQuantity(item: {
  quantity: number
  product?: { productType: ProductType; licenseRequired?: boolean } | null
}): number {
  const raw = Math.max(1, Math.min(99, item.quantity))
  const p = item.product
  if (p && isSingleLicenseQuantityProduct({ productType: p.productType, licenseRequired: p.licenseRequired })) {
    return 1
  }
  return raw
}

function effectiveItemDownloadUrl(item: {
  downloadUrl: string | null
  product: {
    productType: ProductType
    downloadUrl: string | null
    downloadFiles?: unknown
    downloadMedia: { url: string } | null
  } | null
}): string {
  return resolveOrderItemDeliveryRawUrl({
    downloadUrl: item.downloadUrl,
    product: item.product
      ? {
          downloadUrl: item.product.downloadUrl,
          downloadMedia: item.product.downloadMedia,
          downloadFiles: item.product.downloadFiles,
        }
      : null,
  })
}

export function isOrderItemEligibleForDesktopLicense(item: {
  downloadUrl: string | null
  product: {
    productType: ProductType
    licenseRequired?: boolean
    downloadUrl: string | null
    downloadMedia: { url: string } | null
  } | null
}): boolean {
  if (item.product?.licenseRequired) return false
  if (item.product?.productType === ProductType.SAAS) return false
  const url = effectiveItemDownloadUrl(item)
  if (!url || url.startsWith('saas:')) return false
  if (item.product?.productType === ProductType.DOWNLOAD) return true
  if (item.product?.productType === ProductType.SERVICE) return true
  if (!item.product) return true
  return false
}

export type CreatedLicensePassword = {
  orderItemId: string
  licenseKey: string
  activationPassword: string
}

async function uniqueLicenseKey(): Promise<string> {
  let key = generateLicenseKey()
  for (let attempt = 0; attempt < 25; attempt++) {
    const clash = await prisma.license.findUnique({ where: { licenseKey: key } })
    if (!clash) return key
    key = generateLicenseKey()
  }
  return key
}

export type ExternalLicenseProvisionError = {
  orderItemId: string
  productName: string
  error: string
}

function resolveItemDownloadUrlForLicenseServer(item: {
  downloadUrl: string | null
  product: {
    downloadUrl: string | null
    downloadFiles?: unknown
    downloadMedia: { url: string } | null
  } | null
}): string | null {
  const raw = effectiveItemDownloadUrl(item as Parameters<typeof effectiveItemDownloadUrl>[0])
  if (!raw || raw.startsWith('saas:')) return null
  return resolveMailDownloadHref(raw) ?? raw
}

function mapLicenseServerProvisionError(raw: string | undefined): string {
  if (!raw) return 'Lisans sunucusu isteği başarısız.'
  const lower = raw.toLowerCase()
  if (lower.includes('pasif program') || lower.includes('geçersiz veya pasif')) {
    return 'Lisans programı lisans sunucusunda tanımlı değil veya pasif.'
  }
  return raw
}

export type ExternalLicenseProvisionSuccess = {
  orderItemId: string
  productName: string
  licenseKey: string
  activationPassword: string
  downloadUrl: string | null
  mailSentByLicenseServer: boolean
}

/**
 * licenseRequired=true ürünler için Woontegra-Lisans-Server'a lisans üretimi bildirir.
 * Müşteri e-postası website backend (Gmail/SMTP) üzerinden gönderilir.
 */
export async function ensureExternalLicenseServerOrders(orderId: string): Promise<{
  errors: ExternalLicenseProvisionError[]
  provisioned: ExternalLicenseProvisionSuccess[]
}> {
  const errors: ExternalLicenseProvisionError[] = []
  const provisioned: ExternalLicenseProvisionSuccess[] = []
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: { select: { name: true } },
      items: {
        include: {
          product: {
            select: {
              licenseRequired: true,
              licenseAppCode: true,
              licenseDays: true,
              licenseMaxDevices: true,
              downloadUrl: true,
              downloadFiles: true,
              downloadMedia: { select: { url: true } },
            },
          },
        },
      },
    },
  })
  if (!order) return { errors, provisioned }
  if (order.status !== 'PAID' && order.status !== 'PROCESSING') return { errors, provisioned }

  const licenseCustomerName = resolveOrderCustomerNameForLicense(order)
  const licenseCustomerEmail = order.customerEmail.trim().toLowerCase()
  const licenseCustomerPhone = order.customerPhone?.trim() || null

  for (const item of order.items) {
    const product = item.product
    if (!product?.licenseRequired) continue
    const appCode = normalizeLicenseAppCodeInput(product.licenseAppCode)
    if (!appCode || !isValidLicenseAppCodeFormat(appCode)) {
      const err = 'Geçersiz veya eksik lisans program kodu (licenseAppCode).'
      errors.push({ orderItemId: item.id, productName: item.productName, error: err })
      await prisma.orderItem.update({
        where: { id: item.id },
        data: { licenseServerLastError: err },
      })
      continue
    }

    const qty = 1
    const already = item.licenseServerUnitsNotified ?? 0
    const downloadUrl = resolveItemDownloadUrlForLicenseServer(item)
    const licenseDays = Math.max(1, product.licenseDays ?? 365)
    const maxDevices = Math.max(1, product.licenseMaxDevices ?? 1)

    const pushProvisioned = (
      licenseKey: string,
      activationPassword: string,
      mailSentByLicenseServer: boolean,
    ) => {
      provisioned.push({
        orderItemId: item.id,
        productName: item.productName,
        licenseKey: licenseKey.trim(),
        activationPassword: activationPassword.trim(),
        downloadUrl,
        mailSentByLicenseServer,
      })
    }

    if (already >= qty) {
      const storedKey = item.licenseServerLicenseKey?.trim()
      const storedPassword = item.licenseServerActivationPasswordPending?.trim()
      if (storedKey && storedPassword) {
        pushProvisioned(storedKey, storedPassword, false)
        continue
      }

      const externalOrderNo = `${order.orderNo}:${item.id}:${qty - 1}`
      const resend = await requestWebsiteOrderLicense({
        customerName: licenseCustomerName,
        customerEmail: licenseCustomerEmail,
        customerPhone: licenseCustomerPhone,
        appCode,
        orderNo: externalOrderNo,
        downloadUrl,
        licenseDays,
        maxDevices,
        resendCredentials: true,
      })

      if (!resend.success || !resend.licenseKey?.trim() || !resend.activationPassword?.trim()) {
        const err = resend.error ?? 'Lisans maili için kimlik bilgileri alınamadı.'
        errors.push({ orderItemId: item.id, productName: item.productName, error: err })
        await prisma.orderItem.update({
          where: { id: item.id },
          data: { licenseServerLastError: err },
        })
        console.error('[license-server] mail credentials resend failed', {
          orderNo: order.orderNo,
          orderItemId: item.id,
          appCode,
          error: err,
        })
        continue
      }

      await prisma.orderItem.update({
        where: { id: item.id },
        data: {
          licenseServerLicenseKey: resend.licenseKey.trim(),
          licenseServerActivationPasswordPending: resend.activationPassword.trim(),
          licenseServerLastError: resend.mailError ?? null,
        },
      })

      pushProvisioned(resend.licenseKey, resend.activationPassword, resend.mailSent === true)
      continue
    }

    for (let u = already; u < qty; u++) {
      const externalOrderNo = `${order.orderNo}:${item.id}:${u}`
      const result = await requestWebsiteOrderLicense({
        customerName: licenseCustomerName,
        customerEmail: licenseCustomerEmail,
        customerPhone: licenseCustomerPhone,
        appCode,
        orderNo: externalOrderNo,
        downloadUrl,
        licenseDays,
        maxDevices,
      })

      if (!result.success || !result.licenseKey?.trim()) {
        const err = mapLicenseServerProvisionError(result.error)
        errors.push({ orderItemId: item.id, productName: item.productName, error: err })
        await prisma.orderItem.update({
          where: { id: item.id },
          data: { licenseServerLastError: err },
        })
        console.error('[license-server] provision failed', {
          orderId,
          orderNo: order.orderNo,
          orderItemId: item.id,
          unit: u,
          appCode,
          error: err,
        })
        break
      }

      const activationPassword = result.activationPassword?.trim() ?? ''
      const mailSentByLicenseServer = result.mailSent === true

      await prisma.orderItem.update({
        where: { id: item.id },
        data: {
          licenseServerUnitsNotified: u + 1,
          licenseServerLastError: result.mailError ?? null,
          licenseServerLastNotifiedAt: new Date(),
          licenseServerLicenseKey: result.licenseKey.trim(),
          licenseServerActivationPasswordPending: activationPassword || null,
        },
      })

      pushProvisioned(result.licenseKey, activationPassword, mailSentByLicenseServer)

      console.info('[license-server] provision ok', {
        orderNo: order.orderNo,
        externalOrderNo,
        appCode,
        mailSentByLicenseServer,
        hasActivationPassword: Boolean(activationPassword),
      })
    }
  }

  return { errors, provisioned }
}

/** Lisans maili gönderildikten sonra geçici aktivasyon şifresini temizler. */
export async function clearExternalLicensePendingPasswords(
  orderId: string,
  orderItemIds: string[],
): Promise<void> {
  const ids = [...new Set(orderItemIds.filter(Boolean))]
  if (ids.length === 0) return
  await prisma.orderItem.updateMany({
    where: { orderId, id: { in: ids } },
    data: { licenseServerActivationPasswordPending: null },
  })
}

/** PAID / PROCESSING siparişte indirilebilir satırlar için lisans üretir (idempotent). */
export async function ensurePaidOrderLicenses(orderId: string): Promise<{
  freshPasswords: CreatedLicensePassword[]
}> {
  const freshPasswords: CreatedLicensePassword[] = []
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: {
            select: {
              productType: true,
              slug: true,
              licenseMonths: true,
              licenseRequired: true,
              downloadUrl: true,
              downloadMedia: { select: { url: true } },
            },
          },
        },
      },
    },
  })
  if (!order) return { freshPasswords }
  if (order.status !== 'PAID' && order.status !== 'PROCESSING') return { freshPasswords }

  const startsAt = new Date()

  for (const item of order.items) {
    if (!isOrderItemEligibleForDesktopLicense(item)) continue
    if (item.product?.licenseRequired) continue
    const qty = effectiveLicenseItemQuantity(item)
    const licenseMonths = Math.max(1, item.product?.licenseMonths ?? 12)
    const expiresAt = addMonths(startsAt, licenseMonths)
    const productCode = item.product
      ? resolveProductCodeFromProduct({ slug: item.product.slug, productType: item.product.productType })
      : null

    for (let u = 0; u < qty; u++) {
      const exists = await prisma.license.findUnique({
        where: { orderItemId_unitIndex: { orderItemId: item.id, unitIndex: u } },
      })
      if (exists) continue

      const key = await uniqueLicenseKey()
      const activationPassword = generateActivationPassword()
      const activationPasswordHash = await hashActivationPassword(activationPassword)

      await prisma.license.create({
        data: {
          licenseKey: key,
          activationPasswordHash,
          orderId: order.id,
          orderNo: order.orderNo,
          orderItemId: item.id,
          unitIndex: u,
          customerId: order.customerId,
          customerName: order.customerName.trim(),
          customerEmail: order.customerEmail.trim().toLowerCase(),
          customerPhone: order.customerPhone?.trim() || null,
          productId: item.productId,
          productName: item.productName,
          productCode,
          source: LicenseSource.WEBSITE_ORDER,
          status: LicenseLifecycleStatus.ACTIVE,
          maxDevices: 1,
          startsAt,
          expiresAt,
        },
      })

      freshPasswords.push({ orderItemId: item.id, licenseKey: key, activationPassword })
    }
  }

  return { freshPasswords }
}

export type LicenseMailEntry = {
  licenseKey: string
  activationPassword?: string
}

export async function getLicenseMailEntriesByOrderItemIds(
  orderId: string,
  orderItemIds: string[],
  freshPasswords: CreatedLicensePassword[],
): Promise<Map<string, LicenseMailEntry[]>> {
  const m = new Map<string, LicenseMailEntry[]>()
  if (orderItemIds.length === 0) return m

  const passwordByKey = new Map<string, string>()
  for (const fp of freshPasswords) {
    passwordByKey.set(fp.licenseKey, fp.activationPassword)
  }

  const rows = await prisma.license.findMany({
    where: { orderId, orderItemId: { in: orderItemIds } },
    orderBy: [{ orderItemId: 'asc' }, { unitIndex: 'asc' }],
    select: { orderItemId: true, licenseKey: true },
  })

  for (const r of rows) {
    if (!r.orderItemId) continue
    const arr = m.get(r.orderItemId) ?? []
    arr.push({
      licenseKey: r.licenseKey,
      activationPassword: passwordByKey.get(r.licenseKey),
    })
    m.set(r.orderItemId, arr)
  }
  return m
}

/** @deprecated use getLicenseMailEntriesByOrderItemIds */
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
    if (!r.orderItemId) continue
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

function licenseExpired(license: { expiresAt: Date | null }): boolean {
  return Boolean(license.expiresAt && license.expiresAt.getTime() < Date.now())
}

async function verifyLicenseCredentials(
  license: { activationPasswordHash: string | null; customerEmail: string },
  activationPassword?: string | null,
  customerEmail?: string | null,
): Promise<boolean> {
  if (license.activationPasswordHash) {
    if (!activationPassword?.trim()) return false
    return verifyActivationPassword(activationPassword, license.activationPasswordHash)
  }
  if (customerEmail?.trim()) {
    return emailsMatch(license.customerEmail, customerEmail)
  }
  return false
}

export async function activateLicenseForDevice(input: {
  licenseKey: string
  activationPassword?: string | null
  customerEmail?: string | null
  deviceHash: string
  appCode?: string | null
  deviceName?: string | null
  platform?: string | null
  appVersion?: string | null
}): Promise<LicensePublicOk | LicensePublicErr> {
  const licenseKey = normalizeLicenseKeyInput(input.licenseKey)
  const deviceHash = input.deviceHash.trim()
  if (!licenseKey || deviceHash.length < 16 || deviceHash.length > 256) {
    return { ok: false, message: 'Lisans kodu geçersiz.' }
  }

  const license = await prisma.license.findUnique({ where: { licenseKey } })
  if (!license) {
    return { ok: false, message: 'Lisans kodu geçersiz.' }
  }

  if (license.productCode === PRODUCT_CODE_MUVEKKIL_KASA_DESKTOP) {
    if (!isValidDesktopAppCode(input.appCode)) {
      return { ok: false, message: 'Lisans kodu geçersiz.' }
    }
  }

  const credOk = await verifyLicenseCredentials(
    license,
    input.activationPassword,
    input.customerEmail,
  )
  if (!credOk) {
    return { ok: false, message: 'Lisans kodu veya aktivasyon şifresi geçersiz.' }
  }

  if (license.status === LicenseLifecycleStatus.DISABLED) {
    return { ok: false, message: 'Lisans pasif durumda. Destek ile iletişime geçin.' }
  }
  if (license.status === LicenseLifecycleStatus.EXPIRED || licenseExpired(license)) {
    return { ok: false, message: 'Lisans süresi dolmuş. Yenileme için destek ile iletişime geçin.' }
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
  appCode?: string | null
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

  if (license.productCode === PRODUCT_CODE_MUVEKKIL_KASA_DESKTOP) {
    if (!isValidDesktopAppCode(input.appCode)) {
      return { ok: false, message: 'Lisans kodu geçersiz.' }
    }
  }

  if (license.status !== LicenseLifecycleStatus.ACTIVE) {
    return { ok: false, message: 'Lisans pasif durumda. Destek ile iletişime geçin.' }
  }
  if (licenseExpired(license)) {
    return { ok: false, message: 'Lisans süresi dolmuş. Yenileme için destek ile iletişime geçin.' }
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

export async function adminExtendLicense(licenseId: string, expiresAt: Date): Promise<void> {
  await prisma.license.update({
    where: { id: licenseId },
    data: { expiresAt, status: LicenseLifecycleStatus.ACTIVE },
  })
}

export async function adminRegenerateActivationPassword(licenseId: string): Promise<{
  activationPassword: string
}> {
  const activationPassword = generateActivationPassword()
  const activationPasswordHash = await hashActivationPassword(activationPassword)
  await prisma.license.update({
    where: { id: licenseId },
    data: { activationPasswordHash },
  })
  return { activationPassword }
}

export async function resolveLicenseDownloadUrl(license: {
  productId: string | null
  productCode: string | null
}): Promise<string | null> {
  if (license.productId) {
    const p = await prisma.product.findUnique({
      where: { id: license.productId },
      select: { downloadUrl: true, downloadFiles: true, downloadMedia: { select: { url: true } } },
    })
    if (p) {
      const url = resolveProductDeliveryRawUrl(p)
      if (url) return url
    }
  }
  if (license.productCode === PRODUCT_CODE_MUVEKKIL_KASA_DESKTOP) {
    const p = await prisma.product.findFirst({
      where: { slug: 'muvekkil-kasa-defteri-yazilimi' },
      select: { downloadUrl: true, downloadFiles: true, downloadMedia: { select: { url: true } } },
    })
    if (p) {
      return resolveProductDeliveryRawUrl(p) || null
    }
    const legacy = await prisma.product.findFirst({
      where: { slug: 'muvekkil-kasa-defteri-desktop' },
      select: { downloadUrl: true, downloadFiles: true, downloadMedia: { select: { url: true } } },
    })
    if (legacy) {
      return resolveProductDeliveryRawUrl(legacy) || null
    }
  }
  return process.env.DESKTOP_DOWNLOAD_URL?.trim() || null
}
