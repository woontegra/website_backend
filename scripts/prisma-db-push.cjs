/**
 * Deploy/start: DATABASE_URL veya Railway PG* değişkenlerinden bağlantı kur.
 */
const { execSync } = require('child_process')
const { applyToProcessEnv } = require('./resolve-database-url.cjs')

const url = applyToProcessEnv()

if (!url) {
  console.error(`
[Railway] Veritabanı adresi bulunamadı (DATABASE_URL veya PGHOST/PGUSER/PGPASSWORD/PGDATABASE yok).

Seçenek A — Otomatik (önerilen)
  1. Aynı Railway projesinde PostgreSQL servisiniz olsun.
  2. Backend servisi → Settings → Networking: Postgres ile bağlı olsun.
  3. Backend → Variables → "RAW Editor" veya tek tek:
     - "New variable" → "Variable Reference" → Postgres → DATABASE_URL
     VEYA Postgres panelindeki "Connect" sekmesinden kopyalayıp şunu ekleyin:

Seçenek B — Elle
  Backend servisi → Variables → New variable:
    Name:  DATABASE_URL
    Value: (Postgres → Connect → "Public Network" veya "Database URL" satırının tamamı)
    Örnek: postgresql://postgres:...@xxx.proxy.rlwy.net:PORT/railway?sslmode=require

Kaydedip Redeploy edin.
`)
  process.exit(1)
}

const hostMatch = url.match(/@([^/:]+)/)
console.log('[deploy] prisma db push →', hostMatch ? hostMatch[1] : 'bağlantı')
execSync('npx prisma db push', { stdio: 'inherit', env: process.env })
