import {
  OrderStatus,
  PaymentProvider,
  PaymentTransactionStatus,
  Prisma,
} from '@prisma/client'
import { prisma } from '../lib/prisma'

export type TestDataCleanupOptions = {
  deleteOrders?: boolean
  deletePayments?: boolean
  deleteSaasMemberships?: boolean
  deleteWebsiteLicenses?: boolean
  deleteCustomer?: boolean
  deleteUserAccount?: boolean
  deleteContactMessages?: boolean
}

export type TestDataCleanupPreview = {
  email: string
  normalizedEmail: string
  isLikelyTestEmail: boolean
  requiresExtraConfirmation: boolean
  hasProtectedPaytrPayments: boolean
  customer: {
    id: string
    name: string
    email: string
    createdAt: string
    isActive: boolean
  } | null
  userAccount: {
    id: string
    email: string
    role: string
    createdAt: string
  } | null
  counts: {
    orders: number
    archivedOrders: number
    paymentTransactions: number
    saasMemberships: number
    websiteLicenses: number
    contactMessages: number
    downloadLogs: number
    customerAddresses: number
  }
  paymentMethodBreakdown: {
    bankTransfer: number
    paytr: number
  }
  protectedPaytrOrderCount: number
  totals: {
    lastOrderDate: string | null
    totalPaidAmount: number
    currency: string
  }
  previewOrders: Array<{
    id: string
    orderNo: string
    status: string
    paymentProvider: string
    total: number
    currency: string
    createdAt: string
    archivedAt: string | null
    isProtected: boolean
  }>
  previewSaasMemberships: Array<{
    id: string
    productCode: string
    tenantSlug: string
    status: string
    licenseEndDate: string
  }>
  previewLicenses: Array<{
    id: string
    licenseKey: string
    productName: string
    status: string
    source: string
  }>
  warnings: string[]
}

