import { createHash, randomBytes } from 'node:crypto'
import type { DesktopLicenseRenewalSession, DesktopLicenseRenewalSessionStatus } from '@prisma/client'
import { prisma } from '../lib/prisma'
import {
  addDaysFromBase,
  computeDesktopExtensionBaseDate,
  estimateDesktopRenewalEndDate,
  maskLicenseKey,
} from '../lib/desktopLicenseExtend'
import { DESKTOP_LICENSE_PURCHASE_CONTEXT_RENEWAL } from '../lib/desktopLicensePurchaseContext'
import { mkDesktopProductPath } from '../lib/muvekkilKasaDesktopProduct'
import { PRODUCT_CODE_MUVEKKIL_KASA_DESKTOP } from '../lib/productCode'
import { requestDesktopRenewalOpen, requestWebsiteRenewLicense } from './woontegraLicenseServer.client'

const TOKEN_TTL_MS = 20 * 60 * 1000
const PURPOSE = 'DESKTOP_LICENSE_RENEWAL'

export type DesktopLicenseRenewalPublicView = {
  purchaseContext: typeof DESKTOP_LICENSE_PURCHASE_CONTEXT_RENEWAL
  sessionId: string
  productCode: typeof PRODUCT_CODE_MUVEKKIL_KASA_DESKTOP
  purpose: typeof PURPOSE
  licenseId: string | null
  licenseKeyMasked: string
  customerNumber: string | null
  customerName: string | null
  licenseExpiresAt: string | null
  extensionBaseDate: string
  expiresAt: string
  status: DesktopLicenseRenewalSessionStatus
  boundExternalOrderId: string | null
}

export type DesktopLicenseRenewalPreview = {
  currentLicenseEndDate: string | null
  extensionBaseDate: string
  estimatedNewEndDate: string
  renewalDays: number
}

function hashToken(plain: string): string {
  return createHash('sha256').update(plain.trim(), 'utf8').digest('hex')
}

function hashLicenseKey(licenseKey: string): string {
  return createHash('sha256').update(licenseKey.trim().toUpperCase(), 'utf8').digest('hex')
}

function normalizeLicenseKey(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase()
}

function woontegraWebsiteBaseUrl(): string {
  const fromEnv = process.env.PUBLIC_WEBSITE_URL?.trim() || process.env.FRONTEND_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return 'https://www.woontegra.com'
}

