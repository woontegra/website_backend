import { randomUUID } from 'crypto'
import { OrderStatus, Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { resolveCartProductKeys } from '../lib/resolveCartProductKeys'
import { assertSingleLicenseQuantityOrThrow } from '../lib/productOrderValidation'
import {
  type CouponCartLine,
  type CouponCheckoutRule,
  type CouponDiscountType,
  type CouponQuote,
  type CouponUsageCounts,
  evaluateCouponQuote,
} from '../lib/couponCheckout'
import { campaignsService } from './campaigns.service'

const USAGE_EXCLUDED: OrderStatus[] = [OrderStatus.CANCELLED, OrderStatus.FAILED]

export class CouponValidationError extends Error {
  status = 400
  publicMessage: string
  constructor(message: string) {
    super(message)
    this.name = 'CouponValidationError'
    this.publicMessage = message
  }
}

function fail(message: string, status = 400): never {
  const err = new CouponValidationError(message)
  err.status = status
  throw err
}

function asDiscountType(value: unknown): CouponDiscountType {
  if (value === 'fixed_amount') return 'fixed_amount'
  if (value === 'percent') return 'percent'
  fail('İndirim tipi yüzde veya sabit tutar olmalıdır')
}

function readMoney(value: unknown, label: string): Prisma.Decimal {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) fail(`${label} geçersiz`)
  return new Prisma.Decimal(n.toFixed(2))
}

function readOptionalMoney(value: unknown): Prisma.Decimal | null {
  if (value == null || value === '') return null
  return readMoney(value, 'Tutar')
}

function readOptionalInt(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0) fail('Limit sıfır veya pozitif bir tam sayı olmalıdır')
  return n
}

function readDate(value: unknown): Date | null {
  if (value == null || value === '') return null
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) fail('Tarih geçersiz')
  return d
}

type CouponRow = Prisma.CouponGetPayload<{ include: { products: { include: { product: { select: { id: true; name: true } } } } } }>

function toAdmin(row: CouponRow) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    adminNote: row.adminNote,
    isActive: row.isActive,
    discountType: row.discountType,
    discountValue: Number(row.discountValue),
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    usageLimit: row.usageLimit,
    perCustomerLimit: row.perCustomerLimit,
    firstPurchaseOnly: row.firstPurchaseOnly,
    minimumCartTotal: row.minimumCartTotal != null ? Number(row.minimumCartTotal) : null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    productIds: row.products.map((item) => item.productId),
    products: row.products.map((item) => ({ id: item.product.id, name: item.product.name })),
  }
}

function toRule(row: CouponRow): CouponCheckoutRule {
  const discountType = row.discountType === 'fixed_amount' ? 'fixed_amount' : 'percent'
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    isActive: row.isActive,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    discountType,
    discountValue: Number(row.discountValue),
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    usageLimit: row.usageLimit,
    perCustomerLimit: row.perCustomerLimit,
    firstPurchaseOnly: row.firstPurchaseOnly,
    minimumCartTotal: row.minimumCartTotal != null ? Number(row.minimumCartTotal) : null,
    productIds: row.products.map((item) => item.productId),
  }
}

async function replaceProducts(couponId: string, productIds: string[]) {
  const unique = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))]
  if (unique.length > 0) {
    const found = await prisma.product.findMany({ where: { id: { in: unique } }, select: { id: true } })
    if (found.length !== unique.length) fail('Seçilen ürünlerden biri bulunamadı')
  }
  await prisma.couponProduct.deleteMany({ where: { couponId } })
  if (unique.length > 0) {
    await prisma.couponProduct.createMany({
      data: unique.map((productId) => ({ couponId, productId })),
    })
  }
}

async function countCouponUsage(code: string, customerEmail?: string | null): Promise<CouponUsageCounts> {
  const status = { notIn: USAGE_EXCLUDED }
  const totalUses = await prisma.order.count({ where: { couponCodeSnapshot: code, status } })
  const email = customerEmail?.trim().toLowerCase() || ''
  if (!email) return { totalUses, customerUses: 0, customerPriorOrders: 0 }
  const [customerUses, customerPriorOrders] = await Promise.all([
    prisma.order.count({ where: { couponCodeSnapshot: code, customerEmail: email, status } }),
    prisma.order.count({ where: { customerEmail: email, status } }),
  ])
  return { totalUses, customerUses, customerPriorOrders }
}

