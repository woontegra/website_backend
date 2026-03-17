/**
 * Deploy/start: gerçek DATABASE_URL gerekli. Yoksa anlamlı hata ver.
 */
const { execSync } = require('child_process')

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
  console.error(`
[Railway] DATABASE_URL tanımlı değil.

Backend servisinizde:
1. PostgreSQL eklentisini ekleyin.
2. Variables → "Add Reference" → Postgres → DATABASE_URL seçin.
3. Redeploy edin.
`)
  process.exit(1)
}

execSync('npx prisma db push', { stdio: 'inherit', env: process.env })
