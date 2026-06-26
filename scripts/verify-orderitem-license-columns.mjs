import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

try {
  const cols = await prisma.$queryRaw`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'OrderItem'
      AND column_name IN ('licenseServerLicenseKey', 'licenseServerActivationPasswordPending')
    ORDER BY column_name
  `

  const migration = await prisma.$queryRaw`
    SELECT migration_name, finished_at, rolled_back_at
    FROM "_prisma_migrations"
    WHERE migration_name = '20260626120000_order_item_license_mail_pending'
  `

  console.log(JSON.stringify({ columns: cols, migration }, null, 2))
} finally {
  await prisma.$disconnect()
}
