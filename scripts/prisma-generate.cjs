/**
 * Prisma generate için DATABASE_URL tanımlı olmalı.
 * .env içinde yalnızca DATABASE_PUBLIC_URL varsa dotenv + resolve ile doldurulur.
 */
const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')

const envPath = path.join(process.cwd(), '.env')
if (fs.existsSync(envPath)) {
  try {
    require('dotenv').config({ path: envPath })
  } catch {
    /* */
  }
}

const { applyToProcessEnv, isPostgresUrl } = require('./resolve-database-url.cjs')
applyToProcessEnv()

const u = process.env.DATABASE_URL?.trim() ?? ''
if (!u || !isPostgresUrl(u)) {
  process.env.DATABASE_URL =
    'postgresql://postgres:placeholder@127.0.0.1:5432/prisma_build_placeholder?sslmode=disable'
}

execSync('npx prisma generate', { stdio: 'inherit', env: process.env })
