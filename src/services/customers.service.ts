import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { PaymentProvider, Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { maskLicenseKeyForDisplay } from '../lib/licenseKey'
import { resolveCustomerOrderDownloadMeta } from '../lib/customerOrderDownload'
import { getBankTransferCustomerInfo } from './bankTransferSettings.service'
import { mailService } from './mail.service'
import { resolveOrderPaymentRowStatus } from './orders.service'
import { fetchLicenseServerCustomerLicenses } from './woontegraLicenseServer.client'
import { listCustomerSaasMemberships } from './customerSaasMembership.service'
import { createSaasRenewOrder, getSaasRenewQuote as fetchSaasRenewQuote } from './customerSaasRenewal.service'

const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-in-production'
const SALT_ROUNDS = 10

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

function signCustomerToken(id: string, email: string) {
  return jwt.sign({ customerId: id, email }, JWT_SECRET, { audience: 'customer', expiresIn: '7d' })
}

function customerOrderWhere(customerId: string, orderNo?: string) {
  return {
    archivedAt: null,
    customerId,
    ...(orderNo ? { orderNo: orderNo.trim() } : {}),
  }
}

function collectMaskedLicenseKeysFromOrder(order: {
  id: string
  items: Array<{ licenseServerLicenseKey: string | null }>
}): string[] {
  const keys = new Set<string>()
  for (const item of order.items) {
    const central = item.licenseServerLicenseKey?.trim()
    if (central) keys.add(maskLicenseKeyForDisplay(central))
  }
  return [...keys]
}

export type CustomerLicenseListItem = {
  id: string | null
  licenseKeyMasked: string | null
  productName: string
  programName: string | null
  appCode: string | null
  orderNo: string
  status: string
  expiresAt: string | null
  maxDevices: number | null
  createdAt: string
  source: 'central' | 'local'
}

function mapCustomer(c: { id: string; name: string; email: string; phone: string | null; createdAt: Date }) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    createdAt: c.createdAt.toISOString(),
  }
}

async function buildLocalLicenseRowsForOrder(
  order: { id: string; orderNo: string; createdAt: Date },
  licenseItems: Array<{
    productName: string
    licenseServerLicenseKey: string | null
    product: { licenseRequired: boolean | null; licenseAppCode: string | null } | null
  }>,
  prefetchedLocalRows?: Array<{
    id: string
    licenseKey: string
    productName: string
    status: string
    expiresAt: Date | null
    maxDevices: number | null
    createdAt: Date
  }>,
): Promise<CustomerLicenseListItem[]> {
  const localRows =
    prefetchedLocalRows ??
    (await prisma.license.findMany({
      where: { orderId: order.id },
      orderBy: [{ orderItemId: 'asc' }, { unitIndex: 'asc' }],
      select: {
        id: true,
        licenseKey: true,
        productName: true,
        status: true,
        expiresAt: true,
        maxDevices: true,
        createdAt: true,
      },
    }))

  if (localRows.length > 0) {
    return localRows.map((row) => ({
      id: row.id,
      licenseKeyMasked: maskLicenseKeyForDisplay(row.licenseKey),
      productName: row.productName,
      programName: null,
      appCode: null,
      orderNo: order.orderNo,
      status: row.status,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      maxDevices: row.maxDevices,
      createdAt: row.createdAt.toISOString(),
      source: 'local' as const,
    }))
  }

  const itemsWithKeys = licenseItems.filter((item) => item.licenseServerLicenseKey?.trim())
  if (itemsWithKeys.length > 0) {
    return itemsWithKeys.map((item) => ({
      id: null,
      licenseKeyMasked: maskLicenseKeyForDisplay(item.licenseServerLicenseKey!.trim()),
      productName: item.productName,
      programName: null,
      appCode: item.product?.licenseAppCode ?? null,
      orderNo: order.orderNo,
      status: 'ACTIVE',
      expiresAt: null,
      maxDevices: null,
      createdAt: order.createdAt.toISOString(),
      source: 'local' as const,
    }))
  }

  const primary = licenseItems[0]!
  return [
    {
      id: null,
      licenseKeyMasked: null,
      productName: primary.productName,
      programName: null,
      appCode: primary.product?.licenseAppCode ?? null,
      orderNo: order.orderNo,
      status: 'PENDING',
      expiresAt: null,
      maxDevices: null,
      createdAt: order.createdAt.toISOString(),
      source: 'local' as const,
    },
  ]
}

