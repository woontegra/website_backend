import fs from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'

/** backend kökü (src/lib veya dist/lib altından iki üst) */
const backendRoot = path.resolve(__dirname, '..', '..')
const localPrismaPkg = path.join(backendRoot, 'node_modules', '@prisma', 'client', 'package.json')

let installedVersion = ''
try {
  if (fs.existsSync(localPrismaPkg)) {
    installedVersion = String(JSON.parse(fs.readFileSync(localPrismaPkg, 'utf8')).version ?? '')
  }
} catch {
  /* */
}

if (!installedVersion.startsWith('5.')) {
  console.error(`
[Prisma] Bu proje @prisma/client 5.22.x (klasik binary engine) kullanır.

Hata nedeni: "backend/node_modules" içinde Prisma 5 yok; Node üst klasördeki
Prisma 6/7 paketini yüklüyor olabilir (adapter / accelerateUrl hatası).

Çözüm — PowerShell'de backend klasöründe sırayla:

  cd ...\\woontegra_website\\backend
  Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
  npm install
  npx prisma generate
  npm run dev
`)
  process.exit(1)
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
