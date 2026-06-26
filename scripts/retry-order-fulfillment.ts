/**
 * Ödeme onayı sonrası lisans / teslimat akışını yeniden çalıştırır.
 * npm run retry:order-fulfillment -- WNT-20260625-000001
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { fulfillPaidOrderDelivery } from '../src/services/orderFulfillment.service'
import { isLicenseServerConfigured } from '../src/services/woontegraLicenseServer.client'

const prisma = new PrismaClient()

async function main() {
  const orderNo = process.argv[2]?.trim()
  if (!orderNo) {
    console.error('Kullanım: npm run retry:order-fulfillment -- <orderNo>')
    process.exitCode = 1
    return
  }

  if (!isLicenseServerConfigured()) {
    console.error(
      'LICENSE_SERVER_URL ve LICENSE_SERVER_INTEGRATION_SECRET tanımlı değil. backend/.env dosyasını kontrol edin.',
    )
    process.exitCode = 1
    return
  }

  const order = await prisma.order.findFirst({ where: { orderNo } })
  if (!order) {
    console.error('Sipariş bulunamadı:', orderNo)
    process.exitCode = 1
    return
  }

  if (order.status !== 'PAID' && order.status !== 'PROCESSING') {
    console.error(`Sipariş durumu uygun değil: ${order.status} (PAID veya PROCESSING olmalı)`)
    process.exitCode = 1
    return
  }

  console.log('[retry] fulfillPaidOrderDelivery başlıyor…', { orderNo, status: order.status })
  await fulfillPaidOrderDelivery(order.id)

  const after = await prisma.order.findFirst({
    where: { id: order.id },
    include: {
      items: {
        select: {
          productName: true,
          licenseServerUnitsNotified: true,
          licenseServerLastError: true,
        },
      },
    },
  })

  console.log(
    JSON.stringify(
      {
        orderNo: after?.orderNo,
        status: after?.status,
        downloadEmailSentAt: after?.downloadEmailSentAt,
        items: after?.items,
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
