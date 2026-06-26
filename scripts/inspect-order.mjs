import { PrismaClient } from '@prisma/client'

const orderNo = process.argv[2] || 'WNT-20260626-000003'
const prisma = new PrismaClient()

try {
  const order = await prisma.order.findUnique({
    where: { orderNo },
    include: {
      items: {
        include: {
          product: {
            select: {
              licenseRequired: true,
              licenseAppCode: true,
              licenseDays: true,
              licenseMaxDevices: true,
              downloadUrl: true,
              productType: true,
            },
          },
        },
      },
    },
  })
  if (!order) {
    console.log('ORDER_NOT_FOUND')
    process.exit(0)
  }
  console.log(
    JSON.stringify(
      {
        orderNo: order.orderNo,
        status: order.status,
        paymentProvider: order.paymentProvider,
        customerEmail: order.customerEmail,
        paidAt: order.paidAt?.toISOString() ?? null,
        paymentConfirmedAt: order.paymentConfirmedAt?.toISOString() ?? null,
        downloadEmailSentAt: order.downloadEmailSentAt?.toISOString() ?? null,
        bankTransferAdminNote: order.bankTransferAdminNote ? 'set' : null,
        items: order.items.map((i) => ({
          productName: i.productName,
        licenseServerUnitsNotified: i.licenseServerUnitsNotified,
        licenseServerLastError: i.licenseServerLastError,
        hasLicenseServerLicenseKey: Boolean(i.licenseServerLicenseKey?.trim()),
        hasActivationPasswordPending: Boolean(i.licenseServerActivationPasswordPending?.trim()),
        licenseRequired: i.product?.licenseRequired,
          licenseAppCode: i.product?.licenseAppCode,
          licenseDays: i.product?.licenseDays,
          licenseMaxDevices: i.product?.licenseMaxDevices,
          hasDownloadUrl: Boolean(i.downloadUrl || i.product?.downloadUrl),
        })),
      },
      null,
      2,
    ),
  )
} finally {
  await prisma.$disconnect()
}
