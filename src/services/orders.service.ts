import { LegalDocumentType, LicenseLifecycleStatus, OrderStatus, PaymentProvider, PaymentTransactionStatus, Prisma, ProductType } from '@prisma/client'
import { getDefaultLegalDocument } from '../data/defaultLegalContents'
import { buildSellerVars, escapeHtml } from '../lib/legalSeller'
import { prisma } from '../lib/prisma'
import { denialReasonLabel, getProductOrderDenialReason, type ProductOrderCheckRow, type ProductOrderDenial } from '../lib/productOrderValidation'
import { resolveCartProductKeys } from '../lib/resolveCartProductKeys'
import { getBankTransferCustomerInfo, getPublicBankTransferDisplay } from './bankTransferSettings.service'
import { mailService } from './mail.service'
import {
  assertOrderDownloadLinesResolvableForCustomerMail,
  buildPaidDownloadMailLinesFromItems,
  checkOrderDownloadLinesForPaidMail,
  fulfillPaidOrderDelivery,
  type OrderItemForDeliveryCheck,
} from './orderFulfillment.service'
import {
  adminResetLicenseActivations,
  adminSetLicenseMaxDevices,
  adminSetLicenseStatus,
} from './license.service'
import { renderLegalTemplate } from './legalTemplate.service'

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

export type OrderLineInput = { productId: string; quantity: number }

export type CreateOrderInput = {
  items: OrderLineInput[]
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  billingType?: string | null
  taxOffice?: string | null
  taxNumber?: string | null
  companyName?: string | null
  customerId?: string | null
  acceptPreInfo: boolean
  acceptDistanceSales: boolean
  acceptKvkk: boolean
  marketingConsent?: boolean
  explicitConsent?: boolean
  acceptedIp?: string | null
  acceptedUserAgent?: string | null
  /** Varsayılan kart (PayTR). Havale/EFT siparişinde teslimat admin onayı sonrası. */
  paymentProvider?: 'PAYTR' | 'BANK_TRANSFER'
}

/** Müşteri tarafında indirme / teslim bağlantısı gösterimi */
export function orderShowsPaidDeliveryToCustomer(status: string): boolean {
  return status === 'PAID' || status === 'PROCESSING'
}

/** Liste / müşteri paneli için ödeme satırı etiketi kaynağı */
export function resolveOrderPaymentRowStatus(order: {
  paymentProvider: PaymentProvider
  status: string
  paymentTransactions: { status: string }[]
}): string | null {
  if (order.paymentProvider === PaymentProvider.BANK_TRANSFER) {
    if (order.status === 'PAID' || order.status === 'PROCESSING') return 'SUCCESS'
    return 'WAITING_BANK_TRANSFER'
  }
  return order.paymentTransactions[0]?.status ?? null
}

async function allocateOrderNo(): Promise<string> {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, '0')
  const datePart = `${y}${m}${day}`
  const prefix = `WNT-${datePart}-`

  const last = await prisma.order.findFirst({
    where: { orderNo: { startsWith: prefix } },
    orderBy: { orderNo: 'desc' },
    select: { orderNo: true },
  })

  let next = 1
  if (last?.orderNo) {
    const suffix = last.orderNo.slice(prefix.length)
    const n = Number.parseInt(suffix, 10)
    if (Number.isFinite(n)) next = n + 1
  }

  return `${prefix}${String(next).padStart(6, '0')}`
}

function resolveDownloadUrl(p: {
  downloadUrl: string | null
  downloadMedia: { url: string } | null
}): string | null {
  const u = (p.downloadUrl?.trim() || p.downloadMedia?.url?.trim() || '') || ''
  return u === '' ? null : u
}

async function findActiveLegal(type: LegalDocumentType) {
  return prisma.legalDocument.findFirst({
    where: { type, isActive: true },
    orderBy: { updatedAt: 'desc' },
  })
}

async function resolveLegalContentForSnapshot(type: LegalDocumentType): Promise<{ title: string; content: string; version: number }> {
  const doc = await findActiveLegal(type)
  if (doc?.content?.trim()) {
    return { title: doc.title, content: doc.content, version: doc.version }
  }
  const fallback = getDefaultLegalDocument(type)
  const title = doc?.title?.trim() ? doc.title : fallback.title
  if (doc && !doc.content?.trim()) {
    console.warn(`[legal] Order snapshot: active ${type} has empty content; using default body.`)
  }
  return { title, content: fallback.content, version: doc?.version ?? 0 }
}

async function createLegalSnapshotsForOrder(
  orderId: string,
  ctx: {
    customerName: string
    customerEmail: string
    orderNo: string
    orderTotal: string
    currency: string
    productListHtml: string
    ip: string | null
    ua: string | null
    marketingConsent: boolean
    explicitConsent: boolean
  },
) {
  const existing = await prisma.orderLegalSnapshot.count({ where: { orderId } })
  if (existing > 0) return

  const vars: Record<string, string> = {
    customerName: escapeHtml(ctx.customerName),
    customerEmail: escapeHtml(ctx.customerEmail),
    orderNo: escapeHtml(ctx.orderNo),
    orderTotal: escapeHtml(ctx.orderTotal),
    currency: escapeHtml(ctx.currency),
    productList: ctx.productListHtml,
    ...Object.fromEntries(Object.entries(buildSellerVars()).map(([k, v]) => [k, escapeHtml(v)])),
  }

  const mandatory: LegalDocumentType[] = [
    LegalDocumentType.PRE_INFORMATION,
    LegalDocumentType.DISTANCE_SALES,
    LegalDocumentType.KVKK_CLARIFICATION,
  ]
  const optional: LegalDocumentType[] = []
  if (ctx.marketingConsent) optional.push(LegalDocumentType.COMMERCIAL_ELECTRONIC_MESSAGE)
  if (ctx.explicitConsent) optional.push(LegalDocumentType.EXPLICIT_CONSENT)

  const rows: Prisma.OrderLegalSnapshotCreateManyInput[] = []
  const now = new Date()

  for (const t of [...mandatory, ...optional]) {
    const base = await resolveLegalContentForSnapshot(t)
    rows.push({
      orderId,
      documentType: t,
      title: base.title,
      content: renderLegalTemplate(base.content, vars),
      version: base.version,
      acceptedAt: now,
      ipAddress: ctx.ip,
      userAgent: ctx.ua,
    })
  }

  if (rows.length) {
    await prisma.orderLegalSnapshot.createMany({ data: rows })
  }
}

function emailsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export const ordersService = {
  async createOrder(input: CreateOrderInput) {
    if (!input.acceptPreInfo || !input.acceptDistanceSales || !input.acceptKvkk) {
      const err = new Error('Yasal onaylar eksik') as Error & { status: number }
      err.status = 400
      throw err
    }

    const lines = input.items.filter((l) => l.productId && l.quantity > 0)
    if (lines.length === 0) {
      const err = new Error('Sepet boş') as Error & { status: number }
      err.status = 400
      throw err
    }

    const mergedRaw = new Map<string, number>()
    for (const l of lines) {
      const q = Math.min(99, Math.max(1, Math.floor(Number(l.quantity)) || 1))
      mergedRaw.set(l.productId.trim(), q)
    }

    const rawKeys = [...mergedRaw.keys()]
    const resolved = await resolveCartProductKeys(rawKeys)
    const unresolved = rawKeys.filter((k) => !resolved.has(k))
    if (unresolved.length > 0) {
      console.warn('[orders] createOrder bilinmeyen veya pasif ürün anahtarı', {
        unresolved,
        items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      })
      const err = new Error('ORDER_ITEMS_INVALID') as Error & {
        status: number
        publicMessage?: string
        invalidDetails?: { kind: 'unresolved'; unresolved: string[] }
      }
      err.status = 400
      err.publicMessage =
        'Sepetinizdeki bazı ürünler artık satın alınamıyor. Lütfen sepetinizi güncelleyip tekrar deneyin.'
      err.invalidDetails = { kind: 'unresolved', unresolved }
      throw err
    }

    const mergedCanonical = new Map<string, number>()
    for (const [raw, qty] of mergedRaw) {
      const cid = resolved.get(raw)!
      mergedCanonical.set(cid, (mergedCanonical.get(cid) ?? 0) + qty)
    }

    const canonicalIds = [...mergedCanonical.keys()]
    const products = await prisma.product.findMany({
      where: { id: { in: canonicalIds } },
      include: { downloadMedia: { select: { url: true } } },
    })

    const byId = new Map(products.map((p) => [p.id, p]))
    const denials: { productId: string; name: string; slug: string | null; reason: string; code: ProductOrderDenial }[] =
      []
    for (const id of canonicalIds) {
      const p = byId.get(id)
      if (!p) {
        denials.push({
          productId: id,
          name: '—',
          slug: null,
          reason: denialReasonLabel('not_found'),
          code: 'not_found',
        })
        continue
      }
      const row: ProductOrderCheckRow = {
        id: p.id,
        slug: p.slug,
        name: p.name,
        isActive: p.isActive,
        productType: p.productType,
        purchaseEnabled: p.purchaseEnabled,
        downloadUrl: p.downloadUrl,
        downloadMedia: p.downloadMedia,
      }
      const d = getProductOrderDenialReason(row)
      if (d) {
        denials.push({
          productId: p.id,
          name: p.name,
          slug: p.slug,
          reason: denialReasonLabel(d),
          code: d,
        })
      }
    }

    if (denials.length > 0) {
      console.warn('[orders] createOrder ürün doğrulama reddi', {
        denials,
        items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      })
      const downloadBlocked = denials.some((x) => x.code === 'download_missing' || x.code === 'download_unresolvable')
      const err = new Error('ORDER_ITEMS_INVALID') as Error & {
        status: number
        publicMessage?: string
        invalidDetails?: { kind: 'denied'; denials: typeof denials }
      }
      err.status = 400
      err.publicMessage = downloadBlocked
        ? 'Bu ürün şu anda satın almaya uygun değil. Lütfen daha sonra tekrar deneyin veya destek ile iletişime geçin.'
        : 'Sepetinizdeki bazı ürünler artık satın alınamıyor. Lütfen sepetinizi güncelleyip tekrar deneyin.'
      err.invalidDetails = { kind: 'denied', denials }
      throw err
    }

    const currency = (products[0].currency || 'TRY').trim() || 'TRY'
    let subtotal = new Prisma.Decimal(0)
    const lineSnapshots: {
      productId: string
      productName: string
      productSlug: string | null
      unitPrice: Prisma.Decimal
      quantity: number
      total: Prisma.Decimal
      downloadUrl: string
      productType: ProductType
    }[] = []

    for (const p of products) {
      if ((p.currency || 'TRY').trim() !== currency) {
        const err = new Error('Sepette farklı para biriminde ürün olamaz') as Error & { status: number }
        err.status = 400
        throw err
      }
      let dl: string
      if (p.productType === ProductType.SAAS || p.productType === ProductType.SERVICE) {
        dl = `saas:${p.slug}`
      } else {
        const dlResolved = resolveDownloadUrl(p)
        if (!dlResolved) {
          const err = new Error(`“${p.name}” için indirme bağlantısı tanımlı değil`) as Error & { status: number }
          err.status = 400
          throw err
        }
        dl = dlResolved
      }
      const qty = mergedCanonical.get(p.id) ?? 1
      const unit = p.price
      const lineTotal = new Prisma.Decimal(Number(unit) * qty)
      subtotal = subtotal.add(lineTotal)
      lineSnapshots.push({
        productId: p.id,
        productName: p.name,
        productSlug: p.slug,
        unitPrice: unit,
        quantity: qty,
        total: lineTotal,
        downloadUrl: dl,
        productType: p.productType,
      })
    }

    const total = subtotal
    const now = new Date()
    const paymentProvider =
      input.paymentProvider === 'BANK_TRANSFER' ? PaymentProvider.BANK_TRANSFER : PaymentProvider.PAYTR

    if (paymentProvider === PaymentProvider.BANK_TRANSFER) {
      const bankPub = await getPublicBankTransferDisplay()
      if (!bankPub.bankTransferEnabled) {
        const err = new Error('BANK_TRANSFER_UNAVAILABLE') as Error & { status: number; publicMessage?: string }
        err.status = 400
        err.publicMessage = 'Havale/EFT ödeme yöntemi şu anda kullanılamıyor.'
        throw err
      }
    }

    const productListHtml = `<ul>${lineSnapshots
      .map((l) => {
        const web = l.productType === ProductType.SAAS || l.productType === ProductType.SERVICE
        const qtyText = web ? `${l.quantity} yıl` : `${l.quantity} adet`
        return `<li>${escapeHtml(l.productName)} — ${escapeHtml(qtyText)} — ${Number(l.total).toFixed(2)} ${escapeHtml(currency)}</li>`
      })
      .join('')}</ul>`

    for (let attempt = 0; attempt < 20; attempt++) {
      const orderNo = await allocateOrderNo()
      try {
        const order = await prisma.order.create({
          data: {
            orderNo,
            customerId: input.customerId?.trim() || null,
            customerName: input.customerName.trim(),
            customerEmail: input.customerEmail.trim().toLowerCase(),
            customerPhone: input.customerPhone?.trim() || null,
            billingType: input.billingType?.trim() || null,
            taxOffice: input.taxOffice?.trim() || null,
            taxNumber: input.taxNumber?.trim() || null,
            companyName: input.companyName?.trim() || null,
            paymentProvider,
            subtotal: total,
            total,
            currency,
            preInfoAcceptedAt: now,
            distanceSalesAcceptedAt: now,
            kvkkReadAt: now,
            marketingConsentAt: input.marketingConsent ? now : null,
            explicitConsentAt: input.explicitConsent ? now : null,
            acceptedIp: input.acceptedIp?.trim() || null,
            acceptedUserAgent: input.acceptedUserAgent?.trim()?.slice(0, 500) || null,
            items: {
              create: lineSnapshots.map((l) => ({
                productId: l.productId,
                productName: l.productName,
                productSlug: l.productSlug,
                unitPrice: l.unitPrice,
                quantity: l.quantity,
                total: l.total,
                downloadUrl: l.downloadUrl,
              })),
            },
          },
          include: { items: true },
        })

        await createLegalSnapshotsForOrder(order.id, {
          customerName: input.customerName.trim(),
          customerEmail: input.customerEmail.trim().toLowerCase(),
          orderNo: order.orderNo,
          orderTotal: Number(total).toFixed(2),
          currency,
          productListHtml,
          ip: input.acceptedIp ?? null,
          ua: input.acceptedUserAgent ?? null,
          marketingConsent: !!input.marketingConsent,
          explicitConsent: !!input.explicitConsent,
        })

        if (paymentProvider === PaymentProvider.BANK_TRANSFER) {
          const info = await getBankTransferCustomerInfo({
            orderNo: order.orderNo,
            total: Number(order.total),
            currency: order.currency,
          })
          if (info) {
            try {
              await mailService.sendBankTransferOrderCreated({
                customerName: order.customerName,
                customerEmail: order.customerEmail,
                info,
              })
            } catch (e) {
              console.error('[orders] Havale/EFT sipariş bilgilendirme e-postası gönderilemedi', e)
            }
          }
        }

        return order
      } catch (e) {
        if (isUniqueViolation(e)) continue
        throw e
      }
    }

    const err = new Error('Sipariş numarası oluşturulamadı') as Error & { status: number }
    err.status = 500
    throw err
  },

  async lookup(orderNo: string, customerEmail: string) {
    const order = await prisma.order.findUnique({
      where: { orderNo: orderNo.trim() },
      include: { items: { orderBy: { id: 'asc' } }, paymentTransactions: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })
    if (!order) {
      const err = new Error('Sipariş bulunamadı') as Error & { status: number }
      err.status = 404
      throw err
    }
    if (!emailsMatch(order.customerEmail, customerEmail)) {
      const err = new Error('Sipariş bulunamadı') as Error & { status: number }
      err.status = 404
      throw err
    }

    return {
      orderNo: order.orderNo,
      status: order.status,
      total: Number(order.total),
      currency: order.currency,
      createdAt: order.createdAt.toISOString(),
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      paidAt: order.paidAt?.toISOString() ?? null,
      /** Müşteri arayüzü için çözümlü ödeme satırı (WAITING_BANK_TRANSFER, PENDING, SUCCESS, …) */
      paymentStatus: resolveOrderPaymentRowStatus(order),
      paymentProvider: order.paymentProvider,
      items: order.items.map((i) => ({
        productName: i.productName,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        total: Number(i.total),
        downloadUrl: orderShowsPaidDeliveryToCustomer(order.status) ? i.downloadUrl : null,
      })),
    }
  },

  async getSuccessView(orderNo: string, customerEmail?: string | null, viewerCustomerId?: string | null) {
    const order = await prisma.order.findUnique({
      where: { orderNo },
      include: { items: { orderBy: { id: 'asc' } } },
    })
    if (!order) {
      const err = new Error('Sipariş bulunamadı') as Error & { status: number }
      err.status = 404
      throw err
    }

    const lines = order.items.map((i) => ({
      productName: i.productName,
      quantity: i.quantity,
      lineTotal: Number(i.total),
    }))
    const orderTotal = Number(order.total)
    const currency = order.currency

    if (order.status === 'PENDING') {
      const bank = order.paymentProvider === PaymentProvider.BANK_TRANSFER
      const bankTransferInfo = bank
        ? await getBankTransferCustomerInfo({
            orderNo: order.orderNo,
            total: orderTotal,
            currency,
          })
        : null
      return {
        status: 'PENDING' as const,
        message: bank
          ? 'Siparişiniz oluşturuldu. Havale/EFT ödemeniz hesabımıza ulaştıktan sonra siparişiniz onaylanacak ve teslimat bilgileri e-posta ile gönderilecektir.'
          : 'Ödeme onayı bekleniyor. Onay sonrası bu sayfa otomatik güncellenir.',
        orderNo: order.orderNo,
        customerEmail: order.customerEmail,
        paymentStatusLabel: bank ? 'Ödeme bekliyor' : 'Ödeme onayı bekleniyor',
        paymentProvider: order.paymentProvider,
        lines,
        orderTotal,
        currency,
        bankTransferInfo,
      }
    }

    if (order.status === 'FAILED') {
      return {
        status: 'FAILED' as const,
        message: 'Ödeme tamamlanamadı veya iptal edildi.',
        orderNo: order.orderNo,
        customerEmail: order.customerEmail,
        paymentStatusLabel: 'Ödeme başarısız görünüyor',
        lines,
        orderTotal,
        currency,
      }
    }

    if (order.status === 'CANCELLED') {
      return {
        status: 'CANCELLED' as const,
        message: 'Sipariş iptal edildi.',
        orderNo: order.orderNo,
        customerEmail: order.customerEmail,
        paymentStatusLabel: 'Sipariş iptal edildi',
        lines,
        orderTotal,
        currency,
      }
    }

    const emailOk = customerEmail && emailsMatch(order.customerEmail, customerEmail)
    const ownerOk =
      !!viewerCustomerId && !!order.customerId && order.customerId === viewerCustomerId

    if (order.status === 'PROCESSING') {
      const processingMessage = 'Ödemeniz onaylandı. Siparişiniz işleme alındı.'
      if (!emailOk && !ownerOk) {
        return {
          status: 'PROCESSING' as const,
          orderNo: order.orderNo,
          customerEmail: order.customerEmail,
          productName: order.items.map((i) => i.productName).join(', '),
          paymentStatusLabel: 'Ödeme onaylandı',
          lines,
          orderTotal,
          currency,
          items: order.items.map((i) => ({
            productName: i.productName,
            quantity: i.quantity,
            lineTotal: Number(i.total),
            downloadUrl: null as string | null,
          })),
          paidAt: order.paidAt?.toISOString() ?? null,
          requiresEmail: true as const,
          message: 'İndirme veya kullanım bilgileri için siparişteki e-posta adresini doğrulayın.',
          paymentProvider: order.paymentProvider,
        }
      }
      return {
        status: 'PROCESSING' as const,
        orderNo: order.orderNo,
        customerEmail: order.customerEmail,
        productName: order.items.map((i) => i.productName).join(', '),
        paymentStatusLabel: 'Ödeme onaylandı',
        lines,
        orderTotal,
        currency,
        items: order.items.map((i) => ({
          productName: i.productName,
          quantity: i.quantity,
          lineTotal: Number(i.total),
          downloadUrl: i.downloadUrl,
        })),
        paidAt: order.paidAt?.toISOString() ?? null,
        requiresEmail: false as const,
        message: processingMessage,
        paymentProvider: order.paymentProvider,
      }
    }

    if (order.status !== 'PAID') {
      const err = new Error('Sipariş durumu görüntülenemiyor') as Error & { status: number }
      err.status = 400
      throw err
    }

    if (!emailOk && !ownerOk) {
      return {
        status: 'PAID' as const,
        orderNo: order.orderNo,
        customerEmail: order.customerEmail,
        productName: order.items.map((i) => i.productName).join(', '),
        paymentStatusLabel: 'Ödeme onaylandı',
        lines,
        orderTotal,
        currency,
        items: order.items.map((i) => ({
          productName: i.productName,
          quantity: i.quantity,
          lineTotal: Number(i.total),
          downloadUrl: null as string | null,
        })),
        paidAt: order.paidAt?.toISOString() ?? null,
        requiresEmail: true as const,
        message: 'İndirme bağlantıları için siparişteki e-posta adresini doğrulayın.',
      }
    }

    return {
      status: 'PAID' as const,
      orderNo: order.orderNo,
      customerEmail: order.customerEmail,
      productName: order.items.map((i) => i.productName).join(', '),
      paymentStatusLabel: 'Ödeme onaylandı',
      lines,
      orderTotal,
      currency,
      items: order.items.map((i) => ({
        productName: i.productName,
        quantity: i.quantity,
        lineTotal: Number(i.total),
        downloadUrl: i.downloadUrl,
      })),
      paidAt: order.paidAt?.toISOString() ?? null,
      requiresEmail: false as const,
    }
  },
}

export type AdminOrderListQuery = {
  status?: string
  email?: string
  orderNo?: string
  /** Müşteri adı veya e-posta içinde arama */
  customerQuery?: string
  /** PAYTR | BANK_TRANSFER | … */
  paymentProvider?: string
  /** PAID | PENDING | PENDING_CARD | PENDING_BANK | FAILED | REFUNDED */
  paymentStatus?: string
  dateFrom?: string
  dateTo?: string
}

function parseBankPaymentDateInput(raw: string): Date | null {
  const s = raw.trim()
  if (!s) return null
  const d = s.length <= 10 ? new Date(`${s}T12:00:00`) : new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

export type ConfirmBankPaymentInput = {
  paymentDate: string
  bankNote: string
  reference?: string | null
  adminUserId: string
}

export const ordersAdminService = {
  async list(q: AdminOrderListQuery) {
    const ppFilter = q.paymentProvider?.trim().toUpperCase().replace(/-/g, '_')
    if (ppFilter === 'IYZICO' || ppFilter === 'IYIZICO' || ppFilter === 'COD' || ppFilter === 'KAPIDA_ODEME' || ppFilter === 'KAPIDA') {
      return []
    }

    const and: Prisma.OrderWhereInput[] = [{ archivedAt: null }]

    if (q.status === 'PENDING' || q.status === 'PROCESSING' || q.status === 'PAID' || q.status === 'FAILED' || q.status === 'CANCELLED') {
      and.push({ status: q.status })
    }
    if (q.email?.trim()) {
      and.push({ customerEmail: { contains: q.email.trim(), mode: 'insensitive' } })
    }
    if (q.orderNo?.trim()) {
      and.push({ orderNo: { contains: q.orderNo.trim(), mode: 'insensitive' } })
    }
    if (q.customerQuery?.trim()) {
      const t = q.customerQuery.trim()
      and.push({
        OR: [
          { customerEmail: { contains: t, mode: 'insensitive' } },
          { customerName: { contains: t, mode: 'insensitive' } },
        ],
      })
    }

    if (ppFilter === 'PAYTR' || ppFilter === 'CARD' || ppFilter === 'KART') {
      and.push({ paymentProvider: PaymentProvider.PAYTR })
    } else if (ppFilter === 'BANK_TRANSFER' || ppFilter === 'HAVALE' || ppFilter === 'HAVALE_EFT' || ppFilter === 'BANK') {
      and.push({ paymentProvider: PaymentProvider.BANK_TRANSFER })
    }

    const ps = q.paymentStatus?.trim().toUpperCase().replace(/-/g, '_')
    if (ps === 'WAITING_BANK_TRANSFER' || ps === 'PENDING_BANK' || ps === 'HAVALE_ONAY') {
      and.push({ paymentProvider: PaymentProvider.BANK_TRANSFER, status: 'PENDING' })
    } else if (ps === 'PAID' || ps === 'SUCCESS' || ps === 'ODENDI') {
      and.push({
        OR: [
          { status: 'PAID' },
          { status: 'PROCESSING' },
          { paymentTransactions: { some: { status: 'SUCCESS' } } },
        ],
      })
    } else if (ps === 'PENDING_CARD' || ps === 'CARD_PENDING') {
      and.push({ paymentProvider: PaymentProvider.PAYTR, status: 'PENDING' })
    } else if (ps === 'PENDING' || ps === 'PENDING_PAYMENT' || ps === 'ODEME_BEKLIYOR') {
      and.push({ status: 'PENDING' })
    } else if (ps === 'FAILED' || ps === 'BASARISIZ') {
      and.push({
        OR: [{ status: 'FAILED' }, { paymentTransactions: { some: { status: 'FAILED' } } }],
      })
    } else if (ps === 'REFUNDED' || ps === 'IADE' || ps === 'IADE_EDILDI') {
      and.push({ status: 'CANCELLED', paidAt: { not: null } })
    }

    const createdAt: Prisma.DateTimeFilter = {}
    if (q.dateFrom?.trim()) {
      const d = new Date(q.dateFrom.trim())
      if (!Number.isNaN(d.getTime())) createdAt.gte = d
    }
    if (q.dateTo?.trim()) {
      const d = new Date(q.dateTo.trim())
      if (!Number.isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999)
        createdAt.lte = d
      }
    }
    if (Object.keys(createdAt).length > 0) {
      and.push({ createdAt })
    }

    const rows = await prisma.order.findMany({
      where: { AND: and },
      orderBy: { createdAt: 'desc' },
      include: {
        items: { orderBy: { id: 'asc' }, select: { productName: true } },
        _count: { select: { items: true } },
        paymentTransactions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    })

    return rows.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      customerName: o.customerName,
      customerEmail: o.customerEmail,
      productSummary:
        o._count.items > 1
          ? `${o.items[0]?.productName ?? '—'} (+${o._count.items - 1})`
          : o.items[0]?.productName ?? '—',
      itemCount: o._count.items,
      total: Number(o.total),
      currency: o.currency,
      status: o.status,
      paymentProvider: o.paymentProvider,
      paymentMethod: o.paymentProvider,
      paymentStatus: resolveOrderPaymentRowStatus(o),
      paytrTransactionStatus: o.paymentTransactions[0]?.status ?? null,
      hasPaytrTransactionRecord: o.paymentTransactions.length > 0,
      adminNote: o.adminNote,
      shippingCarrier: o.shippingCarrier,
      shippingTrackingNumber: o.shippingTrackingNumber,
      shippingStatus: o.shippingStatus,
      paidAt: o.paidAt?.toISOString() ?? null,
      paymentConfirmedAt: o.paymentConfirmedAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
    }))
  },

  async confirmBankPayment(orderId: string, input: ConfirmBankPaymentInput) {
    const order = await prisma.order.findFirst({ where: { id: orderId.trim(), archivedAt: null } })
    if (!order) {
      const err = new Error('Sipariş bulunamadı') as Error & { status: number }
      err.status = 404
      throw err
    }
    if (order.paymentProvider !== PaymentProvider.BANK_TRANSFER) {
      const err = new Error('Bu işlem yalnızca Havale/EFT ile oluşturulan siparişler için geçerlidir') as Error & {
        status: number
      }
      err.status = 400
      throw err
    }
    if (order.status === 'PAID' || order.status === 'PROCESSING') {
      return { orderNo: order.orderNo, alreadyPaid: true as const }
    }
    if (order.status !== 'PENDING') {
      const err = new Error('Bu sipariş durumunda ödeme onayı verilemez') as Error & { status: number }
      err.status = 400
      throw err
    }

    const bankNote = input.bankNote.trim()
    if (!bankNote) {
      const err = new Error('Banka açıklaması / dekont notu zorunludur') as Error & { status: number }
      err.status = 400
      throw err
    }
    const payDate = parseBankPaymentDateInput(input.paymentDate)
    if (!payDate) {
      const err = new Error('Geçerli bir ödeme tarihi girin') as Error & { status: number }
      err.status = 400
      throw err
    }

    const paymentConfirmedAt = new Date()
    const adminId = input.adminUserId.trim()
    if (!adminId) {
      const err = new Error('Admin oturumu bulunamadı') as Error & { status: number }
      err.status = 401
      throw err
    }

    const deliveryCtx = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: {
        items: {
          orderBy: { id: 'asc' },
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
    assertOrderDownloadLinesResolvableForCustomerMail(
      deliveryCtx.items as unknown as OrderItemForDeliveryCheck[],
    )

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'PROCESSING',
        paidAt: payDate,
        bankTransferPaymentDate: payDate,
        bankTransferAdminNote: bankNote,
        bankTransferReference: input.reference?.trim() || null,
        paymentConfirmedAt,
        paymentConfirmedById: adminId,
      },
    })

    console.warn(
      '[audit] bank-transfer-confirmed',
      JSON.stringify({
        orderId: order.id,
        orderNo: order.orderNo,
        adminUserId: adminId,
        paymentConfirmedAt: paymentConfirmedAt.toISOString(),
        bankTransferPaymentDate: payDate.toISOString(),
      }),
    )

    const mailLines = buildPaidDownloadMailLinesFromItems(
      deliveryCtx.items as unknown as OrderItemForDeliveryCheck[],
    )
    const hasWeb = mailLines.some((i) => i.downloadUrl.startsWith('saas:'))
    const hasDesktop = mailLines.some((i) => !i.downloadUrl.startsWith('saas:'))

    const msgLines: string[] = ['Ödemeniz onaylandı. Siparişiniz işleme alındı.']
    if (hasWeb) {
      msgLines.push('Web tabanlı program satırı varsa kullanım hesabınız ve giriş bilgileriniz ayrıca iletilecektir.')
    }
    if (hasDesktop) {
      msgLines.push('Masaüstü program satırı varsa indirme veya lisans bilgileriniz ayrıca iletilecektir.')
    }

    try {
      await mailService.sendBankTransferPaymentApproved({
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        orderNo: order.orderNo,
        messageLines: msgLines,
      })
    } catch (e) {
      console.error('[orders] bank approval notice mail failed', e)
    }

    try {
      await fulfillPaidOrderDelivery(order.id, undefined)
    } catch (e) {
      console.error('[orders] fulfill after bank confirm failed', e)
    }

    return { orderNo: order.orderNo, alreadyPaid: false as const }
  },

  async archive(orderId: string) {
    const id = orderId.trim()
    const order = await prisma.order.findFirst({ where: { id, archivedAt: null } })
    if (!order) {
      const err = new Error('Sipariş bulunamadı') as Error & { status: number }
      err.status = 404
      throw err
    }
    await prisma.order.update({ where: { id: order.id }, data: { archivedAt: new Date() } })
  },

  async update(
    orderId: string,
    input: {
      status?: string
      paymentTransactionStatus?: string
      adminNote?: string | null
      shippingCarrier?: string | null
      shippingTrackingNumber?: string | null
      shippingStatus?: string | null
    },
  ) {
    const id = orderId.trim()
    const order = await prisma.order.findFirst({
      where: { id, archivedAt: null },
      include: { paymentTransactions: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })
    if (!order) {
      const err = new Error('Sipariş bulunamadı') as Error & { status: number }
      err.status = 404
      throw err
    }

    const data: Prisma.OrderUpdateInput = {}

    if (input.adminNote !== undefined) {
      data.adminNote = input.adminNote === null || input.adminNote === '' ? null : input.adminNote.trim()
    }
    if (input.shippingCarrier !== undefined) {
      data.shippingCarrier =
        input.shippingCarrier === null || input.shippingCarrier === '' ? null : input.shippingCarrier.trim().slice(0, 200)
    }
    if (input.shippingTrackingNumber !== undefined) {
      data.shippingTrackingNumber =
        input.shippingTrackingNumber === null || input.shippingTrackingNumber === ''
          ? null
          : input.shippingTrackingNumber.trim().slice(0, 200)
    }
    if (input.shippingStatus !== undefined) {
      data.shippingStatus =
        input.shippingStatus === null || input.shippingStatus === '' ? null : input.shippingStatus.trim().slice(0, 120)
    }

    if (input.status?.trim()) {
      const st = input.status.trim().toUpperCase() as OrderStatus
      if (!['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED'].includes(st)) {
        const err = new Error('Geçersiz sipariş durumu') as Error & { status: number }
        err.status = 400
        throw err
      }
      data.status = st
    }

    const txStatusRaw = input.paymentTransactionStatus?.trim().toUpperCase()
    if (txStatusRaw) {
      if (order.paymentProvider !== PaymentProvider.PAYTR) {
        const err = new Error('Ödeme işlem durumu yalnızca kart (PayTR) siparişlerinde güncellenebilir') as Error & {
          status: number
        }
        err.status = 400
        throw err
      }
      if (!['PENDING', 'SUCCESS', 'FAILED'].includes(txStatusRaw)) {
        const err = new Error('Geçersiz ödeme işlem durumu') as Error & { status: number }
        err.status = 400
        throw err
      }
      const tx = order.paymentTransactions[0]
      if (!tx) {
        const err = new Error('Bu siparişte PayTR işlem kaydı yok') as Error & { status: number }
        err.status = 400
        throw err
      }
      const txStatus = txStatusRaw as PaymentTransactionStatus
      await prisma.paymentTransaction.update({
        where: { id: tx.id },
        data: { status: txStatus },
      })
      if (txStatus === PaymentTransactionStatus.SUCCESS) {
        data.status = OrderStatus.PAID
        data.paidAt = new Date()
      } else if (txStatus === PaymentTransactionStatus.FAILED) {
        data.status = OrderStatus.FAILED
        data.paidAt = null
      } else if (txStatus === PaymentTransactionStatus.PENDING) {
        data.status = OrderStatus.PENDING
        data.paidAt = null
      }
    }

    if (Object.keys(data).length > 0) {
      await prisma.order.update({ where: { id: order.id }, data })
    }

    try {
      await fulfillPaidOrderDelivery(order.id, undefined)
    } catch (e) {
      console.error('[orders] fulfill after admin update failed', e)
    }

    return { ok: true as const }
  },

  async patchOrderLicense(
    orderId: string,
    licenseId: string,
    input: { status?: 'ACTIVE' | 'DISABLED'; resetActivations?: boolean; maxDevices?: number },
  ) {
    const lic = await prisma.license.findFirst({ where: { id: licenseId, orderId } })
    if (!lic) {
      const err = new Error('Lisans bulunamadı') as Error & { status: number }
      err.status = 404
      throw err
    }
    if (input.resetActivations) {
      await adminResetLicenseActivations(licenseId)
    }
    if (input.status === 'ACTIVE') {
      await adminSetLicenseStatus(licenseId, LicenseLifecycleStatus.ACTIVE)
    } else if (input.status === 'DISABLED') {
      await adminSetLicenseStatus(licenseId, LicenseLifecycleStatus.DISABLED)
    }
    if (typeof input.maxDevices === 'number' && Number.isFinite(input.maxDevices)) {
      await adminSetLicenseMaxDevices(licenseId, input.maxDevices)
    }
    const row = await prisma.license.findUnique({
      where: { id: licenseId },
      include: {
        activations: { orderBy: { firstActivatedAt: 'desc' } },
      },
    })
    return row
  },

  async getById(id: string) {
    const order = await prisma.order.findFirst({
      where: { id, archivedAt: null },
      include: {
        items: {
          orderBy: { id: 'asc' },
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
        paymentTransactions: { orderBy: { createdAt: 'desc' } },
        legalSnapshots: { orderBy: { documentType: 'asc' } },
        customer: { select: { id: true, name: true, email: true, phone: true } },
        licenses: {
          orderBy: [{ orderItemId: 'asc' }, { unitIndex: 'asc' }],
          include: {
            activations: { orderBy: { firstActivatedAt: 'desc' } },
          },
        },
      },
    })
    if (!order) return null

    const deliveryItems = order.items as unknown as OrderItemForDeliveryCheck[]
    const mailLines = buildPaidDownloadMailLinesFromItems(deliveryItems)
    const deliveryCheckOk = checkOrderDownloadLinesForPaidMail(deliveryItems)
    const paidLike = order.status === 'PAID' || order.status === 'PROCESSING'
    let digitalDeliveryEmailAlert: string | null = null
    if (paidLike && !order.downloadEmailSentAt && (mailLines.length > 0 || !deliveryCheckOk)) {
      if (!deliveryCheckOk) {
        digitalDeliveryEmailAlert =
          'Ödeme alındı ancak ürün teslimat bağlantısı eksik veya kullanılamıyor; müşteri indirme e-postası gönderilmedi. Ürün ayarlarından indirme bağlantısını düzeltin.'
      } else {
        digitalDeliveryEmailAlert =
          'Ödeme alındı ancak müşteri indirme e-postası henüz gönderilemedi. E-posta sunucusu kayıtlarına bakın.'
      }
    }

    let paymentConfirmedByEmail: string | null = null
    if (order.paymentConfirmedById) {
      const u = await prisma.user.findUnique({
        where: { id: order.paymentConfirmedById },
        select: { email: true },
      })
      paymentConfirmedByEmail = u?.email ?? null
    }

    const paymentStatusLabel =
      order.paymentProvider === PaymentProvider.BANK_TRANSFER
        ? order.status === 'PENDING'
          ? 'Ödeme Bekliyor'
          : 'Ödendi'
        : order.status === 'PAID'
          ? 'Ödendi'
          : order.paymentTransactions[0]?.status === 'SUCCESS'
            ? 'Ödendi'
            : order.paymentTransactions[0]?.status === 'PENDING'
              ? 'Ödeme Bekliyor'
              : order.paymentTransactions[0]?.status === 'FAILED'
                ? 'Başarısız'
                : order.paymentTransactions[0]?.status ?? '—'

    const orderStatusLabel =
      order.status === 'PENDING'
        ? 'Beklemede'
        : order.status === 'PROCESSING'
          ? 'İşleme alındı'
          : order.status === 'PAID'
            ? 'Ödendi'
            : order.status === 'FAILED'
              ? 'Başarısız'
              : order.status === 'CANCELLED'
                ? 'İptal'
                : order.status

    return {
      id: order.id,
      orderNo: order.orderNo,
      status: order.status,
      orderStatusLabel,
      paymentProvider: order.paymentProvider,
      /** İstemci uyumu: paymentMethod ile aynı kaynak (Prisma paymentProvider) */
      paymentMethod: order.paymentProvider,
      /** Liste satırı ile aynı mantık — WAITING_BANK_TRANSFER / PENDING / SUCCESS */
      paymentStatus: resolveOrderPaymentRowStatus(order),
      paymentStatusLabel,
      bankTransferPaymentDate: order.bankTransferPaymentDate?.toISOString() ?? null,
      bankTransferAdminNote: order.bankTransferAdminNote,
      bankTransferReference: order.bankTransferReference,
      paymentConfirmedAt: order.paymentConfirmedAt?.toISOString() ?? null,
      paymentConfirmedById: order.paymentConfirmedById,
      paymentConfirmedByEmail,
      subtotal: Number(order.subtotal),
      total: Number(order.total),
      currency: order.currency,
      paidAt: order.paidAt?.toISOString() ?? null,
      downloadEmailSentAt: order.downloadEmailSentAt?.toISOString() ?? null,
      digitalDeliveryEmailAlert,
      preInfoAcceptedAt: order.preInfoAcceptedAt?.toISOString() ?? null,
      distanceSalesAcceptedAt: order.distanceSalesAcceptedAt?.toISOString() ?? null,
      kvkkReadAt: order.kvkkReadAt?.toISOString() ?? null,
      marketingConsentAt: order.marketingConsentAt?.toISOString() ?? null,
      explicitConsentAt: order.explicitConsentAt?.toISOString() ?? null,
      acceptedIp: order.acceptedIp,
      acceptedUserAgent: order.acceptedUserAgent,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      adminNote: order.adminNote,
      shippingCarrier: order.shippingCarrier,
      shippingTrackingNumber: order.shippingTrackingNumber,
      shippingStatus: order.shippingStatus,
      paytrTransactionStatus: order.paymentTransactions[0]?.status ?? null,
      customerId: order.customerId,
      registeredCustomer: order.customer
        ? {
            id: order.customer.id,
            name: order.customer.name,
            email: order.customer.email,
            phone: order.customer.phone,
          }
        : null,
      customer: {
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        billingType: order.billingType,
        taxOffice: order.taxOffice,
        taxNumber: order.taxNumber,
        companyName: order.companyName,
      },
      licenses: order.licenses.map((lic) => {
        const activeActs = lic.activations.filter((a) => a.status === 'ACTIVE')
        let lastValidated: Date | null = null
        for (const a of activeActs) {
          if (!a.lastValidatedAt) continue
          if (!lastValidated || a.lastValidatedAt.getTime() > lastValidated.getTime()) {
            lastValidated = a.lastValidatedAt
          }
        }
        return {
          id: lic.id,
          licenseKey: lic.licenseKey,
          status: lic.status,
          productName: lic.productName,
          customerEmail: lic.customerEmail,
          maxDevices: lic.maxDevices,
          activatedDevicesCount: activeActs.length,
          lastValidatedAt: lastValidated?.toISOString() ?? null,
          expiresAt: lic.expiresAt?.toISOString() ?? null,
          activations: lic.activations.map((a) => ({
            id: a.id,
            deviceHashShort:
              a.deviceHash.length > 10 ? `${a.deviceHash.slice(0, 6)}…${a.deviceHash.slice(-4)}` : '—',
            deviceName: a.deviceName,
            platform: a.platform,
            appVersion: a.appVersion,
            firstActivatedAt: a.firstActivatedAt.toISOString(),
            lastValidatedAt: a.lastValidatedAt?.toISOString() ?? null,
            status: a.status,
          })),
        }
      }),
      items: order.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        productName: i.productName,
        productSlug: i.productSlug,
        unitPrice: Number(i.unitPrice),
        quantity: i.quantity,
        total: Number(i.total),
        downloadUrl: i.downloadUrl,
      })),
      paymentTransactions: order.paymentTransactions.map((t) => ({
        id: t.id,
        merchantOid: t.merchantOid,
        status: t.status,
        amount: Number(t.amount),
        currency: t.currency,
        providerRawPayload: t.providerRawPayload,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
      legalSnapshots: order.legalSnapshots.map((s) => ({
        id: s.id,
        documentType: s.documentType,
        title: s.title,
        content: s.content,
        version: s.version,
        acceptedAt: s.acceptedAt.toISOString(),
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
      })),
    }
  },
}
