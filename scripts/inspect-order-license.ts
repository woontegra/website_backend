/**
 * Sipariş lisans / teslimat durumu (debug).
 * npm run inspect:order-license -- WNT-20260625-000001
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { isLicenseServerConfigured } from '../src/services/woontegraLicenseServer.client'

const prisma = new PrismaClient()

async function main() {
  const orderNo = process.argv[2]?.trim()
  if (!orderNo) {
    console.error('Kullanım: npm run inspect:order-license -- <orderNo>')
    process.exitCode = 1
    return
  }

  const order = await prisma.order.findFirst({
    where: { orderNo },
    include: {
      items: {
        include: {
          product: {
            select: {
              name: true,
              licenseRequired: true,
              licenseAppCode: true,
              downloadUrl: true,
              downloadMedia: { select: { url: true } },
            },
          },
        },
      },
    },
  })

  if (!order) {
    console.error('Sipariş bulunamadı:', orderNo)
    process.exitCode = 1
    return
  }

  console.log(
    JSON.stringify(
      {
        licenseServerConfigured: isLicenseServerConfigured(),
        licenseServerUrl: process.env.LICENSE_SERVER_URL ?? '(default localhost:4000)',
        order: {
          id: order.id,
          orderNo: order.orderNo,
          status: order.status,
          paymentProvider: order.paymentProvider,
          downloadEmailSentAt: order.downloadEmailSentAt,
          customerEmail: order.customerEmail,
          items: order.items.map((i) => ({
            productName: i.productName,
            licenseRequired: i.product?.licenseRequired,
            licenseAppCode: i.product?.licenseAppCode,
            licenseServerUnitsNotified: i.licenseServerUnitsNotified,
            licenseServerLastError: i.licenseServerLastError,
            downloadUrl: i.downloadUrl,
          })),
        },
      },
      null,
      2,
    ),
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => void prisma.$disconnect())
