import { prisma } from '../src/lib/prisma'

async function main() {
  const order = await prisma.order.findFirst({
    where: { orderNo: 'WNT-20260701-000016' },
    include: {
      items: true,
      customer: { select: { id: true, email: true, name: true } },
    },
  })
  if (!order) {
    console.log(JSON.stringify({ found: false }, null, 2))
    return
  }

  const memberships = order.customerId
    ? await prisma.customerSaasMembership.findMany({
        where: { customerId: order.customerId },
        orderBy: { createdAt: 'desc' },
      })
    : []

  console.log(
    JSON.stringify(
      {
        found: true,
        orderId: order.id,
        orderNo: order.orderNo,
        customerEmail: order.customerEmail,
        customerId: order.customerId,
        downloadEmailSentAt: order.downloadEmailSentAt,
        items: order.items.map((i) => ({
          id: i.id,
          productName: i.productName,
          licenseServerUnitsNotified: i.licenseServerUnitsNotified,
          licenseServerLicenseKey: i.licenseServerLicenseKey,
          licenseServerLastError: i.licenseServerLastError,
          saasMembershipId: i.saasMembershipId,
        })),
        memberships: memberships.map((m) => ({
          id: m.id,
          tenantId: m.tenantId,
          tenantSlug: m.tenantSlug,
          ownerEmail: m.ownerEmail,
          firstOrderId: m.firstOrderId,
          licenseKey: m.licenseKey,
          status: m.status,
        })),
      },
      null,
      2,
    ),
  )
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