async function publicValidateLicense(input: {
  licenseKey: string
  deviceHash: string
  appCode: string
}): Promise<{ valid: boolean; expiresAt?: string | null; message?: string }> {
  const base = (process.env.LICENSE_SERVER_URL ?? '').replace(/\/$/, '')
  if (!base) {
    return { valid: false, message: 'Lisans sunucusu yapılandırılmamış.' }
  }
  try {
    const res = await fetch(`${base}/api/public/license/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      return {
        valid: false,
        message: typeof data.message === 'string' ? data.message : 'Lisans doğrulanamadı.',
      }
    }
    return {
      valid: data.valid === true,
      expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : null,
      message: typeof data.message === 'string' ? data.message : undefined,
    }
  } catch {
    return { valid: false, message: 'Lisans sunucusuna ulaşılamadı.' }
  }
}

function toPublicView(session: DesktopLicenseRenewalSession, licenseKeyMasked: string): DesktopLicenseRenewalPublicView {
  const extensionBase = computeDesktopExtensionBaseDate(session.licenseExpiresAt)
  return {
    purchaseContext: DESKTOP_LICENSE_PURCHASE_CONTEXT_RENEWAL,
    sessionId: session.id,
    productCode: PRODUCT_CODE_MUVEKKIL_KASA_DESKTOP,
    purpose: PURPOSE,
    licenseId: session.licenseId,
    licenseKeyMasked,
    customerNumber: session.customerNumber,
    customerName: session.customerName,
    licenseExpiresAt: session.licenseExpiresAt?.toISOString() ?? null,
    extensionBaseDate: extensionBase.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    status: session.status,
    boundExternalOrderId: session.boundExternalOrderId,
  }
}

async function loadSessionByToken(renewalToken: string): Promise<DesktopLicenseRenewalSession | null> {
  const tokenHash = hashToken(renewalToken)
  const session = await prisma.desktopLicenseRenewalSession.findUnique({ where: { tokenHash } })
  if (!session) return null
  if (session.expiresAt.getTime() < Date.now()) {
    if (session.status === 'CREATED' || session.status === 'BOUND') {
      await prisma.desktopLicenseRenewalSession.update({
        where: { id: session.id },
        data: { status: 'EXPIRED' },
      })
    }
    return null
  }
  return session
}

export async function issueDesktopLicenseRenewalLink(input: {
  licenseKey: string
  deviceHash: string
  appCode: string
}): Promise<{ purchaseUrl: string; expiresAt: string }> {
  const licenseKey = normalizeLicenseKey(input.licenseKey)
  const deviceHash = input.deviceHash.trim()
  const appCode = input.appCode.trim().toUpperCase()
  if (!licenseKey || !deviceHash || !appCode) {
    throw new Error('LICENSE_RENEWAL_INVALID')
  }
  if (appCode !== PRODUCT_CODE_MUVEKKIL_KASA_DESKTOP) {
    throw new Error('LICENSE_RENEWAL_UNSUPPORTED_PRODUCT')
  }

  const validation = await publicValidateLicense({ licenseKey, deviceHash, appCode })
  if (!validation.valid) {
    throw new Error('LICENSE_RENEWAL_NOT_ELIGIBLE')
  }

  const open = await requestDesktopRenewalOpen({ licenseKey, deviceHash, appCode })
  const licenseExpiresAt = validation.expiresAt ? new Date(validation.expiresAt) : open.expiresAt ? new Date(open.expiresAt) : null

  const plainToken = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)

  await prisma.desktopLicenseRenewalSession.create({
    data: {
      tokenHash: hashToken(plainToken),
      licenseId: open.licenseId ?? null,
      licenseKeyHash: hashLicenseKey(licenseKey),
      targetLicenseKey: licenseKey,
      appCode,
      deviceHash,
      customerNumber: open.customerNumber ?? null,
      customerName: open.customerName ?? null,
      licenseExpiresAt,
      purpose: PURPOSE,
      expiresAt,
    },
  })

  const purchaseUrl = `${woontegraWebsiteBaseUrl()}${mkDesktopProductPath()}?renewalToken=${encodeURIComponent(plainToken)}`
  return { purchaseUrl, expiresAt: expiresAt.toISOString() }
}

export async function resolveDesktopLicenseRenewalToken(
  renewalToken: string,
): Promise<DesktopLicenseRenewalPublicView> {
  const session = await loadSessionByToken(renewalToken)
  if (!session || session.status === 'CONSUMED' || session.status === 'EXPIRED') {
    throw new Error('LICENSE_RENEWAL_TOKEN_INVALID')
  }
  return toPublicView(session, maskLicenseKey(session.targetLicenseKey))
}

export async function previewDesktopLicenseRenewal(input: {
  renewalToken: string
  renewalDays: number
}): Promise<DesktopLicenseRenewalPreview> {
  const session = await loadSessionByToken(input.renewalToken)
  if (!session || session.status === 'CONSUMED' || session.status === 'EXPIRED') {
    throw new Error('LICENSE_RENEWAL_TOKEN_INVALID')
  }
  const renewalDays = Math.max(1, input.renewalDays)
  const extensionBaseDate = computeDesktopExtensionBaseDate(session.licenseExpiresAt)
  const estimatedNewEndDate = estimateDesktopRenewalEndDate({
    currentExpiresAt: session.licenseExpiresAt,
    renewalDays,
  })
  return {
    currentLicenseEndDate: session.licenseExpiresAt?.toISOString() ?? null,
    extensionBaseDate: extensionBaseDate.toISOString(),
    estimatedNewEndDate: estimatedNewEndDate.toISOString(),
    renewalDays,
  }
}

export async function bindDesktopLicenseRenewalToken(input: {
  renewalToken: string
  externalOrderId: string
}): Promise<DesktopLicenseRenewalPublicView> {
  const session = await loadSessionByToken(input.renewalToken)
  if (!session) throw new Error('LICENSE_RENEWAL_TOKEN_INVALID')
  if (session.status === 'CONSUMED') throw new Error('LICENSE_RENEWAL_TOKEN_CONSUMED')
  if (session.boundExternalOrderId && session.boundExternalOrderId !== input.externalOrderId) {
    throw new Error('LICENSE_RENEWAL_TOKEN_BOUND')
  }

  const updated = await prisma.desktopLicenseRenewalSession.update({
    where: { id: session.id },
    data: {
      status: 'BOUND',
      boundExternalOrderId: input.externalOrderId,
      boundAt: new Date(),
    },
  })
  return toPublicView(updated, maskLicenseKey(updated.targetLicenseKey))
}

export async function fulfillDesktopLicenseRenewal(input: {
  externalOrderId: string
  renewalDays: number
  notes?: string
}): Promise<{
  status: 'renewed' | 'already_renewed'
  licenseKey: string
  previousExpiresAt: string
  newExpiresAt: string
}> {
  const session = await prisma.desktopLicenseRenewalSession.findFirst({
    where: { boundExternalOrderId: input.externalOrderId },
  })
  if (!session) throw new Error('DESKTOP_RENEWAL_SESSION_NOT_FOUND')
  if (session.status === 'CONSUMED') {
    const order = await prisma.order.findFirst({
      where: { orderNo: input.externalOrderId },
      select: { desktopLicenseNewEndDate: true },
    })
    return {
      status: 'already_renewed',
      licenseKey: maskLicenseKey(session.targetLicenseKey),
      previousExpiresAt: session.licenseExpiresAt?.toISOString() ?? '',
      newExpiresAt: order?.desktopLicenseNewEndDate?.toISOString() ?? '',
    }
  }
  if (session.status !== 'BOUND') throw new Error('DESKTOP_RENEWAL_SESSION_NOT_BOUND')

  const renewalDays = Math.max(1, input.renewalDays)
  const result = await requestWebsiteRenewLicense({
    orderNo: input.externalOrderId,
    licenseKey: session.targetLicenseKey,
    licenseId: session.licenseId,
    appCode: session.appCode,
    licenseDays: renewalDays,
  })
  if (!result.success) {
    throw new Error(result.error ?? 'DESKTOP_RENEWAL_FAILED')
  }

  const newExpiresAt = result.newExpiresAt ? new Date(result.newExpiresAt) : addDaysFromBase(
    computeDesktopExtensionBaseDate(session.licenseExpiresAt),
    renewalDays,
  )

  await prisma.desktopLicenseRenewalSession.update({
    where: { id: session.id },
    data: { status: 'CONSUMED', consumedAt: new Date() },
  })

  return {
    status: result.alreadyRenewed ? 'already_renewed' : 'renewed',
    licenseKey: maskLicenseKey(session.targetLicenseKey),
    previousExpiresAt: result.previousExpiresAt ?? session.licenseExpiresAt?.toISOString() ?? '',
    newExpiresAt: newExpiresAt.toISOString(),
  }
}

export { PURPOSE as DESKTOP_LICENSE_RENEWAL_PURPOSE }