const includeProducts = {
  products: { include: { product: { select: { id: true, name: true } } } },
} as const

export const couponsService = {
  async listAdmin(includeArchived = false) {
    const rows = await prisma.coupon.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      include: includeProducts,
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(toAdmin)
  },

  async getById(id: string) {
    const row = await prisma.coupon.findUnique({ where: { id }, include: includeProducts })
    return row ? toAdmin(row) : null
  },

  async create(input: Record<string, unknown>) {
    const name = String(input.name ?? '').trim()
    const code = String(input.code ?? '').trim().toUpperCase()
    if (name.length < 2) fail('Kupon adı en az 2 karakter olmalıdır')
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) fail('Kupon kodu 3–32 karakter olmalı ve yalnızca harf, rakam, tire içermelidir')
    const discountType = asDiscountType(input.discountType)
    const discountValue = readMoney(input.discountValue, 'İndirim değeri')
    if (discountType === 'percent' && (Number(discountValue) < 1 || Number(discountValue) > 100)) {
      fail('Yüzde indirim 1–100 arası olmalıdır')
    }
    const productIds = Array.isArray(input.productIds) ? input.productIds.map((id) => String(id)) : []
    try {
      const row = await prisma.coupon.create({
        data: {
          id: randomUUID(),
          name,
          code,
          description: input.description != null ? String(input.description) : null,
          adminNote: input.adminNote != null ? String(input.adminNote) : null,
          isActive: input.isActive !== false,
          discountType,
          discountValue,
          startsAt: readDate(input.startsAt),
          endsAt: readDate(input.endsAt),
          usageLimit: readOptionalInt(input.usageLimit),
          perCustomerLimit: readOptionalInt(input.perCustomerLimit),
          firstPurchaseOnly: input.firstPurchaseOnly === true,
          minimumCartTotal: readOptionalMoney(input.minimumCartTotal),
        },
        include: includeProducts,
      })
      await replaceProducts(row.id, productIds)
      const saved = await prisma.coupon.findUnique({ where: { id: row.id }, include: includeProducts })
      return toAdmin(saved!)
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        fail('Bu kupon kodu zaten kullanılıyor')
      }
      throw err
    }
  },

  async update(id: string, input: Record<string, unknown>) {
    const current = await prisma.coupon.findUnique({ where: { id } })
    if (!current || current.archivedAt) fail('Kupon bulunamadı', 404)
    const name = input.name != null ? String(input.name).trim() : current.name
    const code = input.code != null ? String(input.code).trim().toUpperCase() : current.code
    if (name.length < 2) fail('Kupon adı en az 2 karakter olmalıdır')
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) fail('Kupon kodu 3–32 karakter olmalı ve yalnızca harf, rakam, tire içermelidir')
    const discountType = input.discountType != null ? asDiscountType(input.discountType) : asDiscountType(current.discountType)
    const discountValue = input.discountValue != null ? readMoney(input.discountValue, 'İndirim değeri') : current.discountValue
    if (discountType === 'percent' && (Number(discountValue) < 1 || Number(discountValue) > 100)) {
      fail('Yüzde indirim 1–100 arası olmalıdır')
    }
    try {
      await prisma.coupon.update({
        where: { id },
        data: {
          name,
          code,
          description: input.description !== undefined ? (input.description == null ? null : String(input.description)) : undefined,
          adminNote: input.adminNote !== undefined ? (input.adminNote == null ? null : String(input.adminNote)) : undefined,
          isActive: input.isActive !== undefined ? input.isActive === true : undefined,
          discountType,
          discountValue,
          startsAt: input.startsAt !== undefined ? readDate(input.startsAt) : undefined,
          endsAt: input.endsAt !== undefined ? readDate(input.endsAt) : undefined,
          usageLimit: input.usageLimit !== undefined ? readOptionalInt(input.usageLimit) : undefined,
          perCustomerLimit: input.perCustomerLimit !== undefined ? readOptionalInt(input.perCustomerLimit) : undefined,
          firstPurchaseOnly: input.firstPurchaseOnly !== undefined ? input.firstPurchaseOnly === true : undefined,
          minimumCartTotal:
            input.minimumCartTotal !== undefined ? readOptionalMoney(input.minimumCartTotal) : undefined,
        },
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        fail('Bu kupon kodu zaten kullanılıyor')
      }
      throw err
    }
    if (Array.isArray(input.productIds)) {
      await replaceProducts(id, input.productIds.map((item) => String(item)))
    }
    const saved = await prisma.coupon.findUnique({ where: { id }, include: includeProducts })
    return toAdmin(saved!)
  },

  async archive(id: string) {
    const current = await prisma.coupon.findUnique({ where: { id } })
    if (!current) fail('Kupon bulunamadı', 404)
    const saved = await prisma.coupon.update({
      where: { id },
      data: { archivedAt: new Date(), isActive: false },
      include: includeProducts,
    })
    return toAdmin(saved)
  },

  async priceCartLines(items: { productId: string; quantity: number }[]): Promise<{
    lines: CouponCartLine[]
    currency: string
  }> {
    const merged = new Map<string, number>()
    for (const item of items) {
      const key = String(item.productId ?? '').trim()
      if (!key) continue
      const qty = Math.min(99, Math.max(1, Math.floor(Number(item.quantity)) || 1))
      merged.set(key, Math.min(99, (merged.get(key) ?? 0) + qty))
    }
    const rawKeys = [...merged.keys()]
    if (rawKeys.length === 0) fail('Sepet boş')
    const resolved = await resolveCartProductKeys(rawKeys)
    if (rawKeys.some((key) => !resolved.has(key))) {
      fail('Sepetinizdeki bazı ürünler artık satın alınamıyor. Lütfen sepetinizi güncelleyip tekrar deneyin.')
    }
    const canonical = new Map<string, number>()
    for (const [raw, qty] of merged) {
      const id = resolved.get(raw)!
      canonical.set(id, Math.min(99, (canonical.get(id) ?? 0) + qty))
    }
    const products = await prisma.product.findMany({ where: { id: { in: [...canonical.keys()] } } })
    const byId = new Map(products.map((product) => [product.id, product]))
    const first = products[0]
    if (!first) fail('Sepetinizdeki bazı ürünler artık satın alınamıyor. Lütfen sepetinizi güncelleyip tekrar deneyin.')
    const currency = (first.currency || 'TRY').trim() || 'TRY'
    const lines: CouponCartLine[] = []
    for (const [id, qty] of canonical) {
      const product = byId.get(id)
      if (!product) fail('Sepetinizdeki bazı ürünler artık satın alınamıyor. Lütfen sepetinizi güncelleyip tekrar deneyin.')
      if ((product.currency || 'TRY').trim() !== currency) fail('Sepette farklı para biriminde ürün olamaz')
      assertSingleLicenseQuantityOrThrow(
        { productType: product.productType, licenseRequired: product.licenseRequired, name: product.name },
        qty,
      )
      const priced = await campaignsService.resolveProductUnitPrice({
        id: product.id,
        categoryId: product.categoryId,
        productType: product.productType,
        price: Number(product.price),
        purchaseEnabled: product.purchaseEnabled,
      })
      lines.push({ productId: product.id, quantity: qty, unitPrice: priced.unitPrice })
    }
    return { lines, currency }
  },

  async quoteCouponForPricedLines(input: {
    code: string
    lines: CouponCartLine[]
    customerEmail?: string | null
  }): Promise<CouponQuote> {
    const code = input.code.trim().toUpperCase()
    const row = code
      ? await prisma.coupon.findUnique({ where: { code }, include: includeProducts })
      : null
    const usage = row && !row.archivedAt ? await countCouponUsage(code, input.customerEmail) : undefined
    const evaluated = evaluateCouponQuote({
      coupon: row ? toRule(row) : null,
      lines: input.lines,
      usage,
    })
    if (!evaluated.ok) fail(evaluated.message)
    return evaluated.quote
  },

  async validateCheckoutCoupon(input: {
    code: string
    items: { productId: string; quantity: number }[]
    customerEmail?: string | null
  }): Promise<CouponQuote & { currency: string }> {
    const priced = await this.priceCartLines(input.items)
    const quote = await this.quoteCouponForPricedLines({
      code: input.code,
      lines: priced.lines,
      customerEmail: input.customerEmail,
    })
    return { ...quote, currency: priced.currency }
  },
}
