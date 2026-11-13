import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import {
  AffiliatePartnersError,
  parseCreateInput,
  parseUpdateInput,
  type AffiliatePartnerCreateInput,
  type AffiliatePartnerUpdateInput,
  type AffiliateProductAssignmentInput,
} from '../lib/affiliatePartners'

const productSelect = {
  id: true,
  name: true,
  slug: true,
  isActive: true,
  productType: true,
  price: true,
  currency: true,
} as const

function mapAssignment(row: {
  id: string
  productId: string
  commissionRatePercent: number
  discountRatePercent: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  product: {
    id: string
    name: string
    slug: string
    isActive: boolean
    productType: string
    price: unknown
    currency: string
  }
}) {
  const price =
    typeof row.product.price === 'object' &&
    row.product.price &&
    'toNumber' in row.product.price &&
    typeof (row.product.price as { toNumber: () => number }).toNumber === 'function'
      ? (row.product.price as { toNumber: () => number }).toNumber()
      : Number(row.product.price)

  return {
    id: row.id,
    productId: row.productId,
    commissionRatePercent: row.commissionRatePercent,
    discountRatePercent: row.discountRatePercent,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    product: {
      id: row.product.id,
      name: row.product.name,
      slug: row.product.slug,
      isActive: row.product.isActive,
      productType: row.product.productType,
      price: Number.isFinite(price) ? price : 0,
      currency: row.product.currency,
    },
  }
}

function mapAccess(row: {
  id: string
  partnerId: string
  email: string
  isRevoked: boolean
  createdAt: Date
  updatedAt: Date
  revokedAt: Date | null
} | null) {
  if (!row) return null
  return {
    id: row.id,
    partnerId: row.partnerId,
    email: row.email,
    isRevoked: row.isRevoked,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  }
}

function mapPartner(row: {
  id: string
  name: string
  contactName: string | null
  email: string | null
  phone: string | null
  defaultCommissionRate: number
  isActive: boolean
  internalNotes: string | null
  createdAt: Date
  updatedAt: Date
  products?: Array<Parameters<typeof mapAssignment>[0]>
  partnerAccess?: Parameters<typeof mapAccess>[0]
  _count?: { products: number }
}) {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contactName,
    email: row.email,
    phone: row.phone,
    defaultCommissionRate: row.defaultCommissionRate,
    isActive: row.isActive,
    internalNotes: row.internalNotes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    productCount: row._count?.products ?? row.products?.length ?? 0,
    products: row.products ? row.products.map(mapAssignment) : undefined,
    partnerAccess: mapAccess(row.partnerAccess ?? null),
  }
}

async function assertProductsExist(assignments: AffiliateProductAssignmentInput[]) {
  if (assignments.length === 0) return
  const ids = assignments.map((a) => a.productId)
  const found = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  })
  if (found.length !== ids.length) {
    throw new AffiliatePartnersError('Seçilen ürünlerden biri bulunamadı', 400)
  }
}

async function replaceAssignments(
  tx: Prisma.TransactionClient,
  partnerId: string,
  assignments: AffiliateProductAssignmentInput[],
) {
  await tx.affiliatePartnerProduct.deleteMany({ where: { partnerId } })
  if (assignments.length === 0) return
  await tx.affiliatePartnerProduct.createMany({
    data: assignments.map((a) => ({
      partnerId,
      productId: a.productId,
      commissionRatePercent: a.commissionRatePercent,
      discountRatePercent: a.discountRatePercent,
      isActive: a.isActive !== false,
    })),
  })
}

export type AffiliatePartnerListQuery = {
  search?: string
  isActive?: boolean
}

export const affiliatePartnersService = {
  async list(query: AffiliatePartnerListQuery = {}) {
    const where: Prisma.AffiliatePartnerWhereInput = {}
    if (typeof query.isActive === 'boolean') where.isActive = query.isActive
    const search = query.search?.trim()
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ]
    }
    const rows = await prisma.affiliatePartner.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      include: { _count: { select: { products: true } } },
    })
    return rows.map(mapPartner)
  },

  async getById(id: string, req?: import('express').Request | null, preferredOrigin?: unknown) {
    const row = await prisma.affiliatePartner.findUnique({
      where: { id },
      include: {
        products: {
          include: { product: { select: productSelect } },
          orderBy: { createdAt: 'asc' },
        },
        partnerAccess: true,
      },
    })
    if (!row) throw new AffiliatePartnersError('İş ortağı bulunamadı', 404)
    const base = mapPartner(row)
    const { affiliateLinksService } = await import('./affiliateLinks.service')
    const linksPayload = await affiliateLinksService.listForPartner(id, req, preferredOrigin, {
      page: 1,
      limit: 10,
    })
    return { ...base, links: linksPayload.items }
  },

  async create(body: unknown) {
    const input: AffiliatePartnerCreateInput = parseCreateInput(body)
    await assertProductsExist(input.products ?? [])
    const created = await prisma.$transaction(async (tx) => {
      const partner = await tx.affiliatePartner.create({
        data: {
          name: input.name,
          contactName: input.contactName ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          defaultCommissionRate: input.defaultCommissionRate,
          isActive: input.isActive !== false,
          internalNotes: input.internalNotes ?? null,
        },
      })
      await replaceAssignments(tx, partner.id, input.products ?? [])
      return partner.id
    })
    return this.getById(created)
  },

  async update(id: string, body: unknown) {
    const existing = await prisma.affiliatePartner.findUnique({ where: { id }, select: { id: true } })
    if (!existing) throw new AffiliatePartnersError('İş ortağı bulunamadı', 404)

    const input: AffiliatePartnerUpdateInput = parseUpdateInput(body)
    if (input.products) await assertProductsExist(input.products)

    const data: Prisma.AffiliatePartnerUpdateInput = {}
    if (input.name !== undefined) data.name = input.name
    if (input.contactName !== undefined) data.contactName = input.contactName
    if (input.email !== undefined) data.email = input.email
    if (input.phone !== undefined) data.phone = input.phone
    if (input.defaultCommissionRate !== undefined) data.defaultCommissionRate = input.defaultCommissionRate
    if (input.isActive !== undefined) data.isActive = input.isActive
    if (input.internalNotes !== undefined) data.internalNotes = input.internalNotes

    await prisma.$transaction(async (tx) => {
      await tx.affiliatePartner.update({ where: { id }, data })
      if (input.products) await replaceAssignments(tx, id, input.products)
    })
    return this.getById(id)
  },

  async setActive(id: string, isActive: boolean) {
    const existing = await prisma.affiliatePartner.findUnique({ where: { id }, select: { id: true } })
    if (!existing) throw new AffiliatePartnersError('İş ortağı bulunamadı', 404)
    await prisma.affiliatePartner.update({ where: { id }, data: { isActive } })
    return this.getById(id)
  },
}
