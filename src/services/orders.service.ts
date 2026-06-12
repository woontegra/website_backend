import { LegalDocumentType, Prisma, ProductType } from '@prisma/client'
import { getDefaultLegalDocument } from '../data/defaultLegalContents'
import { buildSellerVars, escapeHtml } from '../lib/legalSeller'
import { prisma } from '../lib/prisma'
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

    const merged = new Map<string, number>()
    for (const l of lines) {
      const q = Math.min(99, Math.max(1, Math.floor(Number(l.quantity)) || 1))
      merged.set(l.productId.trim(), q)
    }

    const productIds = [...merged.keys()]
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        isActive: true,
        productType: ProductType.DOWNLOAD,
      },
      include: { downloadMedia: { select: { url: true } } },
    })

    if (products.length !== productIds.length) {
      const err = new Error('Bazı ürünler bulunamadı veya satın alınamaz') as Error & { status: number }
      err.status = 400
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
    }[] = []

    for (const p of products) {
      if ((p.currency || 'TRY').trim() !== currency) {
        const err = new Error('Sepette farklı para biriminde ürün olamaz') as Error & { status: number }
        err.status = 400
        throw err
      }
      const dl = resolveDownloadUrl(p)
      if (!dl) {
        const err = new Error(`“${p.name}” için indirme bağlantısı tanımlı değil`) as Error & { status: number }
        err.status = 400
        throw err
      }
      const qty = merged.get(p.id) ?? 1
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
      })
    }

    const total = subtotal
    const now = new Date()
    const productListHtml = `<ul>${lineSnapshots
      .map(
        (l) =>
          `<li>${escapeHtml(l.productName)} — ${l.quantity} adet — ${Number(l.total).toFixed(2)} ${escapeHtml(currency)}</li>`,
      )
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

    const pay = order.paymentTransactions[0]
    return {
      orderNo: order.orderNo,
      status: order.status,
      total: Number(order.total),
      currency: order.currency,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      paidAt: order.paidAt?.toISOString() ?? null,
      paymentTransactionStatus: pay?.status ?? null,
      items: order.items.map((i) => ({
        productName: i.productName,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        total: Number(i.total),
        downloadUrl: order.status === 'PAID' ? i.downloadUrl : null,
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
      return {
        status: 'PENDING' as const,
        message: 'Ödeme onayı bekleniyor. Onay sonrası bu sayfa otomatik güncellenir.',
        orderNo: order.orderNo,
        customerEmail: order.customerEmail,
        paymentStatusLabel: 'Ödeme onayı bekleniyor',
        lines,
        orderTotal,
        currency,
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
}

export const ordersAdminService = {
  async list(q: AdminOrderListQuery) {
    const where: Prisma.OrderWhereInput = {}
    if (q.status === 'PENDING' || q.status === 'PAID' || q.status === 'FAILED' || q.status === 'CANCELLED') {
      where.status = q.status
    }
    if (q.email?.trim()) {
      where.customerEmail = { contains: q.email.trim(), mode: 'insensitive' }
    }
    if (q.orderNo?.trim()) {
      where.orderNo = { contains: q.orderNo.trim(), mode: 'insensitive' }
    }

    const rows = await prisma.order.findMany({
      where,
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
      paymentStatus: o.paymentTransactions[0]?.status ?? null,
      createdAt: o.createdAt.toISOString(),
    }))
  },

  async getById(id: string) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        paymentTransactions: { orderBy: { createdAt: 'desc' } },
        legalSnapshots: { orderBy: { documentType: 'asc' } },
        customer: { select: { id: true, name: true, email: true, phone: true } },
      },
    })
    if (!order) return null

    return {
      id: order.id,
      orderNo: order.orderNo,
      status: order.status,
      paymentProvider: order.paymentProvider,
      subtotal: Number(order.subtotal),
      total: Number(order.total),
      currency: order.currency,
      paidAt: order.paidAt?.toISOString() ?? null,
      downloadEmailSentAt: order.downloadEmailSentAt?.toISOString() ?? null,
      preInfoAcceptedAt: order.preInfoAcceptedAt?.toISOString() ?? null,
      distanceSalesAcceptedAt: order.distanceSalesAcceptedAt?.toISOString() ?? null,
      kvkkReadAt: order.kvkkReadAt?.toISOString() ?? null,
      marketingConsentAt: order.marketingConsentAt?.toISOString() ?? null,
      explicitConsentAt: order.explicitConsentAt?.toISOString() ?? null,
      acceptedIp: order.acceptedIp,
      acceptedUserAgent: order.acceptedUserAgent,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
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
