import type { Request } from 'express'
import { ProductType } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { getClientIp } from '../lib/clientIp'
import { resolveMailDownloadHref } from '../lib/mailDeliveryUrl'
import { mailService } from './mail.service'
import { ensureExternalLicenseServerOrders, ensurePaidOrderLicenses, getLicenseMailEntriesByOrderItemIds } from './license.service'

const paidOrderDeliveryItemInclude = {
  product: {
    select: {
      productType: true,
      licenseRequired: true,
      downloadUrl: true,
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
    downloadMedia: { url: string } | null
  } | null
}

export function mergeOrderItemDownloadUrl(item: OrderItemForDeliveryCheck): string {
  const fromLine = (item.downloadUrl ?? '').trim()
  const fromProduct =
    (item.product?.downloadUrl?.trim() || item.product?.downloadMedia?.url?.trim() || '').trim() || ''
  return fromLine || fromProduct
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

/**
 * Ödeme sonrası müşteri indirme maili gönderilebilir mi (saas hariç URL’ler çözülüyor mu, DOWNLOAD için URL var mı).
 * Başarısızlıkta ayrıntı yalnızca sunucu günlüğüne yazılır; müşteri mesajı üretilmez.
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
      if (!resolveMailDownloadHref(effective)) {
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

/** Havale onayı vb. öncesi: eksik/çözülemeyen teslimat varsa 400 fırlatır (mesaj müşteriye gitmez). */
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
 * Sipariş PAID / PROCESSING olduktan sonra indirme bilgilendirme e-postası ve log.
 * PayTR callback ve admin havale onayı aynı yolu kullanır.
 * Teslimat URL’leri müşteri maili için uygun değilse mail gönderilmez (yalnızca log).
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

  const externalResult = await ensureExternalLicenseServerOrders(fresh.id)
  if (externalResult.errors.length > 0) {
    console.error('[orders] external license server errors', {
      orderId: fresh.id,
      orderNo: fresh.orderNo,
      errors: externalResult.errors,
    })
  }

  /** Merkezi lisans sunucusu mail gönderir; website mailinde bu satırlar yer almaz */
  const itemsForWebsiteMail = items.filter((i) => !i.product?.licenseRequired)

  if (!fresh.downloadEmailSentAt) {
    const { freshPasswords } = await ensurePaidOrderLicenses(fresh.id)
    const linesRaw = buildPaidDownloadMailLinesFromItems(itemsForWebsiteMail)
    if (linesRaw.length > 0) {
      if (!checkOrderDownloadLinesForPaidMail(itemsForWebsiteMail)) {
        return
      }
      const licenseMap = await getLicenseMailEntriesByOrderItemIds(
        fresh.id,
        linesRaw.map((l) => l.id),
        freshPasswords,
      )
      const lines = linesRaw.map((l) => ({
        ...l,
        licenses: licenseMap.get(l.id) ?? [],
      }))
      try {
        await mailService.sendPaidDownloadOrder({
          customerName: fresh.customerName,
          customerEmail: fresh.customerEmail,
          orderNo: fresh.orderNo,
          lines,
        })
        await prisma.order.update({
          where: { id: fresh.id },
          data: { downloadEmailSentAt: new Date() },
        })
      } catch (e) {
        console.error('[orders] paid mail send failed', e)
      }
    } else if (itemsForWebsiteMail.length === 0 && items.some((i) => i.product?.licenseRequired)) {
      console.info('[orders] paid download mail skipped — license server handles delivery', {
        orderNo: fresh.orderNo,
        orderId: fresh.id,
      })
    } else {
      console.error('[orders] Paid digital order delivery URL missing — no line URLs', {
        orderNo: fresh.orderNo,
        orderId: fresh.id,
      })
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
