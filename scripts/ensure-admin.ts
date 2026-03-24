/**
 * Sadece info@woontegra.com yönetici hesabını oluşturur / şifresini günceller.
 * CMS sayfalarını silmez. Yerel: backend/.env gerekli.
 *
 *   npx tsx scripts/ensure-admin.ts
 */
import path from 'path'
import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

config({ path: path.resolve(process.cwd(), '.env') })
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(path.join(process.cwd(), 'scripts/resolve-database-url.cjs')).applyToProcessEnv()
} catch {
  /* */
}

if (!process.env.DATABASE_URL?.trim()) {
  console.error('DATABASE_URL yok (.env)')
  process.exit(1)
}

const EMAIL = 'info@woontegra.com'
const PASS = process.env.ADMIN_SEED_PASSWORD ?? 'Admin123!'

async function main() {
  const prisma = new PrismaClient()
  const passwordHash = await bcrypt.hash(PASS, 10)
  await prisma.user.upsert({
    where: { email: EMAIL },
    create: { email: EMAIL, passwordHash, role: 'admin' },
    update: { passwordHash, role: 'admin' },
  })
  await prisma.$disconnect()
  console.log(`Tamam: ${EMAIL} / ${PASS}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
