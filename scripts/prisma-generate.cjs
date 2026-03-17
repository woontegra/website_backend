/**
 * Prisma, schema yüklerken DATABASE_URL ortam değişkeninin *tanımlı* olmasını ister.
 * Railway build aşamasında bazen henüz yok → geçici placeholder (generate DB'ye bağlanmaz).
 * Gerçek bağlantı çalışma anında .env / Railway Variables ile gelir.
 */
const { execSync } = require('child_process')

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
  process.env.DATABASE_URL =
    'postgresql://postgres:placeholder@127.0.0.1:5432/prisma_build_placeholder?sslmode=disable'
}

execSync('npx prisma generate', { stdio: 'inherit', env: process.env })
