/**
 * info@woontegra.com admin yoksa oluşturur. Mevcut şifreyi ezmez.
 * Yeni admin için ADMIN_SEED_PASSWORD zorunludur.
 * Şifre değiştirmek yalnızca ADMIN_SEED_ALLOW_PASSWORD_OVERWRITE=1 ile mümkündür.
 *
 *   ADMIN_SEED_PASSWORD=... npx tsx scripts/ensure-admin.ts
 */
import path from 'path'
import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { ADMIN_BOOTSTRAP_EMAIL, planEnsureAdmin, readAdminSeedPassword } from '../src/lib/adminBootstrapSafety'

config({ path: path.resolve(process.cwd(), '.env') })
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(path.join(process.cwd(), 'scripts/resolve-database-url.cjs')).applyToProcessEnv()
} catch {
  /* */
}

const PASS = readAdminSeedPassword()
const missingPassword = planEnsureAdmin({ password: PASS, exists: false, allowOverwrite: false })
if (missingPassword.action === 'abort') {
  console.error(`[admin:ensure] ${missingPassword.reason}`)
  process.exit(1)
}

if (!process.env.DATABASE_URL?.trim()) {
  console.error('DATABASE_URL yok (.env). No database writes were made.')
  process.exit(1)
}

async function main() {
  const prisma = new PrismaClient()
  try {
    const existing = await prisma.user.findUnique({ where: { email: ADMIN_BOOTSTRAP_EMAIL } })
    const plan = planEnsureAdmin({
      password: PASS,
      exists: Boolean(existing),
      allowOverwrite: process.env.ADMIN_SEED_ALLOW_PASSWORD_OVERWRITE === '1',
    })
    if (plan.action === 'abort') {
      console.error(`[admin:ensure] ${plan.reason}`)
      return
    }
    if (plan.action === 'skip_existing') {
      console.log(`[admin:ensure] Admin already exists (${ADMIN_BOOTSTRAP_EMAIL}). Password left unchanged.`)
      return
    }

    const passwordHash = await bcrypt.hash(PASS, 10)
    if (plan.action === 'create') {
      await prisma.user.create({
        data: { email: ADMIN_BOOTSTRAP_EMAIL, passwordHash, role: 'admin' },
      })
      console.log(`[admin:ensure] Created admin ${ADMIN_BOOTSTRAP_EMAIL}.`)
      return
    }

    await prisma.user.update({
      where: { email: ADMIN_BOOTSTRAP_EMAIL },
      data: { passwordHash, role: 'admin' },
    })
    console.log(`[admin:ensure] Updated admin password for ${ADMIN_BOOTSTRAP_EMAIL} (opt-in overwrite).`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
