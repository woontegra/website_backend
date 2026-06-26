import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { mergeOrderItemDownloadUrl, checkOrderDownloadLinesForPaidMail } from '../src/services/orderFulfillment.service.js'
import { resolveDownloadSourceFromRawUrl } from '../src/lib/downloadStream.js'
import { isR2PublicUploadConfigured } from '../src/lib/r2.client.js'

const orderNo = process.argv[2]?.trim() || 'WNT-20260626-000004'
const prisma = new PrismaClient()

try {
  const order = await prisma.order.findFirst({
    where: { orderNo },
    include: {
      items: {
        include: {
          product: {
            select: {
              productType: true,
              licenseRequired: true,
              downloadUrl: true,
              downloadFiles: true,
              downloadMedia: { select: { url: true } },
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

  const items = order.items.map((i) => ({
    id: i.id,
    productName: i.productName,
    downloadUrl: i.downloadUrl,
    product: i.product,
  }))

  const lines = items.map((i) => ({
    productName: i.productName,
    mergedUrl: mergeOrderItemDownloadUrl(i),
    resolvable: Boolean(resolveDownloadSourceFromRawUrl(mergeOrderItemDownloadUrl(i))),
  }))

  console.log(
    JSON.stringify(
      {
        orderNo: order.orderNo,
        downloadEmailSentAt: order.downloadEmailSentAt,
        r2Configured: isR2PublicUploadConfigured(),
        deliveryCheckOk: checkOrderDownloadLinesForPaidMail(items),
        lines,
        items: order.items.map((i) => ({
          licenseServerUnitsNotified: i.licenseServerUnitsNotified,
          hasLicenseKey: Boolean(i.licenseServerLicenseKey?.trim()),
          hasPendingPassword: Boolean(i.licenseServerActivationPasswordPending?.trim()),
          licenseServerLastError: i.licenseServerLastError,
        })),
      },
      null,
      2,
    ),
  )
} finally {
  await prisma.$disconnect()
}