export type TestDataCleanupResult = {
  email: string
  deleted: {
    orders: number
    paymentTransactions: number
    saasMemberships: number
    websiteLicenses: number
    contactMessages: number
    downloadLogs: number
    customers: number
    userAccounts: number
  }
  skipped: {
    protectedPaytrOrders: number
  }
  warnings: string[]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeCleanupEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidCleanupEmail(email: string): boolean {
  return EMAIL_RE.test(normalizeCleanupEmail(email))
}

export function isLikelyTestEmail(email: string): boolean {
  const e = normalizeCleanupEmail(email)
  return e.endsWith('@woontegra.test') || e.includes('test-') || e.includes('e2e.')
}

function orderWhereForEmail(email: string): Prisma.OrderWhereInput {
  const normalized = normalizeCleanupEmail(email)
  return {
    OR: [
      { customerEmail: { equals: normalized, mode: 'insensitive' } },
      { customer: { is: { email: { equals: normalized, mode: 'insensitive' } } } },
    ],
  }
}

function licenseWhereForEmail(email: string, customerId?: string | null): Prisma.LicenseWhereInput {
  const normalized = normalizeCleanupEmail(email)
  const parts: Prisma.LicenseWhereInput[] = [{ customerEmail: { equals: normalized, mode: 'insensitive' } }]
  if (customerId) parts.push({ customerId })
  return { OR: parts }
}

type OrderWithPayments = {
  id: string
  orderNo: string
  status: OrderStatus
  paymentProvider: PaymentProvider
  total: Prisma.Decimal
  currency: string
  createdAt: Date
  archivedAt: Date | null
  paymentTransactions: { id: string; provider: PaymentProvider; status: PaymentTransactionStatus }[]
}

export function isProtectedPaytrOrder(order: OrderWithPayments): boolean {
  if (order.paymentProvider !== PaymentProvider.PAYTR) return false
  return order.paymentTransactions.some(
    (tx) => tx.provider === PaymentProvider.PAYTR && tx.status === PaymentTransactionStatus.SUCCESS,
  )
}

async function loadContext(email: string) {
  const normalizedEmail = normalizeCleanupEmail(email)
  const orderWhere = orderWhereForEmail(normalizedEmail)

  const customer = await prisma.customer.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      isActive: true,
      _count: { select: { addresses: true } },
    },
  })

  const userAccount = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    select: { id: true, email: true, role: true, createdAt: true },
  })

  const [
    orders,
    saasMemberships,
    websiteLicenses,
    contactMessages,
  ] = await Promise.all([
    prisma.order.findMany({
      where: orderWhere,
      include: {
        paymentTransactions: {
          select: { id: true, provider: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.customerSaasMembership.findMany({
      where: customer
        ? { customerId: customer.id }
        : { ownerEmail: { equals: normalizedEmail, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.license.findMany({
      where: licenseWhereForEmail(normalizedEmail, customer?.id),
      orderBy: { createdAt: 'desc' },
    }),
    prisma.contactMessage.count({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    }),
  ])

  const orderIds = orders.map((o) => o.id)
  const [paymentTransactions, downloadLogs] = await Promise.all([
    orderIds.length
      ? prisma.paymentTransaction.count({ where: { orderId: { in: orderIds } } })
      : Promise.resolve(0),
    prisma.downloadLog.count({
      where: {
        OR: [
          { customerEmail: { equals: normalizedEmail, mode: 'insensitive' } },
          ...(orderIds.length ? [{ orderId: { in: orderIds } }] : []),
        ],
      },
    }),
  ])

  return {
    normalizedEmail,
    customer,
    userAccount,
    orders,
    paymentTransactions,
    saasMemberships,
    websiteLicenses,
    contactMessages,
    downloadLogs,
  }
}

function buildPreviewFromContext(
  email: string,
  ctx: Awaited<ReturnType<typeof loadContext>>,
): TestDataCleanupPreview {
  const { normalizedEmail, customer, userAccount, orders, saasMemberships, websiteLicenses } = ctx
  const protectedOrders = orders.filter((o) => isProtectedPaytrOrder(o))
  const hasProtectedPaytrPayments = protectedOrders.length > 0
  const isTest = isLikelyTestEmail(normalizedEmail)

  let bankTransfer = 0
  let paytr = 0
  let totalPaid = 0
  let currency = 'TRY'
  let lastOrderDate: Date | null = null

  for (const order of orders) {
    if (order.paymentProvider === PaymentProvider.BANK_TRANSFER) bankTransfer += 1
    else if (order.paymentProvider === PaymentProvider.PAYTR) paytr += 1
    if (order.status === OrderStatus.PAID || order.status === OrderStatus.PROCESSING) {
      totalPaid += Number(order.total)
      currency = order.currency || currency
    }
    if (!lastOrderDate || order.createdAt > lastOrderDate) lastOrderDate = order.createdAt
  }

  const warnings: string[] = [
    'Masaüstü lisansların gerçek yönetimi merkezi lisans sistemindedir. Bu araç yalnızca website veritabanındaki test kayıtlarını temizler.',
    'SaaS tenant/provision tarafında ayrıca temizlik gerekebilir.',
  ]

  if (hasProtectedPaytrPayments) {
    warnings.push(
      `${protectedOrders.length} siparişte başarılı PayTR ödemesi var. Bu kayıtlar varsayılan olarak silinmez.`,
    )
  }
  if (!isTest) {
    warnings.push('Bu e-posta test desenine uymuyor. Temizlik için ekstra onay gerekir.')
  }
  if (userAccount && (userAccount.role === 'admin' || userAccount.role === 'superadmin')) {
    warnings.push('Bu e-posta bir admin kullanıcı hesabına bağlı. User silme seçeneği dikkatle kullanılmalı.')
  }

  return {
    email: email.trim(),
    normalizedEmail,
    isLikelyTestEmail: isTest,
    requiresExtraConfirmation: !isTest || hasProtectedPaytrPayments,
    hasProtectedPaytrPayments,
    customer: customer
      ? {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          createdAt: customer.createdAt.toISOString(),
          isActive: customer.isActive,
        }
      : null,
    userAccount: userAccount
      ? {
          id: userAccount.id,
          email: userAccount.email,
          role: userAccount.role,
          createdAt: userAccount.createdAt.toISOString(),
        }
      : null,
    counts: {
      orders: orders.filter((o) => !o.archivedAt).length,
      archivedOrders: orders.filter((o) => o.archivedAt).length,
      paymentTransactions: ctx.paymentTransactions,
      saasMemberships: saasMemberships.length,
      websiteLicenses: websiteLicenses.length,
      contactMessages: ctx.contactMessages,
      downloadLogs: ctx.downloadLogs,
      customerAddresses: customer?._count.addresses ?? 0,
    },
    paymentMethodBreakdown: { bankTransfer, paytr },
    protectedPaytrOrderCount: protectedOrders.length,
    totals: {
      lastOrderDate: lastOrderDate?.toISOString() ?? null,
      totalPaidAmount: totalPaid,
      currency,
    },
    previewOrders: orders.slice(0, 20).map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      status: o.status,
      paymentProvider: o.paymentProvider,
      total: Number(o.total),
      currency: o.currency,
      createdAt: o.createdAt.toISOString(),
      archivedAt: o.archivedAt?.toISOString() ?? null,
      isProtected: isProtectedPaytrOrder(o),
    })),
    previewSaasMemberships: saasMemberships.slice(0, 20).map((m) => ({
      id: m.id,
      productCode: m.productCode,
      tenantSlug: m.tenantSlug,
      status: m.status,
      licenseEndDate: m.licenseEndDate.toISOString(),
    })),
    previewLicenses: websiteLicenses.slice(0, 20).map((l) => ({
      id: l.id,
      licenseKey: l.licenseKey,
      productName: l.productName,
      status: l.status,
      source: l.source,
    })),
    warnings,
  }
}

function hasAnyCleanupOption(options: TestDataCleanupOptions): boolean {
  return Boolean(
    options.deleteOrders ||
      options.deletePayments ||
      options.deleteSaasMemberships ||
      options.deleteWebsiteLicenses ||
      options.deleteCustomer ||
      options.deleteUserAccount ||
      options.deleteContactMessages,
  )
}

export const testDataCleanupAdminService = {
  async preview(email: string): Promise<TestDataCleanupPreview> {
    const normalized = normalizeCleanupEmail(email)
    if (!isValidCleanupEmail(normalized)) {
      throw new Error('Geçerli bir e-posta adresi girin')
    }
    const ctx = await loadContext(normalized)
    return buildPreviewFromContext(email, ctx)
  },

  async cleanup(input: {
    email: string
    confirmEmail: string
    options: TestDataCleanupOptions
    forceRealEmailCleanup?: boolean
  }): Promise<TestDataCleanupResult> {
    const normalized = normalizeCleanupEmail(input.email)
    const confirm = normalizeCleanupEmail(input.confirmEmail)

    if (!isValidCleanupEmail(normalized)) {
      throw new Error('Geçerli bir e-posta adresi girin')
    }
    if (confirm !== normalized) {
      throw new Error('Onay e-postası eşleşmiyor')
    }
    if (!hasAnyCleanupOption(input.options)) {
      throw new Error('En az bir temizlik seçeneği işaretlenmeli')
    }

    const ctx = await loadContext(normalized)
    const preview = buildPreviewFromContext(input.email, ctx)
    const force = input.forceRealEmailCleanup === true

    if (preview.requiresExtraConfirmation && !force) {
      throw new Error(
        preview.hasProtectedPaytrPayments
          ? 'Başarılı PayTR ödemesi olan kayıtlar var. Devam etmek için ekstra onay gerekir.'
          : 'Gerçek e-posta temizliği için ekstra onay gerekir.',
      )
    }

    const orderIds = ctx.orders.map((o) => o.id)
    const deletableOrderIds = ctx.orders.filter((o) => !isProtectedPaytrOrder(o) || force).map((o) => o.id)
    const protectedCount = ctx.orders.filter((o) => isProtectedPaytrOrder(o) && !force).length

    const result: TestDataCleanupResult = {
      email: input.email.trim(),
      deleted: {
        orders: 0,
        paymentTransactions: 0,
        saasMemberships: 0,
        websiteLicenses: 0,
        contactMessages: 0,
        downloadLogs: 0,
        customers: 0,
        userAccounts: 0,
      },
      skipped: { protectedPaytrOrders: protectedCount },
      warnings: [...preview.warnings],
    }

    await prisma.$transaction(async (tx) => {
      if (input.options.deleteSaasMemberships && ctx.saasMemberships.length > 0) {
        const ids = ctx.saasMemberships.map((m) => m.id)
        await tx.orderItem.updateMany({
          where: { saasMembershipId: { in: ids } },
          data: { saasMembershipId: null },
        })
        const deleted = await tx.customerSaasMembership.deleteMany({ where: { id: { in: ids } } })
        result.deleted.saasMemberships = deleted.count
      }

      if (input.options.deleteWebsiteLicenses && ctx.websiteLicenses.length > 0) {
        const ids = ctx.websiteLicenses.map((l) => l.id)
        const deleted = await tx.license.deleteMany({ where: { id: { in: ids } } })
        result.deleted.websiteLicenses = deleted.count
      }

      if (input.options.deletePayments && !input.options.deleteOrders && deletableOrderIds.length > 0) {
        const deleted = await tx.paymentTransaction.deleteMany({
          where: { orderId: { in: deletableOrderIds } },
        })
        result.deleted.paymentTransactions = deleted.count
      }

      if (input.options.deleteOrders && deletableOrderIds.length > 0) {
        if (orderIds.length > 0) {
          const dl = await tx.downloadLog.deleteMany({
            where: {
              OR: [
                { customerEmail: { equals: normalized, mode: 'insensitive' } },
                { orderId: { in: deletableOrderIds } },
              ],
            },
          })
          result.deleted.downloadLogs += dl.count
        }
        const deleted = await tx.order.deleteMany({ where: { id: { in: deletableOrderIds } } })
        result.deleted.orders = deleted.count
      }

      if (input.options.deleteContactMessages) {
        const deleted = await tx.contactMessage.deleteMany({
          where: { email: { equals: normalized, mode: 'insensitive' } },
        })
        result.deleted.contactMessages = deleted.count
      }

      if (input.options.deleteCustomer && ctx.customer) {
        const remainingOrders = await tx.order.count({
          where: {
            OR: [
              { customerId: ctx.customer.id },
              { customerEmail: { equals: normalized, mode: 'insensitive' } },
            ],
          },
        })
        const remainingSaas = await tx.customerSaasMembership.count({
          where: { customerId: ctx.customer.id },
        })
        const remainingLicenses = await tx.license.count({
          where: licenseWhereForEmail(normalized, ctx.customer.id),
        })

        if (remainingOrders > 0 || remainingSaas > 0 || remainingLicenses > 0) {
          throw new Error(
            'Customer silinemedi: ilişkili sipariş, SaaS veya lisans kayıtları kaldı. Önce ilgili seçenekleri işaretleyin.',
          )
        }

        await tx.customer.delete({ where: { id: ctx.customer.id } })
        result.deleted.customers = 1
      }

      if (input.options.deleteUserAccount && ctx.userAccount) {
        await tx.user.delete({ where: { id: ctx.userAccount.id } })
        result.deleted.userAccounts = 1
      }
    })

    return result
  },
}
