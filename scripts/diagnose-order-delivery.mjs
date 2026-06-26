import { PrismaClient } from '@prisma/client'
import { resolveMailDownloadHref } from '../src/lib/mailDeliveryUrl.js'
import { resolveDownloadSourceFromRawUrl } from '../src/lib/downloadStream.js'
import { fulfillPaidOrderDelivery } from '../src/services/orderFulfillment.service.js'

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
              downloadUrl: true,
              downloadMedia: { select: { url: true } },
              licenseRequired: true,
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

  for (const item of order.items) {
    const raw =
      (item.downloadUrl?.trim() ||
        item.product?.downloadUrl?.trim() ||
        item.product?.downloadMedia?.url?.trim() ||
        '') || ''
    console.log('item', item.productName)
    console.log('  rawDownloadUrl:', raw || '(empty)')
    console.log('  resolveMailDownloadHref:', resolveMailDownloadHref(raw))
    console.log('  resolveDownloadSourceFromRawUrl:', Boolean(resolveDownloadSourceFromRawUrl(raw)))
  }

  if (process.argv.includes('--retry-delivery')) {
    console.log('Running fulfillPaidOrderDelivery...')
    await fulfillPaidOrderDelivery(order.id)
    const after = await prisma.order.findUnique({
      where: { id: order.id },
      select: { downloadEmailSentAt: true, status: true },
    })
    console.log('After:', after)
  }
} finally {
  await prisma.$disconnect()
}
