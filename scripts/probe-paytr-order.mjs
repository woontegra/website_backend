import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const orderNo = process.argv[2] || 'WNT-20260710-000001'

async function main() {
  const order = await prisma.order.findUnique({
    where: { orderNo },
    include: {
      items: {
        include: {
          product: { select: { slug: true, productType: true, licenseAppCode: true, licenseRequired: true } },
        },
      },
      paymentTransactions: { orderBy: { createdAt: 'desc' } },
    },
  })

  if (!order) {
    console.log('ORDER_NOT_FOUND', orderNo)
    return
  }

  const memberships = order.customerId
    ? await prisma.customerSaasMembership.findMany({ where: { customerId: order.customerId } })
    : []

  const ps = await prisma.paymentSettings.findUnique({ where: { provider: 'PAYTR' } })

  console.log(
    JSON.stringify(
      {
        orderNo: order.orderNo,
        status: order.status,
        paidAt: order.paidAt,
        downloadEmailSentAt: order.downloadEmailSentAt,
        paymentProvider: order.paymentProvider,
        customerId: order.customerId,
        customerEmail: order.customerEmail,
        transactions: order.paymentTransactions.map((t) => ({
          id: t.id,
          status: t.status,
          merchantOid: t.merchantOid,
          createdAt: t.createdAt,
        })),
        items: order.items.map((i) => ({
          id: i.id,
          name: i.productName,
          downloadUrl: i.downloadUrl,
          licenseServerLastError: i.licenseServerLastError,
          licenseServerUnitsNotified: i.licenseServerUnitsNotified,
          productType: i.product?.productType,
          slug: i.productSlug,
        })),
        saasMemberships: memberships.map((m) => ({
          id: m.id,
          status: m.status,
          tenantSlug: m.tenantSlug,
          firstOrderId: m.firstOrderId,
          productCode: m.productCode,
        })),
        paytrSettings: ps
          ? { isActive: ps.isActive, testMode: ps.testMode, hasKeys: Boolean(ps.merchantKeyEncrypted?.trim()) }
          : null,
      },
      null,
      2,
    ),
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
