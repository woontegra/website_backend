import type { Request } from 'express'
import { ProductType } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { getClientIp } from '../lib/clientIp'
import { resolveDownloadSourceFromRawUrl } from '../lib/downloadStream'
import { resolveMailDownloadHref } from '../lib/mailDeliveryUrl'
import { resolveOrderItemDeliveryRawUrl } from '../lib/productDeliveryUrl'
import { mailService } from './mail.service'
import {
  ensureExternalLicenseServerOrders,
  ensurePaidOrderLicenses,
  getLicenseMailEntriesByOrderItemIds,
  clearExternalLicensePendingPasswords,
  type ExternalLicenseProvisionSuccess,
} from './license.service'

const paidOrderDeliveryItemInclude = {
  product: {
    select: {
      productType: true,
      licenseRequired: true,
      downloadUrl: true,
      downloadFiles: true,
      downloadMedia: { select: { url: true } },
    },
  },
} as const

export type OrderItemForDeliveryCheck = {
  id: string
  productName: string
  downloadUrl: string | null
  product: {
    productType: ProductType
    licenseRequired: boolean
    downloadUrl: string | null
    downloadFiles?: unknown
    downloadMedia: { url: string } | null
  } | null
}

export function mergeOrderItemDownloadUrl(item: OrderItemForDeliveryCheck): string {
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

export function buildPaidDownloadMailLinesFromItems(
  items: OrderItemForDeliveryCheck[],
): { id: string; productName: string; downloadUrl: string }[] {
  return items
    .map((i) => ({
      id: i.id,
      productName: i.productName,
      downloadUrl: mergeOrderItemDownloadUrl(i),
    }))
    .filter((l) => l.downloadUrl)
}

function buildMailLinesFromExternalLicenses(
  provisioned: ExternalLicenseProvisionSuccess[],
  items: OrderItemForDeliveryCheck[],
): { id: string; productName: string; downloadUrl: string; licenses: { licenseKey: string; activationPassword?: string }[] }[] {
  const itemById = new Map(items.map((i) => [i.id, i]))
  return provisioned
    .filter(
      (p) =>
        p.deliveryType !== 'SAAS' && (!p.mailSentByLicenseServer || Boolean(p.activationPassword)),
    )
    .map((p) => {
      const item = itemById.get(p.orderItemId)
      const rawDownload = item ? mergeOrderItemDownloadUrl(item) : (p.downloadUrl ?? '')
      const downloadUrl = resolveMailDownloadHref(rawDownload) ?? rawDownload.trim()
      return {
        id: p.orderItemId,
        productName: p.productName,
        downloadUrl,
        licenses: [
          {
            licenseKey: p.licenseKey!,
            ...(p.activationPassword ? { activationPassword: p.activationPassword } : {}),
          },
        ],
      }
    })
    .filter((l) => l.downloadUrl)
}

/**
 * Ödeme sonrası müşteri indirme maili gönderilebilir mi (saas hariç URL’ler çözülüyor mu, DOWNLOAD için URL var mı).
 */
export function checkOrderDownloadLinesForPaidMail(items: OrderItemForDeliveryCheck[]): boolean {
  for (const item of items) {
    const effective = mergeOrderItemDownloadUrl(item)
    if (!effective) {
      console.error('[orders] Paid digital order delivery URL missing', {
        productName: item.productName,
        reason: 'EMPTY_LINE',
      })
      return false
    }
    if (!effective.startsWith('saas:')) {
      if (!resolveDownloadSourceFromRawUrl(effective)) {
        console.error('[orders] Paid digital order delivery URL missing', {
          productName: item.productName,
          rawUrl: effective,
          reason: 'URL_NOT_RESOLVABLE_FOR_MAIL',
        })
        return false
      }
    }
  }
  return true
}

/** Havale onayı vb. öncesi: eksik/çözülemeyen teslimat varsa 400 fırlatır. */
export function assertOrderDownloadLinesResolvableForCustomerMail(items: OrderItemForDeliveryCheck[]): void {
  if (checkOrderDownloadLinesForPaidMail(items)) return
  const err = new Error(
    'Bu siparişteki dijital ürün için indirme/teslimat bağlantısı tanımlı değil. Lütfen ürün ayarlarından bağlantıyı ekleyin.',
  ) as Error & { status: number; code: string }
  err.status = 400
  err.code = 'DOWNLOAD_DELIVERY_URL_MISSING'
  throw err
}

/**
 * Sipariş PAID / PROCESSING olduktan sonra indirme + lisans bilgilendirme e-postası.
 * Merkezi lisans: sunucuda üretilir, müşteri maili website backend (Gmail) ile gider.
 */
export async function fulfillPaidOrderDelivery(orderId: string, req?: Request): Promise<void> {
  const fresh = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        orderBy: { id: 'asc' },
        include: paidOrderDeliveryItemInclude,
      },
    },
  })
  if (!fresh || (fresh.status !== 'PAID' && fresh.status !== 'PROCESSING')) return

  const items = fresh.items as unknown as OrderItemForDeliveryCheck[]

  const externalResult = fresh.downloadEmailSentAt
    ? { errors: [] as Awaited<ReturnType<typeof ensureExternalLicenseServerOrders>>['errors'], provisioned: [] as ExternalLicenseProvisionSuccess[] }
    : await ensureExternalLicenseServerOrders(fresh.id)
  if (!fresh.downloadEmailSentAt && externalResult.errors.length > 0) {
    console.error('[orders] external license server errors', {
      orderId: fresh.id,
      orderNo: fresh.orderNo,
      errors: externalResult.errors,
    })
  }

  if (!fresh.downloadEmailSentAt) {
    const itemsForLocalMail = items.filter((i) => !i.product?.licenseRequired)
    const externalMailLines = buildMailLinesFromExternalLicenses(externalResult.provisioned, items)

    const { freshPasswords } = await ensurePaidOrderLicenses(fresh.id)
    const localLinesRaw = buildPaidDownloadMailLinesFromItems(itemsForLocalMail)

    const allMailCandidates = [...externalMailLines]
    if (localLinesRaw.length > 0) {
      if (!checkOrderDownloadLinesForPaidMail(itemsForLocalMail)) {
        if (allMailCandidates.length === 0) return
      } else {
        const licenseMap = await getLicenseMailEntriesByOrderItemIds(
          fresh.id,
          localLinesRaw.map((l) => l.id),
          freshPasswords,
        )
        for (const l of localLinesRaw) {
          allMailCandidates.push({
            ...l,
            licenses: (licenseMap.get(l.id) ?? []).filter(
              (entry): entry is { licenseKey: string; activationPassword: string } =>
                Boolean(entry.licenseKey?.trim() && entry.activationPassword?.trim()),
            ),
          })
        }
      }
    }

    if (allMailCandidates.length === 0) {
      const allCentralMailSent =
        externalResult.provisioned.length > 0 &&
        externalResult.provisioned.every((p) => p.mailSentByLicenseServer)
      if (allCentralMailSent && externalResult.errors.length === 0) {
        await prisma.order.update({
          where: { id: fresh.id },
          data: { downloadEmailSentAt: new Date() },
        })
        return
      }
      if (items.some((i) => i.product?.licenseRequired) && externalResult.errors.length > 0) {
        console.error('[orders] central license delivery blocked — provision failed', {
          orderNo: fresh.orderNo,
          orderId: fresh.id,
        })
      } else if (items.length > 0) {
        console.error('[orders] Paid digital order delivery URL missing — no line URLs', {
          orderNo: fresh.orderNo,
          orderId: fresh.id,
        })
      }
      return
    }

    for (const line of allMailCandidates) {
      if (line.downloadUrl.startsWith('saas:')) continue
      const rawForSource = items.find((i) => i.id === line.id)
        ? mergeOrderItemDownloadUrl(items.find((i) => i.id === line.id)!)
        : line.downloadUrl
      if (!resolveDownloadSourceFromRawUrl(rawForSource)) {
        console.error('[orders] paid mail blocked — unresolvable download URL', {
          orderNo: fresh.orderNo,
          productName: line.productName,
        })
        return
      }
    }

    try {
      await mailService.sendPaidDownloadOrder({
        orderId: fresh.id,
        customerName: fresh.customerName,
        customerEmail: fresh.customerEmail,
        orderNo: fresh.orderNo,
        lines: allMailCandidates,
      })
      await prisma.order.update({
        where: { id: fresh.id },
        data: { downloadEmailSentAt: new Date() },
      })
      await clearExternalLicensePendingPasswords(
        fresh.id,
        externalResult.provisioned.map((p) => p.orderItemId),
      )
      await prisma.orderItem.updateMany({
        where: { orderId: fresh.id, id: { in: externalResult.provisioned.map((p) => p.orderItemId) } },
        data: { licenseServerLastError: null },
      })
    } catch (e) {
      console.error('[orders] paid mail send failed', e)
    }
  }

  const existingLogs = await prisma.downloadLog.count({ where: { orderId: fresh.id } })
  if (existingLogs === 0) {
    const first = fresh.items[0]
    const ua = req?.headers['user-agent']
    await prisma.downloadLog.create({
      data: {
        orderId: fresh.id,
        productId: first?.productId ?? null,
        customerEmail: fresh.customerEmail,
        ipAddress: req ? getClientIp(req) : null,
        userAgent: typeof ua === 'string' ? ua.slice(0, 500) : null,
      },
    })
  }
}
