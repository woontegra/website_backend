import {
  CustomerSaasMembershipStatus,
  OrderStatus,
  PaymentTransactionStatus,
  Prisma,
} from '@prisma/client'
import { prisma } from '../lib/prisma'

const PAID_ORDER_STATUSES: OrderStatus[] = [OrderStatus.PAID, OrderStatus.PROCESSING]
const PENDING_ORDER_STATUSES: OrderStatus[] = [OrderStatus.PENDING]

export type AdminCustomerListParams = {
  q?: string
  filter?: string
  take?: number
  skip?: number
}

export type AdminCustomerListItem = {
  id: string
  name: string
  email: string
  phone: string | null
  companyName: string | null
  isActive: boolean
  isCorporate: boolean
  orderCount: number
  paidOrderCount: number
  pendingOrderCount: number
  paymentCount: number
  totalPaidAmount: number
  currency: string
  activeSaasMembershipCount: number
  saasMembershipCount: number
  licenseCount: number
  canDelete: boolean
  deleteBlockReason: string | null
  lastOrderDate: string | null
  lastActivityAt: string | null
  createdAt: string
  updatedAt: string
}

export type AdminCustomerAddress = {
  id: string
  title: string
  fullName: string
  phone: string | null
  city: string
  district: string | null
  addressLine: string
  postalCode: string | null
  taxOffice: string | null
  taxNumber: string | null
  companyName: string | null
  isDefault: boolean
}

export type AdminCustomerOrderRow = {
  id: string
  orderNo: string
  productSummary: string
  total: number
  currency: string
  paymentProvider: string
  paymentStatus: string | null
  status: string
  createdAt: string
}

export type AdminCustomerPaymentRow = {
  id: string
  orderId: string
  orderNo: string
  provider: string
  amount: number
  currency: string
  status: string
  createdAt: string
}

export type AdminCustomerSaasRow = {
  id: string
  productName: string
  licenseStartDate: string
  licenseEndDate: string
  kalanGun: number | null
  status: string
  effectiveStatus: string
  tenantSlug: string
  tenantId: string
}

export type AdminCustomerLicenseRow = {
  id: string
  licenseKey: string
  productName: string
  productCode: string | null
  status: string
  source: string
  orderNo: string | null
  expiresAt: string | null
  createdAt: string
}

export type AdminCustomerDetail = {
  customer: {
    id: string
    name: string
    email: string
    phone: string | null
    isActive: boolean
    companyName: string | null
    taxOffice: string | null
    taxNumber: string | null
    billingType: string | null
    isCorporate: boolean
    createdAt: string
    updatedAt: string
  }
  summary: {
    orderCount: number
    paidOrderCount: number
    pendingOrderCount: number
    totalPaidAmount: number
    currency: string
    activeSaasMembershipCount: number
    expiredSaasMembershipCount: number
    nearestSaasEndDate: string | null
    licenseCount: number
    lastOrderDate: string | null
    lastPaymentDate: string | null
    lastSaasActivityAt: string | null
    lastActivityAt: string | null
  }
  addresses: AdminCustomerAddress[]
  orders: AdminCustomerOrderRow[]
  payments: AdminCustomerPaymentRow[]
  saasMemberships: AdminCustomerSaasRow[]
  licenses: AdminCustomerLicenseRow[]
}

export type AdminUpdateCustomerInput = {
  name?: string
  phone?: string | null
  isActive?: boolean
  defaultAddress?: {
    fullName?: string
    phone?: string | null
    city?: string
    district?: string | null
    addressLine?: string
    postalCode?: string | null
    companyName?: string | null
    taxOffice?: string | null
    taxNumber?: string | null
  }
}

function calcKalanGun(end: Date): number | null {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const endDay = new Date(end)
  endDay.setHours(0, 0, 0, 0)
  return Math.ceil((endDay.getTime() - today.getTime()) / 86_400_000)
}

function resolveEffectiveSaasStatus(
  status: CustomerSaasMembershipStatus,
  licenseEndDate: Date,
): CustomerSaasMembershipStatus {
  if (status === CustomerSaasMembershipStatus.SUSPENDED) return status
  const kalanGun = calcKalanGun(licenseEndDate)
  if (kalanGun != null && kalanGun < 0) return CustomerSaasMembershipStatus.EXPIRED
  return status
}

