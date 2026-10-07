import { selectBhDesktopInstallerUrl } from '../lib/bhDesktopTrialDownload'
import { buildResendDeliveryMailLines, deliveryResendBlockReason } from '../lib/resendDeliveryEmail'
import { prisma } from '../lib/prisma'
import { bhUpstreamFetch, readBhAdminProductRow } from './bhWebapi.client'
import { mailService } from './mail.service'

const RESEND_LOCK_MS = 60_000

export class ResendDeliveryEmailError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function currentBhInstallerUrl(platform: 'WINDOWS' | 'MACOS'): Promise<string | null> {
  const product = await readBhAdminProductRow()
  const localProduct = await bhUpstreamFetch('GET', '/api/product')
  const localRow =
    localProduct.ok && localProduct.data && typeof localProduct.data === 'object'
      ? (((localProduct.data as { data?: unknown }).data as Record<string, unknown> | null) ?? null)
      : null
  return selectBhDesktopInstallerUrl(localRow, platform) || selectBhDesktopInstallerUrl(product, platform)
}

async function loadOrder(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        orderBy: { id: 'asc' },
        include: {
          product: { select: { productType: true, slug: true } },
        },
      },
      licenses: { select: { orderItemId: true, licenseKey: true } },
      paymentTransactions: { select: { status: true } },
    },
  })
}

export async function resendPaidDeliveryEmail(orderId: string): Promise<{
  sentAt: string
  resendCount: number
  customerEmail: string
}> {
  const order = await loadOrder(orderId)
  if (!order) throw new ResendDeliveryEmailError(404, 'Sipariş bulunamadı')

  const hasSuccessfulPayment = order.paymentTransactions.some((row) => row.status === 'SUCCESS')
  const block = deliveryResendBlockReason({
    status: order.status,
    paymentConfirmedAt: order.paymentConfirmedAt,
    hasSuccessfulPayment,
  })
  if (block) throw new ResendDeliveryEmailError(400, block)

  const needsWindows = order.items.some(
    (item) => (item.downloadUrl ?? '').trim() === 'license:BILIRKISI_DESKTOP' && (order.desktopPurchasePlatform ?? '').toUpperCase() === 'WINDOWS',
  )
  const needsMacos = order.items.some(
    (item) => (item.downloadUrl ?? '').trim() === 'license:BILIRKISI_DESKTOP' && (order.desktopPurchasePlatform ?? '').toUpperCase() === 'MACOS',
  )
  const installers = {
    windows: needsWindows ? await currentBhInstallerUrl('WINDOWS') : null,
    macos: needsMacos ? await currentBhInstallerUrl('MACOS') : null,
  }

  const membershipIds = order.items.map((item) => item.saasMembershipId).filter((id): id is string => Boolean(id))
  const firstOrderIds = order.items.map((item) => `${order.orderNo}:${item.id}`)
  const memberships =
    membershipIds.length > 0 || order.items.some((item) => (item.downloadUrl ?? '').startsWith('saas:') || item.product?.productType === 'SAAS')
      ? await prisma.customerSaasMembership.findMany({
          where: {
            OR: [
              { firstOrderId: { in: firstOrderIds } },
              ...(membershipIds.length > 0 ? [{ id: { in: membershipIds } }] : []),
            ],
          },
        })
      : []

  const built = buildResendDeliveryMailLines(
    {
      status: order.status,
      orderNo: order.orderNo,
      customerEmail: order.customerEmail,
      desktopPurchasePlatform: order.desktopPurchasePlatform,
      desktopLicenseNewEndDate: order.desktopLicenseNewEndDate,
      paymentConfirmedAt: order.paymentConfirmedAt,
      hasSuccessfulPayment,
      items: order.items.map((item) => ({
        id: item.id,
        productName: item.productName,
        productId: item.productId,
        downloadUrl: item.downloadUrl,
        productType: item.product?.productType ?? null,
        productSlug: item.product?.slug ?? null,
        licenseServerLicenseKey: item.licenseServerLicenseKey,
        licenseServerActivationPasswordPending: item.licenseServerActivationPasswordPending,
        saasMembershipId: item.saasMembershipId,
      })),
      memberships: memberships.map((row) => ({
        id: row.id,
        firstOrderId: row.firstOrderId,
        licenseKey: row.licenseKey,
        ownerEmail: row.ownerEmail,
        tenantSlug: row.tenantSlug,
        licenseStartDate: row.licenseStartDate,
        licenseEndDate: row.licenseEndDate,
      })),
      licenses: order.licenses.map((row) => ({
        orderItemId: row.orderItemId,
        licenseKey: row.licenseKey,
      })),
    },
    installers,
  )
  if (!built.ok) throw new ResendDeliveryEmailError(400, built.message)

  const claimed = await prisma.order.updateMany({
    where: {
      id: orderId,
      OR: [
        { deliveryEmailResendLockAt: null },
        { deliveryEmailResendLockAt: { lt: new Date(Date.now() - RESEND_LOCK_MS) } },
      ],
    },
    data: { deliveryEmailResendLockAt: new Date() },
  })
  if (claimed.count !== 1) {
    throw new ResendDeliveryEmailError(409, 'Bu sipariş için e-posta gönderimi zaten sürüyor. Lütfen kısa süre sonra tekrar deneyin.')
  }

  let mailed = false
  try {
    const sent = await mailService.sendPaidDownloadOrder({
      orderId: order.id,
      customerName: order.customerName,
      customerEmail: order.customerEmail.trim(),
      orderNo: order.orderNo,
      lines: built.lines,
    })
    if (!sent) {
      throw new ResendDeliveryEmailError(502, 'Teslimat e-postası gönderilemedi.')
    }
    mailed = true
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryEmailResentAt: new Date(),
        deliveryEmailResendCount: { increment: 1 },
        deliveryEmailResendLockAt: null,
      },
      select: { deliveryEmailResentAt: true, deliveryEmailResendCount: true, customerEmail: true },
    })
    return {
      sentAt: updated.deliveryEmailResentAt?.toISOString() ?? new Date().toISOString(),
      resendCount: updated.deliveryEmailResendCount,
      customerEmail: updated.customerEmail,
    }
  } catch (error) {
    if (!mailed) {
      await prisma.order
        .update({ where: { id: orderId }, data: { deliveryEmailResendLockAt: null } })
        .catch(() => undefined)
    }
    if (error instanceof ResendDeliveryEmailError) throw error
    const message = error instanceof Error && error.message.trim() ? error.message.trim() : 'E-posta sunucusu yanıt vermedi.'
    throw new ResendDeliveryEmailError(
      502,
      mailed
        ? 'E-posta gönderildi ancak gönderim kaydı yazılamadı. Kısa süre içinde yeniden denemeyin.'
        : `Teslimat e-postası gönderilemedi: ${message}`,
    )
  }
}
