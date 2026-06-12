import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-in-production'
const SALT_ROUNDS = 10

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

function signCustomerToken(id: string, email: string) {
  return jwt.sign({ customerId: id, email }, JWT_SECRET, { audience: 'customer', expiresIn: '7d' })
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
      return { token, customer: mapCustomer(c) }
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
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: { paymentTransactions: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } } },
    })
    return rows.map((o) => ({
      orderNo: o.orderNo,
      status: o.status,
      total: Number(o.total),
      currency: o.currency,
      createdAt: o.createdAt.toISOString(),
      paymentStatus: o.paymentTransactions[0]?.status ?? null,
    }))
  },

  async getMyOrder(customerId: string, orderNo: string) {
    const order = await prisma.order.findFirst({
      where: { orderNo: orderNo.trim(), customerId },
      include: {
        items: { orderBy: { id: 'asc' } },
        paymentTransactions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    })
    if (!order) {
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
      createdAt: order.createdAt.toISOString(),
      paymentTransactionStatus: pay?.status ?? null,
      items: order.items.map((i) => ({
        productName: i.productName,
        productSlug: i.productSlug,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        total: Number(i.total),
        downloadUrl: order.status === 'PAID' ? i.downloadUrl : null,
      })),
    }
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
        coverImage: r.product.coverImage,
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
}
