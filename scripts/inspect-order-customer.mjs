import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const orderNo = process.argv[2]?.trim() || 'WNT-20260626-000005'
const prisma = new PrismaClient()

try {
  const order = await prisma.order.findFirst({
    where: { orderNo },
    include: {
      customer: { select: { id: true, name: true, email: true } },
      items: {
        include: {
          product: {
            select: {
              name: true,
              licenseAppCode: true,
              licenseRequired: true,
            },
          },
        },
      },
    },
  })
  if (!order) {
    console.log(JSON.stringify({ found: false, orderNo }))
    process.exit(0)
  }
  console.log(
    JSON.stringify(
      {
        orderNo: order.orderNo,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        billingType: order.billingType,
        billingCompanyName: order.billingCompanyName,
        taxNumber: order.taxNumber,
        customerRelation: order.customer,
        items: order.items.map((i) => ({
          id: i.id,
          productName: i.productName,
          licenseAppCode: i.product?.licenseAppCode,
          licenseServerUnitsNotified: i.licenseServerUnitsNotified,
          licenseServerLicenseKey: i.licenseServerLicenseKey ? '(set)' : null,
          licenseServerLastNotifiedAt: i.licenseServerLastNotifiedAt,
          externalOrderNo: `${order.orderNo}:${i.id}:0`,
        })),
      },
      null,
      2,
    ),
  )
} finally {
  await prisma.$disconnect()
}
