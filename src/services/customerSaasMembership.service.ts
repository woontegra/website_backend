import { CustomerSaasMembershipStatus } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { MUVEKKIL_KASA_SAAS_PRODUCT_CODE } from '../lib/muvekkilKasaSaasProduct'

export type UpsertCustomerSaasMembershipInput = {
  customerId: string
  productId: string | null
  productCode: string
  tenantId: string
  tenantSlug: string
  licenseKey: string
  ownerEmail: string
  licenseStartDate: Date
  licenseEndDate: Date
  firstOrderId: string
  lastOrderId: string
  status?: CustomerSaasMembershipStatus
}

export async function findActiveCustomerSaasMembership(
  customerId: string,
  productCode: string = MUVEKKIL_KASA_SAAS_PRODUCT_CODE,
) {
  return prisma.customerSaasMembership.findFirst({
    where: {
      customerId,
      productCode,
      status: CustomerSaasMembershipStatus.ACTIVE,
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function upsertCustomerSaasMembershipAfterProvision(
  input: UpsertCustomerSaasMembershipInput,
): Promise<{ created: boolean; id: string }> {
  const tenantId = input.tenantId.trim()
  const licenseKey = input.licenseKey.trim()
  const firstOrderId = input.firstOrderId.trim()

  if (!tenantId || !licenseKey || !firstOrderId) {
    throw new Error('tenantId, licenseKey ve firstOrderId zorunludur.')
  }

  const byOrder = await prisma.customerSaasMembership.findUnique({
    where: { firstOrderId },
  })
  if (byOrder) {
    return { created: false, id: byOrder.id }
  }

  const byTenant = await prisma.customerSaasMembership.findUnique({
    where: { tenantId },
  })
  if (byTenant) {
    return { created: false, id: byTenant.id }
  }

  const row = await prisma.customerSaasMembership.create({
    data: {
      customerId: input.customerId,
      productId: input.productId,
      productCode: input.productCode,
      tenantId,
      tenantSlug: input.tenantSlug.trim(),
      licenseKey,
      ownerEmail: input.ownerEmail.trim().toLowerCase(),
      status: input.status ?? CustomerSaasMembershipStatus.ACTIVE,
      licenseStartDate: input.licenseStartDate,
      licenseEndDate: input.licenseEndDate,
      firstOrderId,
      lastOrderId: input.lastOrderId.trim(),
    },
  })

  return { created: true, id: row.id }
}

export async function updateCustomerSaasMembershipAfterRenew(input: {
  membershipId: string
  licenseEndDate: Date
  lastOrderId: string
  status?: CustomerSaasMembershipStatus
}): Promise<void> {
  await prisma.customerSaasMembership.update({
    where: { id: input.membershipId },
    data: {
      licenseEndDate: input.licenseEndDate,
      lastOrderId: input.lastOrderId.trim(),
      status: input.status ?? CustomerSaasMembershipStatus.ACTIVE,
    },
  })
}

export type CustomerSaasMembershipListItem = {
  id: string
  productCode: string
  productName: string
  tenantSlug: string
  licenseKey: string
  status: CustomerSaasMembershipStatus
  licenseStartDate: string
  licenseEndDate: string
  kalanGun: number | null
  ownerEmail: string
}

function calcKalanGun(end: Date): number | null {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const endDay = new Date(end)
  endDay.setHours(0, 0, 0, 0)
  return Math.ceil((endDay.getTime() - today.getTime()) / 86_400_000)
}

export async function listCustomerSaasMemberships(
  customerId: string,
): Promise<CustomerSaasMembershipListItem[]> {
  const rows = await prisma.customerSaasMembership.findMany({
    where: { customerId },
    orderBy: { licenseEndDate: 'desc' },
    include: {
      product: { select: { name: true } },
    },
  })

  return rows.map((r) => ({
    id: r.id,
    productCode: r.productCode,
    productName: r.product?.name ?? r.productCode,
    tenantSlug: r.tenantSlug,
    licenseKey: r.licenseKey,
    status: r.status,
    licenseStartDate: r.licenseStartDate.toISOString(),
    licenseEndDate: r.licenseEndDate.toISOString(),
    kalanGun: calcKalanGun(r.licenseEndDate),
    ownerEmail: r.ownerEmail,
  }))
}
