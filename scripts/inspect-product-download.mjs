import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const slug = process.argv[2]?.trim()
const prisma = new PrismaClient()

try {
  const p = slug
    ? await prisma.product.findFirst({
        where: { slug },
        select: {
          id: true,
          name: true,
          slug: true,
          downloadUrl: true,
          downloadMediaId: true,
          downloadMedia: { select: { id: true, url: true } },
          downloadFiles: true,
        },
      })
    : null
  const rows =
    p ??
    (await prisma.product.findMany({
      where: { OR: [{ name: { contains: 'Kasa', mode: 'insensitive' } }, { licenseAppCode: 'MUVEKKIL_KASA_DESKTOP' }] },
      select: {
        id: true,
        name: true,
        slug: true,
        downloadUrl: true,
        downloadMediaId: true,
        downloadMedia: { select: { id: true, url: true } },
        downloadFiles: true,
      },
    }))
  console.log(JSON.stringify(rows, null, 2))
} finally {
  await prisma.$disconnect()
}
