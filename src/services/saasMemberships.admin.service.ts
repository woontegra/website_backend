import { CustomerSaasMembershipStatus } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { MUVEKKIL_KASA_SAAS_PRODUCT_CODE, isMuvekkilKasaSaasProduct } from '../lib/muvekkilKasaSaasProduct'
import { isManualSaasMembershipProduct } from '../lib/manualSaasMembershipProduct'

type MembershipOrderRef = {
  raw: string | null
  orderNo: string | null
  orderItemId: string | null
}

type LinkedOrderSummary = {
  orderId: string
  orderNo: string
  orderStatus: string
  createdAt: string
  total: number
  currency: string
  productName: string
  provisionError: string | null
}

export type AdminSaasMembershipListParams = {
  q?: string
  status?: string
  productId?: string
  expiringSoon?: boolean
}

export type AdminCreateSaasMembershipInput = {
  customerEmail: string
  productId: string
  licenseStartDate: string
  licenseEndDate: string
  status: string
  tenantId: string
  tenantSlug: string
  licenseKey: string
  orderRef?: string | null
}

export type AdminUpdateSaasMembershipInput = {
  licenseStartDate?: string
  licenseEndDate?: string
  status?: string
  tenantId?: string
  tenantSlug?: string
  licenseKey?: string
}

export type AdminSaasMembershipListItem = {
  id: string
  customerId: string
  customerName: string
  customerEmail: string
  ownerEmail: string
  productId: string | null
  productName: string
  productCode: string
  firstOrderRef: string | null
  firstOrderNo: string | null
  lastOrderRef: string | null
  lastOrderNo: string | null
  lastOrderStatus: string | null
  licenseStartDate: string
  licenseEndDate: string
  kalanGun: number | null
  status: CustomerSaasMembershipStatus
  effectiveStatus: CustomerSaasMembershipStatus
  tenantId: string
  tenantSlug: string
  licenseKey: string
  lastProvisionError: string | null
  createdAt: string
  updatedAt: string
}

export type AdminSaasMembershipDetail = AdminSaasMembershipListItem & {
  firstOrder: LinkedOrderSummary | null
  lastOrder: LinkedOrderSummary | null
  orderHistory: LinkedOrderSummary[]
}

function calcKalanGun(end: Date): number | null {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const endDay = new Date(end)
  endDay.setHours(0, 0, 0, 0)
  return Math.ceil((endDay.getTime() - today.getTime()) / 86_400_000)
}

function resolveEffectiveStatus(
  status: CustomerSaasMembershipStatus,
  licenseEndDate: Date,
): CustomerSaasMembershipStatus {
  if (status === CustomerSaasMembershipStatus.SUSPENDED) return status
  const kalanGun = calcKalanGun(licenseEndDate)
  if (kalanGun != null && kalanGun < 0) return CustomerSaasMembershipStatus.EXPIRED
  return status
}

function parseMembershipOrderRef(raw: string | null | undefined): MembershipOrderRef {
  const value = raw?.trim() || null
  if (!value) return { raw: null, orderNo: null, orderItemId: null }
  const [orderNo, orderItemId] = value.split(':')
  return {
    raw: value,
    orderNo: orderNo?.trim() || null,
    orderItemId: orderItemId?.trim() || null,
  }
}

function renderOrderNo(ref: MembershipOrderRef, order: LinkedOrderSummary | null): string | null {
  if (order?.orderNo) return order.orderNo
  if (ref.orderNo === 'MANUAL') return 'Manuel'
  return ref.orderNo
}

async function loadLinkedOrders(refs: MembershipOrderRef[]): Promise<Map<string, LinkedOrderSummary>> {
  const itemIds = [...new Set(refs.map((ref) => ref.orderItemId).filter((v): v is string => Boolean(v)))]
  const rows = itemIds.length
    ? await prisma.orderItem.findMany({
        where: { id: { in: itemIds } },
        include: {
          order: {
            select: {
              id: true,
              orderNo: true,
              status: true,
              createdAt: true,
              total: true,
              currency: true,
            },
          },
        },
      })
    : []

  const map = new Map<string, LinkedOrderSummary>()
  for (const row of rows) {
    map.set(row.id, {
      orderId: row.order.id,
      orderNo: row.order.orderNo,
      orderStatus: row.order.status,
      createdAt: row.order.createdAt.toISOString(),
      total: Number(row.order.total),
      currency: row.order.currency,
      productName: row.productName,
      provisionError: row.licenseServerLastError?.trim() || null,
    })
  }
  return map
}

