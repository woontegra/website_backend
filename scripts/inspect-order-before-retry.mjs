import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { resolveOrderPaymentRowStatus } from '../src/services/orders.service.js'

const orderNo = process.argv[2]?.trim() || 'WNT-20260626-000003'
const prisma = new PrismaClient()

try {
  const order = await prisma.order.findFirst({
    where: { orderNo },
    include: {
      items: {
        include: {
          product: {
            select: {
              licenseRequired: true,
              licenseAppCode: true,
              licenseDays: true,
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
        orderStatus: order.status,
        paymentStatus: resolveOrderPaymentRowStatus({
          paymentProvider: order.paymentProvider,
          status: order.status,
          paymentTransactions: [],
        }),
        paymentMethod: order.paymentProvider,
        paidAt: order.paidAt?.toISOString() ?? null,
        paymentConfirmedAt: order.paymentConfirmedAt?.toISOString() ?? null,
        downloadEmailSentAt: order.downloadEmailSentAt?.toISOString() ?? null,
        customerEmail: order.customerEmail,
        items: order.items.map((i) => ({
          productName: i.productName,
          licenseRequired: i.product?.licenseRequired ?? null,
          licenseAppCode: i.product?.licenseAppCode ?? null,
          licenseServerUnitsNotified: i.licenseServerUnitsNotified,
          licenseServerLastError: i.licenseServerLastError,
          hasLicenseServerLicenseKey: Boolean(i.licenseServerLicenseKey?.trim()),
          hasActivationPasswordPending: Boolean(i.licenseServerActivationPasswordPending?.trim()),
        })),
      },
      null,
      2,
    ),
  )
} finally {
  await prisma.$disconnect()
}
