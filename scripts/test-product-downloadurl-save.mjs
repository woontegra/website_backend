/**
 * products.service update: alternatif downloadUrl medya ile ezilmemeli.
 * npx tsx scripts/test-product-downloadurl-save.mjs
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { productsService } from '../src/services/products.service.js'
import { resolveProductDeliveryRawUrl } from '../src/lib/productDeliveryUrl.js'

const PRODUCT_ID = '59912055-87e9-4401-b982-3c8379f85e24'
const TEST_R2 = 'https://pub-52796df7e74b467a8f38ec503fb5137f.r2.dev/Woontegra-Muvekkil-Kasa-Defteri-Setup-0.1.0.exe'

const prisma = new PrismaClient()

try {
  const before = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
    select: {
      downloadUrl: true,
      downloadMediaId: true,
      downloadMedia: { select: { url: true } },
      downloadFiles: true,
    },
  })

  await productsService.update(PRODUCT_ID, {
    downloadMediaId: before?.downloadMediaId ?? null,
    downloadUrl: TEST_R2,
  })

  const after = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
    select: {
      downloadUrl: true,
      downloadMediaId: true,
      downloadMedia: { select: { url: true } },
      downloadFiles: true,
    },
  })

  const resolved = resolveProductDeliveryRawUrl({
    downloadUrl: after?.downloadUrl,
    downloadMedia: after?.downloadMedia,
    downloadFiles: after?.downloadFiles,
  })

  console.log(
    JSON.stringify(
      {
        beforeDownloadUrl: before?.downloadUrl,
        afterDownloadUrl: after?.downloadUrl,
        downloadMediaUrl: after?.downloadMedia?.url ?? null,
        resolvedDeliveryUrl: resolved,
        r2Persisted: after?.downloadUrl === TEST_R2,
        deliveryUsesR2: resolved.includes('r2.dev'),
      },
      null,
      2,
    ),
  )
} finally {
  await prisma.$disconnect()
}