function normalizeStatus(input: string | undefined): CustomerSaasMembershipStatus | undefined {
  const value = (input || '').trim().toUpperCase()
  if (value === CustomerSaasMembershipStatus.ACTIVE) return CustomerSaasMembershipStatus.ACTIVE
  if (value === CustomerSaasMembershipStatus.SUSPENDED) return CustomerSaasMembershipStatus.SUSPENDED
  if (value === CustomerSaasMembershipStatus.EXPIRED) return CustomerSaasMembershipStatus.EXPIRED
  return undefined
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base)
  next.setDate(next.getDate() + days)
  return next
}

function parseRequiredDate(label: string, value: string): Date {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    const err = new Error(`${label} geçerli bir tarih olmalıdır.`) as Error & { status?: number }
    err.status = 400
    throw err
  }
  return date
}

function asManualOrderRef(): string {
  return `MANUAL:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function ensureManualCreateInput(input: AdminCreateSaasMembershipInput) {
  const customerEmail = input.customerEmail.trim().toLowerCase()
  const productId = input.productId.trim()
  const tenantId = input.tenantId.trim()
  const tenantSlug = input.tenantSlug.trim()
  const licenseKey = input.licenseKey.trim()
  const status = normalizeStatus(input.status)

  if (!customerEmail || !productId || !tenantId || !tenantSlug || !licenseKey || !status) {
    const err = new Error('Müşteri, ürün, tenant ve durum bilgileri zorunludur.') as Error & { status?: number }
    err.status = 400
    throw err
  }

  const licenseStartDate = parseRequiredDate('Başlangıç tarihi', input.licenseStartDate)
  const licenseEndDate = parseRequiredDate('Bitiş tarihi', input.licenseEndDate)
  if (licenseEndDate.getTime() < licenseStartDate.getTime()) {
    const err = new Error('Bitiş tarihi başlangıç tarihinden önce olamaz.') as Error & { status?: number }
    err.status = 400
    throw err
  }

  const customer = await prisma.customer.findUnique({
    where: { email: customerEmail },
    select: { id: true, email: true, name: true },
  })
  if (!customer) {
    const err = new Error('Bu e-posta ile müşteri hesabı bulunamadı.') as Error & { status?: number }
    err.status = 404
    throw err
  }

  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      productType: true,
      licenseRequired: true,
      licenseAppCode: true,
      purchaseEnabled: true,
      price: true,
      isActive: true,
    },
  })
  if (!product || !isManualSaasMembershipProduct(product)) {
    const err = new Error('Seçilen ürün manuel SaaS aboneliği için uygun değil.') as Error & { status?: number }
    err.status = 400
    throw err
  }

  let firstOrderId = asManualOrderRef()
  let lastOrderId = firstOrderId

  const orderRef = input.orderRef?.trim()
  if (orderRef) {
    const order = await prisma.order.findUnique({
      where: orderRef.includes('-') ? { id: orderRef } : { orderNo: orderRef },
      include: { items: { select: { id: true, productId: true } } },
    })
    if (!order) {
      const err = new Error('Bağlanmak istenen sipariş bulunamadı.') as Error & { status?: number }
      err.status = 404
      throw err
    }
    const linkedItem = order.items.find((item) => item.productId === product.id) ?? order.items[0]
    if (!linkedItem) {
      const err = new Error('Siparişte bağlanacak bir ürün satırı bulunamadı.') as Error & { status?: number }
      err.status = 400
      throw err
    }
    firstOrderId = `${order.orderNo}:${linkedItem.id}`
    lastOrderId = firstOrderId
  }

  return {
    customer,
    product,
    customerEmail,
    tenantId,
    tenantSlug,
    licenseKey,
    status,
    licenseStartDate,
    licenseEndDate,
    firstOrderId,
    lastOrderId,
  }
}

export const adminSaasMembershipsService = {
  async list(params: AdminSaasMembershipListParams = {}): Promise<AdminSaasMembershipListItem[]> {
    const status = normalizeStatus(params.status)
    const q = params.q?.trim()
    const productId = params.productId?.trim()
    const expiringSoon = params.expiringSoon === true

    const rows = await prisma.customerSaasMembership.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(productId ? { productId } : {}),
        ...(expiringSoon
          ? {
              licenseEndDate: {
                gte: new Date(new Date().setHours(0, 0, 0, 0)),
                lte: addDays(new Date(), 7),
              },
            }
          : {}),
        ...(q
          ? {
              OR: [
                { productCode: { contains: q, mode: 'insensitive' } },
                { tenantId: { contains: q, mode: 'insensitive' } },
                { tenantSlug: { contains: q, mode: 'insensitive' } },
                { licenseKey: { contains: q, mode: 'insensitive' } },
                { firstOrderId: { contains: q, mode: 'insensitive' } },
                { lastOrderId: { contains: q, mode: 'insensitive' } },
                { ownerEmail: { contains: q, mode: 'insensitive' } },
                { customer: { is: { name: { contains: q, mode: 'insensitive' } } } },
                { customer: { is: { email: { contains: q, mode: 'insensitive' } } } },
                { product: { is: { name: { contains: q, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        customer: { select: { id: true, name: true, email: true } },
        product: { select: { id: true, name: true } },
      },
    })

    const refs = rows.flatMap((row) => [
      parseMembershipOrderRef(row.firstOrderId),
      parseMembershipOrderRef(row.lastOrderId),
    ])
    const orderMap = await loadLinkedOrders(refs)

    return rows.map((row) => {
      const firstRef = parseMembershipOrderRef(row.firstOrderId)
      const lastRef = parseMembershipOrderRef(row.lastOrderId)
      const firstOrder = firstRef.orderItemId ? orderMap.get(firstRef.orderItemId) ?? null : null
      const lastOrder = lastRef.orderItemId ? orderMap.get(lastRef.orderItemId) ?? null : null
      const kalanGun = calcKalanGun(row.licenseEndDate)
      return {
        id: row.id,
        customerId: row.customer.id,
        customerName: row.customer.name,
        customerEmail: row.customer.email,
        ownerEmail: row.ownerEmail,
        productId: row.product?.id ?? null,
        productName: row.product?.name ?? row.productCode,
        productCode: row.productCode,
        firstOrderRef: firstRef.raw,
        firstOrderNo: renderOrderNo(firstRef, firstOrder),
        lastOrderRef: lastRef.raw,
        lastOrderNo: renderOrderNo(lastRef, lastOrder),
        lastOrderStatus: lastOrder?.orderStatus ?? null,
        licenseStartDate: row.licenseStartDate.toISOString(),
        licenseEndDate: row.licenseEndDate.toISOString(),
        kalanGun,
        status: row.status,
        effectiveStatus: resolveEffectiveStatus(row.status, row.licenseEndDate),
        tenantId: row.tenantId,
        tenantSlug: row.tenantSlug,
        licenseKey: row.licenseKey,
        lastProvisionError: lastOrder?.provisionError ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }
    })
  },

  async getById(id: string): Promise<AdminSaasMembershipDetail | null> {
    const row = await prisma.customerSaasMembership.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        product: { select: { id: true, name: true, slug: true } },
        renewalOrderItems: {
          include: {
            order: {
              select: {
                id: true,
                orderNo: true,
                status: true,
                createdAt: true,
                total: true,
                currency: true,
              },
            },
          },
        },
      },
    })
    if (!row) return null

    const firstRef = parseMembershipOrderRef(row.firstOrderId)
    const lastRef = parseMembershipOrderRef(row.lastOrderId)
    const orderMap = await loadLinkedOrders([
      firstRef,
      lastRef,
      ...row.renewalOrderItems.map((item) => parseMembershipOrderRef(`${item.order.orderNo}:${item.id}`)),
    ])

    const firstOrder = firstRef.orderItemId ? orderMap.get(firstRef.orderItemId) ?? null : null
    const lastOrder = lastRef.orderItemId ? orderMap.get(lastRef.orderItemId) ?? null : null
    const renewalHistory = row.renewalOrderItems.map<LinkedOrderSummary>((item) => ({
      orderId: item.order.id,
      orderNo: item.order.orderNo,
      orderStatus: item.order.status,
      createdAt: item.order.createdAt.toISOString(),
      total: Number(item.order.total),
      currency: item.order.currency,
      productName: item.productName,
      provisionError: item.licenseServerLastError?.trim() || null,
    }))

    const historyMap = new Map<string, LinkedOrderSummary>()
    if (firstOrder) historyMap.set(firstOrder.orderId, firstOrder)
    for (const item of renewalHistory) historyMap.set(item.orderId, item)
    const orderHistory = [...historyMap.values()].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

    const kalanGun = calcKalanGun(row.licenseEndDate)
    return {
      id: row.id,
      customerId: row.customer.id,
      customerName: row.customer.name,
      customerEmail: row.customer.email,
      ownerEmail: row.ownerEmail,
      productId: row.product?.id ?? null,
      productName: row.product?.name ?? row.productCode,
      productCode: row.productCode,
      firstOrderRef: firstRef.raw,
      firstOrderNo: renderOrderNo(firstRef, firstOrder),
      lastOrderRef: lastRef.raw,
      lastOrderNo: renderOrderNo(lastRef, lastOrder),
      lastOrderStatus: lastOrder?.orderStatus ?? null,
      licenseStartDate: row.licenseStartDate.toISOString(),
      licenseEndDate: row.licenseEndDate.toISOString(),
      kalanGun,
      status: row.status,
      effectiveStatus: resolveEffectiveStatus(row.status, row.licenseEndDate),
      tenantId: row.tenantId,
      tenantSlug: row.tenantSlug,
      licenseKey: row.licenseKey,
      lastProvisionError: lastOrder?.provisionError ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      firstOrder,
      lastOrder,
      orderHistory,
    }
  },

  async patchStatus(id: string, statusRaw: string) {
    const status = normalizeStatus(statusRaw)
    if (!status) {
      const err = new Error('Geçersiz üyelik durumu.') as Error & { status?: number }
      err.status = 400
      throw err
    }
    await prisma.customerSaasMembership.update({
      where: { id },
      data: { status },
    })
    const row = await adminSaasMembershipsService.getById(id)
    if (!row) {
      const err = new Error('Üyelik bulunamadı.') as Error & { status?: number }
      err.status = 404
      throw err
    }
    return row
  },

  async create(input: AdminCreateSaasMembershipInput) {
    const normalized = await ensureManualCreateInput(input)
    try {
      const row = await prisma.customerSaasMembership.create({
        data: {
          customerId: normalized.customer.id,
          productId: normalized.product.id,
          productCode: isMuvekkilKasaSaasProduct({ slug: normalized.product.slug, licenseAppCode: null })
            ? MUVEKKIL_KASA_SAAS_PRODUCT_CODE
            : normalized.product.slug.trim().toUpperCase() || normalized.product.id,
          tenantId: normalized.tenantId,
          tenantSlug: normalized.tenantSlug,
          licenseKey: normalized.licenseKey,
          ownerEmail: normalized.customerEmail,
          status: normalized.status,
          licenseStartDate: normalized.licenseStartDate,
          licenseEndDate: normalized.licenseEndDate,
          firstOrderId: normalized.firstOrderId,
          lastOrderId: normalized.lastOrderId,
        },
      })
      return adminSaasMembershipsService.getById(row.id)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Abonelik oluşturulamadı'
      const err = new Error(msg) as Error & { status?: number }
      err.status = 400
      throw err
    }
  },

  async patch(id: string, input: AdminUpdateSaasMembershipInput) {
    const existing = await prisma.customerSaasMembership.findUnique({ where: { id } })
    if (!existing) {
      const err = new Error('Üyelik bulunamadı.') as Error & { status?: number }
      err.status = 404
      throw err
    }

    const data: Record<string, unknown> = {}
    if (input.status !== undefined) {
      const status = normalizeStatus(input.status)
      if (!status) {
        const err = new Error('Geçersiz üyelik durumu.') as Error & { status?: number }
        err.status = 400
        throw err
      }
      data.status = status
    }
    if (input.licenseStartDate !== undefined) data.licenseStartDate = parseRequiredDate('Başlangıç tarihi', input.licenseStartDate)
    if (input.licenseEndDate !== undefined) data.licenseEndDate = parseRequiredDate('Bitiş tarihi', input.licenseEndDate)
    if (input.tenantId !== undefined) data.tenantId = input.tenantId.trim()
    if (input.tenantSlug !== undefined) data.tenantSlug = input.tenantSlug.trim()
    if (input.licenseKey !== undefined) data.licenseKey = input.licenseKey.trim()

    await prisma.customerSaasMembership.update({
      where: { id },
      data,
    })
    return adminSaasMembershipsService.getById(id)
  },

  async extend(id: string, days: number) {
    const extendDays = Number.isFinite(days) ? Math.trunc(days) : 0
    if (extendDays < 1 || extendDays > 3650) {
      const err = new Error('Uzatma günü 1 ile 3650 arasında olmalıdır.') as Error & { status?: number }
      err.status = 400
      throw err
    }
    const membership = await prisma.customerSaasMembership.findUnique({
      where: { id },
      select: { id: true, licenseEndDate: true },
    })
    if (!membership) {
      const err = new Error('Üyelik bulunamadı.') as Error & { status?: number }
      err.status = 404
      throw err
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const base = membership.licenseEndDate.getTime() > today.getTime() ? membership.licenseEndDate : today
    const nextEndDate = addDays(base, extendDays)

    await prisma.customerSaasMembership.update({
      where: { id },
      data: {
        licenseEndDate: nextEndDate,
        status: CustomerSaasMembershipStatus.ACTIVE,
      },
    })

    const row = await adminSaasMembershipsService.getById(id)
    if (!row) {
      const err = new Error('Üyelik bulunamadı.') as Error & { status?: number }
      err.status = 404
      throw err
    }
    return row
  },
}
