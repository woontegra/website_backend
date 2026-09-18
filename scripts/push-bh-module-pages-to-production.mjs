/**
 * One-shot: push local bhModulePages (from Prisma or migrate) to production Woontegra API.
 * Does not invent content — reads migrated local document or re-runs live-source migrate in-memory.
 */
import { PrismaClient } from '@prisma/client'

const PROD = process.env.PROD_API_URL || 'https://websitebackend-production-ab6e.up.railway.app'
const EMAIL = process.env.ADMIN_EMAIL || 'info@woontegra.com'
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!'
const PAGE_KEY = 'bhModulePages'

const prisma = new PrismaClient()

async function main() {
  const login = await fetch(`${PROD}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const loginJson = await login.json()
  const token = loginJson.token || loginJson.data?.token
  if (!login.ok || !token) throw new Error(`login failed: ${login.status} ${JSON.stringify(loginJson)}`)

  const row = await prisma.pageContent.findUnique({ where: { pageKey: PAGE_KEY } })
  if (!row) throw new Error('local bhModulePages missing — run migrate-bh-all-modules-to-builder.mjs first')
  const content = JSON.parse(row.content)
  const count = Object.keys(content.pages || {}).length
  console.log('uploading pages', count, 'bytes', Buffer.byteLength(JSON.stringify(content)))

  const put = await fetch(`${PROD}/api/page-content/${PAGE_KEY}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content }),
  })
  const text = await put.text()
  console.log('PUT', put.status, put.headers.get('content-type'), text.slice(0, 300))
  if (!put.ok) process.exit(1)

  const verify = await fetch(`${PROD}/api/page-content/${PAGE_KEY}`).then((r) => r.json())
  const keys = Object.keys(verify?.data?.pages || {})
  console.log('prod verify count', keys.length)
  if (keys.length !== 14) {
    console.error('expected 14 pages')
    process.exit(1)
  }
  console.log('OK', keys.join('\n'))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