function decimalToNumber(value: Prisma.Decimal | number): number {
  return typeof value === 'number' ? value : Number(value)
}

export type AdminCustomerSummary = {
  totalCustomers: number
  activeSaasCustomers: number
}

function buildDeleteBlockReason(counts: {
  orderCount: number
  paymentCount: number
  saasMembershipCount: number
  licenseCount: number
}): string | null {
  if (counts.orderCount > 0) return 'Sipariş kaydı var'
  if (counts.paymentCount > 0) return 'Ödeme kaydı var'
  if (counts.saasMembershipCount > 0) return 'SaaS aboneliği var'
  if (counts.licenseCount > 0) return 'Masaüstü lisans kaydı var'
  return null
}

function orderWhereForCustomer(customerId: string, email: string): Prisma.OrderWhereInput {
  return {
    archivedAt: null,
    OR: [{ customerId }, { customerEmail: { equals: email, mode: 'insensitive' } }],
  }
}

async function resolveSearchCustomerIds(q: string): Promise<string[]> {
  const query = q.trim()
  if (!query) return []

  const ids = new Set<string>()

  const [byCustomer, byOrder, bySaas, byAddress] = await Promise.all([
    prisma.customer.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
      take: 200,
    }),
    prisma.order.findMany({
      where: {
        archivedAt: null,
        OR: [
          { orderNo: { contains: query, mode: 'insensitive' } },
          { companyName: { contains: query, mode: 'insensitive' } },
          { taxNumber: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { customerId: true, customerEmail: true },
      take: 200,
    }),
    prisma.customerSaasMembership.findMany({
      where: {
        OR: [
          { tenantSlug: { contains: query, mode: 'insensitive' } },
          { tenantId: { contains: query, mode: 'insensitive' } },
          { licenseKey: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { customerId: true },
      take: 200,
    }),
    prisma.customerAddress.findMany({
      where: {
        OR: [
          { companyName: { contains: query, mode: 'insensitive' } },
          { taxNumber: { contains: query, mode: 'insensitive' } },
          { fullName: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { customerId: true },
      take: 200,
    }),
  ])

  for (const row of byCustomer) ids.add(row.id)
  for (const row of bySaas) ids.add(row.customerId)
  for (const row of byAddress) ids.add(row.customerId)
  for (const row of byOrder) {
    if (row.customerId) ids.add(row.customerId)
    else if (row.customerEmail) {
      const linked = await prisma.customer.findFirst({
        where: { email: { equals: row.customerEmail, mode: 'insensitive' } },
        select: { id: true },
      })
      if (linked) ids.add(linked.id)
    }
  }

  return [...ids]
}

async function buildMetricsForCustomers(
  customers: Array<{ id: string; email: string; updatedAt: Date }>,
): Promise<Map<string, Omit<AdminCustomerListItem, 'id' | 'name' | 'email' | 'phone' | 'isActive' | 'createdAt' | 'updatedAt'>>> {
  const map = new Map<string, Omit<AdminCustomerListItem, 'id' | 'name' | 'email' | 'phone' | 'isActive' | 'createdAt' | 'updatedAt'>>()
  if (customers.length === 0) return map

  const customerIds = customers.map((c) => c.id)
  const emails = customers.map((c) => c.email.toLowerCase())

  const [orders, saasRows, addresses, licenses] = await Promise.all([
    prisma.order.findMany({
      where: {
        archivedAt: null,
        OR: [{ customerId: { in: customerIds } }, { customerEmail: { in: emails, mode: 'insensitive' } }],
      },
      select: {
        customerId: true,
        customerEmail: true,
        status: true,
        total: true,
        currency: true,
        createdAt: true,
        companyName: true,
        taxNumber: true,
        billingType: true,
        paymentTransactions: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.customerSaasMembership.findMany({
      where: { customerId: { in: customerIds } },
      select: { customerId: true, status: true, licenseEndDate: true, updatedAt: true },
    }),
    prisma.customerAddress.findMany({
      where: { customerId: { in: customerIds } },
      select: {
        customerId: true,
        companyName: true,
        taxNumber: true,
        isDefault: true,
        updatedAt: true,
      },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    }),
    prisma.license.findMany({
      where: {
        OR: [{ customerId: { in: customerIds } }, { customerEmail: { in: emails, mode: 'insensitive' } }],
      },
      select: { id: true, customerId: true, customerEmail: true },
    }),
  ])

  for (const customer of customers) {
    const relatedOrders = orders.filter(
      (o) => o.customerId === customer.id || o.customerEmail.toLowerCase() === customer.email.toLowerCase(),
    )
    const relatedSaas = saasRows.filter((s) => s.customerId === customer.id)
    const relatedLicenses = licenses.filter(
      (l) => l.customerId === customer.id || l.customerEmail.toLowerCase() === customer.email.toLowerCase(),
    )
    const relatedAddresses = addresses.filter((a) => a.customerId === customer.id)

    const paidOrders = relatedOrders.filter((o) => PAID_ORDER_STATUSES.includes(o.status))
    const pendingOrders = relatedOrders.filter((o) => PENDING_ORDER_STATUSES.includes(o.status))
    const paymentCount = relatedOrders.reduce((sum, order) => sum + (order.paymentTransactions?.length ?? 0), 0)
    const totalPaidAmount = paidOrders.reduce((sum, o) => sum + decimalToNumber(o.total), 0)
    const currency = paidOrders[0]?.currency ?? relatedOrders[0]?.currency ?? 'TRY'
    const lastOrder = relatedOrders[0] ?? null

    const companyFromOrder = relatedOrders.find((o) => o.companyName?.trim())?.companyName?.trim() || null
    const companyFromAddress = relatedAddresses.find((a) => a.companyName?.trim())?.companyName?.trim() || null
    const taxFromOrder = relatedOrders.find((o) => o.taxNumber?.trim())?.taxNumber?.trim() || null
    const taxFromAddress = relatedAddresses.find((a) => a.taxNumber?.trim())?.taxNumber?.trim() || null
    const billingCorporate = relatedOrders.some(
      (o) => o.billingType?.toLowerCase() === 'corporate' || o.billingType?.toLowerCase() === 'kurumsal',
    )

    const activeSaas = relatedSaas.filter(
      (s) => resolveEffectiveSaasStatus(s.status, s.licenseEndDate) === CustomerSaasMembershipStatus.ACTIVE,
    )

    const lastSaasAt = relatedSaas.reduce<Date | null>((max, row) => {
      if (!max || row.updatedAt > max) return row.updatedAt
      return max
    }, null)

    const lastActivityCandidates = [customer.updatedAt, lastOrder?.createdAt ?? null, lastSaasAt].filter(
      (v): v is Date => v instanceof Date,
    )
    const lastActivityAt =
      lastActivityCandidates.length > 0
        ? lastActivityCandidates.reduce((max, d) => (d > max ? d : max)).toISOString()
        : null

    const deleteBlockReason = buildDeleteBlockReason({
      orderCount: relatedOrders.length,
      paymentCount,
      saasMembershipCount: relatedSaas.length,
      licenseCount: relatedLicenses.length,
    })

    map.set(customer.id, {
      companyName: companyFromOrder ?? companyFromAddress,
      isCorporate: Boolean(companyFromOrder ?? companyFromAddress ?? taxFromOrder ?? taxFromAddress ?? billingCorporate),
      orderCount: relatedOrders.length,
      paidOrderCount: paidOrders.length,
      pendingOrderCount: pendingOrders.length,
      paymentCount,
      totalPaidAmount,
      currency,
      activeSaasMembershipCount: activeSaas.length,
      saasMembershipCount: relatedSaas.length,
      licenseCount: relatedLicenses.length,
      canDelete: deleteBlockReason === null,
      deleteBlockReason,
      lastOrderDate: lastOrder?.createdAt.toISOString() ?? null,
      lastActivityAt,
    })
  }

  return map
}

function matchesFilter(
  filter: string | undefined,
  metrics: {
    orderCount: number
    pendingOrderCount: number
    activeSaasMembershipCount: number
    lastOrderDate: string | null
    isCorporate: boolean
  },
  isActive: boolean,
): boolean {
  if (!filter) return true
  switch (filter) {
    case 'active':
      return isActive
    case 'has_saas':
      return metrics.activeSaasMembershipCount > 0
    case 'has_orders':
      return metrics.orderCount > 0
    case 'pending_payment':
      return metrics.pendingOrderCount > 0
    case 'ordered_last_30d': {
      if (!metrics.lastOrderDate) return false
      const d = new Date(metrics.lastOrderDate)
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 30)
      return d >= cutoff
    }
    case 'no_orders':
      return metrics.orderCount === 0
    case 'corporate':
      return metrics.isCorporate
    case 'individual':
      return !metrics.isCorporate
    default:
      return true
  }
}

export const customersAdminService = {
  async getSummary(): Promise<AdminCustomerSummary> {
    const [totalCustomers, saasGroups] = await Promise.all([
      prisma.customer.count(),
      prisma.customerSaasMembership.groupBy({
        by: ['customerId'],
        where: { status: CustomerSaasMembershipStatus.ACTIVE },
      }),
    ])
    return {
      totalCustomers,
      activeSaasCustomers: saasGroups.length,
    }
  },

  async list(params: AdminCustomerListParams = {}): Promise<AdminCustomerListItem[]> {
    const take = Math.min(Math.max(params.take ?? 200, 1), 500)
    const skip = Math.max(params.skip ?? 0, 0)
    const filter = params.filter?.trim().toLowerCase()

    let customerWhere: Prisma.CustomerWhereInput | undefined
    if (params.q?.trim()) {
      const ids = await resolveSearchCustomerIds(params.q)
      if (ids.length === 0) return []
      customerWhere = { id: { in: ids } }
    }

    const rows = await prisma.customer.findMany({
      where: customerWhere,
      orderBy: { createdAt: 'desc' },
      take: filter ? 500 : take,
      skip: filter ? 0 : skip,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    const metricsMap = await buildMetricsForCustomers(rows)

    const items = rows
      .map((row) => {
        const metrics = metricsMap.get(row.id)
        if (!metrics) return null
        return {
          id: row.id,
          name: row.name,
          email: row.email,
          phone: row.phone,
          isActive: row.isActive,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          ...metrics,
        } satisfies AdminCustomerListItem
      })
      .filter((row): row is AdminCustomerListItem => row !== null)
      .filter((row) => matchesFilter(filter, row, row.isActive))

    if (filter) return items.slice(skip, skip + take)
    return items
  },

  async getById(id: string): Promise<AdminCustomerDetail | null> {
    const customer = await prisma.customer.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        addresses: {
          orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
        },
      },
    })
    if (!customer) return null

    const orderWhere = orderWhereForCustomer(customer.id, customer.email)

    const [orders, saasMemberships, licenses] = await Promise.all([
      prisma.order.findMany({
        where: orderWhere,
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          items: { select: { productName: true }, take: 3 },
          paymentTransactions: { orderBy: { createdAt: 'desc' } },
        },
      }),
      prisma.customerSaasMembership.findMany({
        where: { customerId: customer.id },
        orderBy: { licenseEndDate: 'desc' },
        include: { product: { select: { name: true } } },
      }),
      prisma.license.findMany({
        where: {
          OR: [{ customerId: customer.id }, { customerEmail: { equals: customer.email, mode: 'insensitive' } }],
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ])

    const paidOrders = orders.filter((o) => PAID_ORDER_STATUSES.includes(o.status))
    const pendingOrders = orders.filter((o) => PENDING_ORDER_STATUSES.includes(o.status))
    const totalPaidAmount = paidOrders.reduce((sum, o) => sum + decimalToNumber(o.total), 0)
    const currency = paidOrders[0]?.currency ?? orders[0]?.currency ?? 'TRY'

    const activeSaas = saasMemberships.filter(
      (s) => resolveEffectiveSaasStatus(s.status, s.licenseEndDate) === CustomerSaasMembershipStatus.ACTIVE,
    )
    const expiredSaas = saasMemberships.filter(
      (s) => resolveEffectiveSaasStatus(s.status, s.licenseEndDate) === CustomerSaasMembershipStatus.EXPIRED,
    )
    const nearestSaasEnd = activeSaas.reduce<Date | null>((min, row) => {
      if (!min || row.licenseEndDate < min) return row.licenseEndDate
      return min
    }, null)

    const latestOrder = orders[0] ?? null
    const companyFromOrder = orders.find((o) => o.companyName?.trim()) ?? null
    const defaultAddress = customer.addresses.find((a) => a.isDefault) ?? customer.addresses[0] ?? null

    const payments = orders.flatMap((order) =>
      order.paymentTransactions.map((tx) => ({
        id: tx.id,
        orderId: order.id,
        orderNo: order.orderNo,
        provider: tx.provider,
        amount: decimalToNumber(tx.amount),
        currency: tx.currency,
        status: tx.status,
        createdAt: tx.createdAt.toISOString(),
      })),
    )
    payments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const lastPayment = payments.find((p) => p.status === PaymentTransactionStatus.SUCCESS) ?? payments[0] ?? null
    const lastSaasAt = saasMemberships.reduce<Date | null>((max, row) => {
      if (!max || row.updatedAt > max) return row.updatedAt
      return max
    }, null)

    const lastActivityCandidates = [
      customer.updatedAt,
      latestOrder?.createdAt ?? null,
      lastPayment ? new Date(lastPayment.createdAt) : null,
      lastSaasAt,
    ].filter((v): v is Date => v instanceof Date)
    const lastActivityAt =
      lastActivityCandidates.length > 0
        ? lastActivityCandidates.reduce((max, d) => (d > max ? d : max)).toISOString()
        : null

    const companyName = companyFromOrder?.companyName?.trim() || defaultAddress?.companyName?.trim() || null
    const taxOffice = companyFromOrder?.taxOffice?.trim() || defaultAddress?.taxOffice?.trim() || null
    const taxNumber = companyFromOrder?.taxNumber?.trim() || defaultAddress?.taxNumber?.trim() || null
    const billingType = companyFromOrder?.billingType?.trim() || null
    const isCorporate = Boolean(
      companyName || taxNumber || billingType?.toLowerCase() === 'corporate' || billingType?.toLowerCase() === 'kurumsal',
    )

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        isActive: customer.isActive,
        companyName,
        taxOffice,
        taxNumber,
        billingType,
        isCorporate,
        createdAt: customer.createdAt.toISOString(),
        updatedAt: customer.updatedAt.toISOString(),
      },
      summary: {
        orderCount: orders.length,
        paidOrderCount: paidOrders.length,
        pendingOrderCount: pendingOrders.length,
        totalPaidAmount,
        currency,
        activeSaasMembershipCount: activeSaas.length,
        expiredSaasMembershipCount: expiredSaas.length,
        nearestSaasEndDate: nearestSaasEnd?.toISOString() ?? null,
        licenseCount: licenses.length,
        lastOrderDate: latestOrder?.createdAt.toISOString() ?? null,
        lastPaymentDate: lastPayment?.createdAt ?? null,
        lastSaasActivityAt: lastSaasAt?.toISOString() ?? null,
        lastActivityAt,
      },
      addresses: customer.addresses.map((a) => ({
        id: a.id,
        title: a.title,
        fullName: a.fullName,
        phone: a.phone,
        city: a.city,
        district: a.district,
        addressLine: a.addressLine,
        postalCode: a.postalCode,
        taxOffice: a.taxOffice,
        taxNumber: a.taxNumber,
        companyName: a.companyName,
        isDefault: a.isDefault,
      })),
      orders: orders.map((order) => ({
        id: order.id,
        orderNo: order.orderNo,
        productSummary: order.items.map((i) => i.productName).join(', ') || '—',
        total: decimalToNumber(order.total),
        currency: order.currency,
        paymentProvider: order.paymentProvider,
        paymentStatus: order.paymentTransactions[0]?.status ?? null,
        status: order.status,
        createdAt: order.createdAt.toISOString(),
      })),
      payments,
      saasMemberships: saasMemberships.map((row) => {
        const effectiveStatus = resolveEffectiveSaasStatus(row.status, row.licenseEndDate)
        return {
          id: row.id,
          productName: row.product?.name ?? row.productCode,
          licenseStartDate: row.licenseStartDate.toISOString(),
          licenseEndDate: row.licenseEndDate.toISOString(),
          kalanGun: calcKalanGun(row.licenseEndDate),
          status: row.status,
          effectiveStatus,
          tenantSlug: row.tenantSlug,
          tenantId: row.tenantId,
        }
      }),
      licenses: licenses.map((lic) => ({
        id: lic.id,
        licenseKey: lic.licenseKey,
        productName: lic.productName,
        productCode: lic.productCode,
        status: lic.status,
        source: lic.source,
        orderNo: lic.orderNo,
        expiresAt: lic.expiresAt?.toISOString() ?? null,
        createdAt: lic.createdAt.toISOString(),
      })),
    }
  },

  async update(id: string, input: AdminUpdateCustomerInput) {
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        addresses: { orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }], take: 1 },
      },
    })
    if (!customer) {
      const err = new Error('Müşteri bulunamadı.') as Error & { status?: number }
      err.status = 404
      throw err
    }

    const data: Prisma.CustomerUpdateInput = {}
    if (input.name !== undefined) {
      const name = input.name.trim()
      if (!name) {
        const err = new Error('Ad soyad zorunludur.') as Error & { status?: number }
        err.status = 400
        throw err
      }
      data.name = name
    }
    if (input.phone !== undefined) data.phone = input.phone?.trim() || null
    if (input.isActive !== undefined) data.isActive = input.isActive

    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.customer.update({ where: { id }, data })
      }

      if (input.defaultAddress && customer.addresses[0]) {
        const addr = input.defaultAddress
        const addressData: Prisma.CustomerAddressUpdateInput = {}
        if (addr.fullName !== undefined) {
          const fullName = addr.fullName.trim()
          if (!fullName) {
            const err = new Error('Adres alıcı adı zorunludur.') as Error & { status?: number }
            err.status = 400
            throw err
          }
          addressData.fullName = fullName
        }
        if (addr.city !== undefined) {
          const city = addr.city.trim()
          if (!city) {
            const err = new Error('Şehir zorunludur.') as Error & { status?: number }
            err.status = 400
            throw err
          }
          addressData.city = city
        }
        if (addr.addressLine !== undefined) {
          const addressLine = addr.addressLine.trim()
          if (!addressLine) {
            const err = new Error('Adres satırı zorunludur.') as Error & { status?: number }
            err.status = 400
            throw err
          }
          addressData.addressLine = addressLine
        }
        if (addr.phone !== undefined) addressData.phone = addr.phone?.trim() || null
        if (addr.district !== undefined) addressData.district = addr.district?.trim() || null
        if (addr.postalCode !== undefined) addressData.postalCode = addr.postalCode?.trim() || null
        if (addr.companyName !== undefined) addressData.companyName = addr.companyName?.trim() || null
        if (addr.taxOffice !== undefined) addressData.taxOffice = addr.taxOffice?.trim() || null
        if (addr.taxNumber !== undefined) addressData.taxNumber = addr.taxNumber?.trim() || null

        if (Object.keys(addressData).length > 0) {
          await tx.customerAddress.update({
            where: { id: customer.addresses[0].id },
            data: addressData,
          })
        }
      }
    })

    const row = await customersAdminService.getById(id)
    if (!row) {
      const err = new Error('Müşteri bulunamadı.') as Error & { status?: number }
      err.status = 404
      throw err
    }
    return row
  },

  async patchStatus(id: string, isActive: boolean) {
    const existing = await prisma.customer.findUnique({ where: { id }, select: { id: true } })
    if (!existing) {
      const err = new Error('Müşteri bulunamadı.') as Error & { status?: number }
      err.status = 404
      throw err
    }
    await prisma.customer.update({ where: { id }, data: { isActive } })
    const row = await customersAdminService.getById(id)
    if (!row) {
      const err = new Error('Müşteri bulunamadı.') as Error & { status?: number }
      err.status = 404
      throw err
    }
    return row
  },

  async delete(id: string) {
    const customer = await prisma.customer.findUnique({
      where: { id },
      select: { id: true, email: true },
    })
    if (!customer) {
      const err = new Error('Müşteri bulunamadı.') as Error & { status?: number }
      err.status = 404
      throw err
    }

    const orderWhere = orderWhereForCustomer(customer.id, customer.email)
    const [orderCount, paymentCount, saasMembershipCount, licenseCount] = await Promise.all([
      prisma.order.count({ where: orderWhere }),
      prisma.paymentTransaction.count({ where: { order: orderWhere } }),
      prisma.customerSaasMembership.count({ where: { customerId: customer.id } }),
      prisma.license.count({
        where: {
          OR: [{ customerId: customer.id }, { customerEmail: { equals: customer.email, mode: 'insensitive' } }],
        },
      }),
    ])

    const deleteBlockReason = buildDeleteBlockReason({
      orderCount,
      paymentCount,
      saasMembershipCount,
      licenseCount,
    })
    if (deleteBlockReason) {
      const err = new Error(
        'Bu müşteri ilişkili kayıtları olduğu için silinemez, pasife alabilirsiniz.',
      ) as Error & { status?: number }
      err.status = 400
      throw err
    }

    await prisma.customer.delete({ where: { id: customer.id } })
    return { id: customer.id, deleted: true }
  },
}