export const customersService = {
  async register(input: { name: string; email: string; password: string; phone?: string | null }) {
    const email = input.email.trim().toLowerCase()
    const name = input.name.trim()
    if (name.length < 2) throw new Error('Ad soyad en az 2 karakter olmalıdır')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Geçerli bir e-posta girin')
    if (!input.password || input.password.length < 8) throw new Error('Şifre en az 8 karakter olmalıdır')

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS)
    try {
      const c = await prisma.customer.create({
        data: {
          name,
          email,
          passwordHash,
          phone: input.phone?.trim() || null,
        },
      })
      const token = signCustomerToken(c.id, c.email)
      const result = { token, customer: mapCustomer(c) }

      void mailService
        .sendCustomerWelcomeEmail({ customerName: name, customerEmail: email })
        .catch((err) => {
          console.error('[customers] Hoş geldin e-postası gönderilemedi', {
            email,
            error: err instanceof Error ? err.message : err,
          })
        })

      return result
    } catch (e) {
      if (isUniqueViolation(e)) throw new Error('Bu e-posta adresi zaten kayıtlı')
      throw e
    }
  },

  async login(email: string, password: string) {
    const em = email.trim().toLowerCase()
    const c = await prisma.customer.findUnique({ where: { email: em } })
    if (!c || !c.isActive) {
      throw new Error('E-posta veya şifre hatalı')
    }
    const ok = await bcrypt.compare(password, c.passwordHash)
    if (!ok) throw new Error('E-posta veya şifre hatalı')
    const token = signCustomerToken(c.id, c.email)
    return { token, customer: mapCustomer(c) }
  },

  async getMe(customerId: string) {
    const c = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, email: true, phone: true, createdAt: true },
    })
    if (!c) throw new Error('Hesap bulunamadı')
    return mapCustomer(c)
  },

  async patchMe(
    customerId: string,
    body: { name?: string; phone?: string | null; email?: string; currentPassword?: string },
  ) {
    const c = await prisma.customer.findUnique({ where: { id: customerId } })
    if (!c) throw new Error('Hesap bulunamadı')

    const patch: Prisma.CustomerUpdateInput = {}
    if (typeof body.name === 'string' && body.name.trim().length >= 2) {
      patch.name = body.name.trim()
    }
    if (body.phone !== undefined) {
      patch.phone = body.phone === null || body.phone === '' ? null : String(body.phone).trim()
    }

    if (typeof body.email === 'string' && body.email.trim().toLowerCase() !== c.email) {
      const nextEmail = body.email.trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) throw new Error('Geçerli bir e-posta girin')
      if (!body.currentPassword) throw new Error('E-posta değişikliği için mevcut şifre gerekli')
      const ok = await bcrypt.compare(body.currentPassword, c.passwordHash)
      if (!ok) throw new Error('Mevcut şifre hatalı')
      patch.email = nextEmail
    }

    if (Object.keys(patch).length === 0) {
      return mapCustomer({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        createdAt: c.createdAt,
      })
    }

    try {
      const updated = await prisma.customer.update({
        where: { id: customerId },
        data: patch,
        select: { id: true, name: true, email: true, phone: true, createdAt: true },
      })
      return mapCustomer(updated)
    } catch (e) {
      if (isUniqueViolation(e)) throw new Error('Bu e-posta adresi kullanımda')
      throw e
    }
  },

  async changePassword(customerId: string, currentPassword: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8) throw new Error('Yeni şifre en az 8 karakter olmalıdır')
    const c = await prisma.customer.findUnique({ where: { id: customerId } })
    if (!c) throw new Error('Hesap bulunamadı')
    const ok = await bcrypt.compare(currentPassword, c.passwordHash)
    if (!ok) throw new Error('Mevcut şifre hatalı')
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS)
    await prisma.customer.update({ where: { id: customerId }, data: { passwordHash } })
    return { success: true }
  },

  async listAddresses(customerId: string) {
    const rows = await prisma.customerAddress.findMany({
      where: { customerId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    })
    return rows.map((a) => ({
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
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }))
  },

  async createAddress(
    customerId: string,
    data: {
      title: string
      fullName: string
      phone?: string | null
      city: string
      district?: string | null
      addressLine: string
      postalCode?: string | null
      taxOffice?: string | null
      taxNumber?: string | null
      companyName?: string | null
      isDefault?: boolean
    },
  ) {
    const isDefault = !!data.isDefault
    return prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } })
      }
      const a = await tx.customerAddress.create({
        data: {
          customerId,
          title: data.title.trim(),
          fullName: data.fullName.trim(),
          phone: data.phone?.trim() || null,
          city: data.city.trim(),
          district: data.district?.trim() || null,
          addressLine: data.addressLine.trim(),
          postalCode: data.postalCode?.trim() || null,
          taxOffice: data.taxOffice?.trim() || null,
          taxNumber: data.taxNumber?.trim() || null,
          companyName: data.companyName?.trim() || null,
          isDefault,
        },
      })
      return a
    })
  },

  async patchAddress(
    customerId: string,
    addressId: string,
    data: Partial<{
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
    }>,
  ) {
    const existing = await prisma.customerAddress.findFirst({ where: { id: addressId, customerId } })
    if (!existing) throw new Error('Adres bulunamadı')

    return prisma.$transaction(async (tx) => {
      if (data.isDefault === true) {
        await tx.customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } })
      }
      const patch: Prisma.CustomerAddressUpdateInput = {}
      if (data.title !== undefined) patch.title = data.title.trim()
      if (data.fullName !== undefined) patch.fullName = data.fullName.trim()
      if (data.phone !== undefined) patch.phone = data.phone === null ? null : data.phone.trim()
      if (data.city !== undefined) patch.city = data.city.trim()
      if (data.district !== undefined) patch.district = data.district === null ? null : data.district.trim()
      if (data.addressLine !== undefined) patch.addressLine = data.addressLine.trim()
      if (data.postalCode !== undefined) patch.postalCode = data.postalCode === null ? null : data.postalCode.trim()
      if (data.taxOffice !== undefined) patch.taxOffice = data.taxOffice === null ? null : data.taxOffice.trim()
      if (data.taxNumber !== undefined) patch.taxNumber = data.taxNumber === null ? null : data.taxNumber.trim()
      if (data.companyName !== undefined) patch.companyName = data.companyName === null ? null : data.companyName.trim()
      if (data.isDefault !== undefined) patch.isDefault = data.isDefault

      const a = await tx.customerAddress.update({ where: { id: addressId }, data: patch })
      return a
    })
  },

  async deleteAddress(customerId: string, addressId: string) {
    const r = await prisma.customerAddress.deleteMany({ where: { id: addressId, customerId } })
    if (r.count === 0) throw new Error('Adres bulunamadı')
  },

  async listOrders(customerId: string) {
    const rows = await prisma.order.findMany({
      where: customerOrderWhere(customerId),
      orderBy: { createdAt: 'desc' },
      include: {
        paymentTransactions: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } },
        items: {
          orderBy: { id: 'asc' },
          select: {
            productName: true,
            product: { select: { productType: true } },
          },
        },
      },
    })
    return rows.map((o) => {
      const names = o.items.map((i) => i.productName).filter(Boolean)
      const first = names[0]?.trim() ?? 'Ürün'
      const extra = names.length > 1 ? names.length - 1 : 0
      const productSummary = extra > 0 ? `${first} ve ${extra} ürün daha` : first
      const types = o.items.map((i) => i.product?.productType ?? null).filter(Boolean) as string[]
      return {
        orderNo: o.orderNo,
        status: o.status,
        total: Number(o.total),
        currency: o.currency,
        createdAt: o.createdAt.toISOString(),
        paymentStatus: resolveOrderPaymentRowStatus(o),
        paymentProvider: o.paymentProvider,
        productSummary,
        itemCount: o.items.length,
        shippingCarrier: o.shippingCarrier,
        shippingTrackingNumber: o.shippingTrackingNumber,
        shippingStatus: o.shippingStatus,
        lineProductTypes: types,
      }
    })
  },

  async getMyOrder(customerId: string, orderNo: string) {
    const order = await prisma.order.findFirst({
      where: customerOrderWhere(customerId, orderNo),
      include: {
        items: {
          orderBy: { id: 'asc' },
          include: { product: { select: { productType: true, downloadFiles: true } } },
        },
        paymentTransactions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    })
    if (!order) {
      const err = new Error('Sipariş bulunamadı') as Error & { status: number }
      err.status = 404
      throw err
    }
    const bankPending =
      order.paymentProvider === PaymentProvider.BANK_TRANSFER && order.status === 'PENDING'
    const bankTransferInfo = bankPending
      ? await getBankTransferCustomerInfo({
          orderNo: order.orderNo,
          total: Number(order.total),
          currency: order.currency,
        })
      : null

    const paidLike = order.status === 'PAID' || order.status === 'PROCESSING'
    let licenseCodesMasked: string[] | undefined
    if (paidLike) {
      const keys = new Set<string>()
      const licenseRows = await prisma.license.findMany({
        where: { orderId: order.id },
        orderBy: [{ orderItemId: 'asc' }, { unitIndex: 'asc' }],
        select: { licenseKey: true },
      })
      for (const row of licenseRows) keys.add(maskLicenseKeyForDisplay(row.licenseKey))
      for (const key of collectMaskedLicenseKeysFromOrder(order)) keys.add(key)
      if (keys.size > 0) licenseCodesMasked = [...keys]
    }

    return {
      orderNo: order.orderNo,
      status: order.status,
      total: Number(order.total),
      subtotal: Number(order.subtotal),
      currency: order.currency,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      billingType: order.billingType,
      companyName: order.companyName,
      taxOffice: order.taxOffice,
      taxNumber: order.taxNumber,
      paidAt: order.paidAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      paymentStatus: resolveOrderPaymentRowStatus(order),
      paymentProvider: order.paymentProvider,
      paymentConfirmedAt: order.paymentConfirmedAt?.toISOString() ?? null,
      bankTransferPaymentDate: order.bankTransferPaymentDate?.toISOString() ?? null,
      shippingCarrier: order.shippingCarrier,
      shippingTrackingNumber: order.shippingTrackingNumber,
      shippingStatus: order.shippingStatus,
      bankTransferInfo,
      licenseCodesMasked,
      items: order.items.map((i) => {
        const paidDelivery = order.status === 'PAID' || order.status === 'PROCESSING'
        const downloadUrl = paidDelivery ? i.downloadUrl : null
        const downloadMeta = paidDelivery && downloadUrl
          ? resolveCustomerOrderDownloadMeta({ downloadUrl, product: i.product })
          : null
        return {
          productName: i.productName,
          productSlug: i.productSlug,
          productType: i.product?.productType ?? null,
          quantity: i.quantity,
          unitPrice: Number(i.unitPrice),
          total: Number(i.total),
          downloadUrl,
          downloadKind: downloadMeta?.downloadKind ?? null,
          downloadLabel: downloadMeta?.downloadLabel ?? null,
          downloadButtonLabel: downloadMeta?.downloadButtonLabel ?? null,
        }
      }),
    }
  },

  async listLicenses(customerId: string, customerEmailHint?: string): Promise<CustomerLicenseListItem[]> {
    const orders = await prisma.order.findMany({
      where: {
        ...customerOrderWhere(customerId),
        status: { in: ['PAID', 'PROCESSING'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        items: {
          orderBy: { id: 'asc' },
          select: {
            productName: true,
            licenseServerLicenseKey: true,
            product: { select: { licenseRequired: true, licenseAppCode: true } },
          },
        },
      },
    })

    const licenseOrders = orders.filter((order) =>
      order.items.some(
        (item) => item.product?.licenseRequired || Boolean(item.licenseServerLicenseKey?.trim()),
      ),
    )
    if (licenseOrders.length === 0) return []

    const orderIds = licenseOrders.map((o) => o.id)
    const allLocalLicenses = await prisma.license.findMany({
      where: { orderId: { in: orderIds } },
      orderBy: [{ orderItemId: 'asc' }, { unitIndex: 'asc' }],
      select: {
        orderId: true,
        id: true,
        licenseKey: true,
        productName: true,
        status: true,
        expiresAt: true,
        maxDevices: true,
        createdAt: true,
      },
    })
    const localByOrderId = new Map<string, typeof allLocalLicenses>()
    for (const row of allLocalLicenses) {
      if (!row.orderId) continue
      const bucket = localByOrderId.get(row.orderId) ?? []
      bucket.push(row)
      localByOrderId.set(row.orderId, bucket)
    }

    const rows: CustomerLicenseListItem[] = []
    const orderNoSet = new Set<string>()

    for (const order of licenseOrders) {
      const licenseItems = order.items.filter(
        (item) => item.product?.licenseRequired || Boolean(item.licenseServerLicenseKey?.trim()),
      )
      orderNoSet.add(order.orderNo)
      const localRows = await buildLocalLicenseRowsForOrder(
        order,
        licenseItems,
        localByOrderId.get(order.id),
      )
      rows.push(...localRows)
    }

    const hasUsableLocal = rows.some(
      (r) => Boolean(r.licenseKeyMasked?.trim()) && r.status !== 'PENDING',
    )
    if (hasUsableLocal) {
      return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    }

    const customerEmail =
      customerEmailHint?.trim().toLowerCase() ??
      (
        await prisma.customer.findUnique({
          where: { id: customerId },
          select: { email: true },
        })
      )?.email?.trim().toLowerCase() ??
      ''
    if (!customerEmail || orderNoSet.size === 0) {
      return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    }

    const central = await fetchLicenseServerCustomerLicenses(customerEmail)
    if (central.error) {
      console.warn('[customers] license server fetch skipped or failed', {
        customerId,
        error: central.error,
      })
      return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    }

    const centralByOrderNo = new Map<string, typeof central.licenses>()
    for (const lic of central.licenses) {
      const orderNo = lic.websiteOrderNo?.trim()
      if (!orderNo || !orderNoSet.has(orderNo)) continue
      const bucket = centralByOrderNo.get(orderNo) ?? []
      bucket.push(lic)
      centralByOrderNo.set(orderNo, bucket)
    }

    for (const [orderNo, centralMatches] of centralByOrderNo) {
      const localForOrder = rows.filter((r) => r.orderNo === orderNo)
      if (localForOrder.length === 0) {
        for (const lic of centralMatches) {
          rows.push({
            id: lic.id ?? null,
            licenseKeyMasked: lic.licenseKeyMasked,
            productName: lic.productName,
            programName: lic.programName,
            appCode: lic.appCode || null,
            orderNo,
            status: lic.status,
            expiresAt: lic.expiresAt || null,
            maxDevices: lic.maxDevices,
            createdAt: lic.createdAt,
            source: 'central',
          })
        }
        continue
      }

      const hasUsableLocal = localForOrder.some(
        (r) => Boolean(r.licenseKeyMasked?.trim()) && r.status !== 'PENDING',
      )
      if (hasUsableLocal) continue

      for (let i = 0; i < centralMatches.length; i++) {
        const lic = centralMatches[i]!
        const target = localForOrder[i]
        if (target) {
          target.id = lic.id ?? null
          target.licenseKeyMasked = lic.licenseKeyMasked
          target.productName = lic.productName
          target.programName = lic.programName
          target.appCode = lic.appCode || null
          target.status = lic.status
          target.expiresAt = lic.expiresAt || null
          target.maxDevices = lic.maxDevices
          target.createdAt = lic.createdAt
          target.source = 'central'
        } else {
          rows.push({
            id: lic.id ?? null,
            licenseKeyMasked: lic.licenseKeyMasked,
            productName: lic.productName,
            programName: lic.programName,
            appCode: lic.appCode || null,
            orderNo,
            status: lic.status,
            expiresAt: lic.expiresAt || null,
            maxDevices: lic.maxDevices,
            createdAt: lic.createdAt,
            source: 'central',
          })
        }
      }
    }

    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  async listFavorites(customerId: string) {
    const rows = await prisma.customerFavorite.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            price: true,
            currency: true,
            coverImage: true,
            coverImageMedia: { select: { url: true } },
            isActive: true,
          },
        },
      },
    })
    return rows
      .filter((r) => r.product.isActive)
      .map((r) => ({
        id: r.id,
        productId: r.product.id,
        name: r.product.name,
        slug: r.product.slug,
        price: Number(r.product.price),
        currency: r.product.currency,
        coverImage: r.product.coverImageMedia?.url?.trim() || r.product.coverImage?.trim() || null,
        createdAt: r.createdAt.toISOString(),
      }))
  },

  async addFavorite(customerId: string, productId: string) {
    const p = await prisma.product.findFirst({
      where: { id: productId, isActive: true },
      select: { id: true },
    })
    if (!p) throw new Error('Ürün bulunamadı')
    try {
      await prisma.customerFavorite.create({ data: { customerId, productId: p.id } })
    } catch (e) {
      if (isUniqueViolation(e)) return { ok: true, already: true }
      throw e
    }
    return { ok: true }
  },

  async removeFavorite(customerId: string, productId: string) {
    await prisma.customerFavorite.deleteMany({ where: { customerId, productId } })
  },

  async isFavorite(customerId: string, productId: string): Promise<boolean> {
    const n = await prisma.customerFavorite.count({ where: { customerId, productId } })
    return n > 0
  },

  async listSaasMemberships(customerId: string) {
    return listCustomerSaasMemberships(customerId)
  },

  async getSaasRenewQuote(customerId: string, membershipId: string, renewalPeriod: string) {
    return fetchSaasRenewQuote(customerId, membershipId, renewalPeriod)
  },

  async createSaasRenewOrder(input: Parameters<typeof createSaasRenewOrder>[0]) {
    return createSaasRenewOrder(input)
  },
}
