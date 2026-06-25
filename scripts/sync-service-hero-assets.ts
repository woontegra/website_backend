/**
 * Hizmet hero görsellerini R2'ye yükler ve servicePages page-content kaydını günceller.
 *   npx tsx scripts/sync-service-hero-assets.ts
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { getR2PublicBucketName, getR2S3Client } from '../src/lib/r2.client'
import { buildServiceHeroObjectKey, inferContentType, uploadPublicObject } from '../src/services/r2Upload.service'

const API = process.env.API_BASE ?? 'http://localhost:4000/api'
const EMAIL = 'info@woontegra.com'
const PASS = process.env.ADMIN_SEED_PASSWORD ?? 'Admin123!'
const SERVICE_PAGE_CONTENT_KEY = 'servicePages'

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const ASSETS = path.join(REPO_ROOT, 'frontend', 'src', 'assets', 'images')
const SERVICES_ASSETS = path.join(ASSETS, 'services')

type ServiceHeroSpec = {
  slug: string
  sourcePath: string
  heroFileName: string
}

const SERVICE_HERO_SPECS: ServiceHeroSpec[] = [
  { slug: 'yazilim-gelistirme', sourcePath: path.join(SERVICES_ASSETS, 'yazilim-hero.png'), heroFileName: 'hero.png' },
  { slug: 'web-tasarim', sourcePath: path.join(SERVICES_ASSETS, 'web-tasarim-hero.png'), heroFileName: 'hero.png' },
  { slug: 'e-ticaret', sourcePath: path.join(ASSETS, 'e-ticaret.jpeg'), heroFileName: 'hero.jpeg' },
  {
    slug: 'saas',
    sourcePath: path.join(ASSETS, 'woontegra-sifre-kasasi-ekran.png'),
    heroFileName: 'hero.png',
  },
  { slug: 'marka-patent-vekilligi', sourcePath: path.join(ASSETS, 'hero-dashboard.jpg'), heroFileName: 'hero.jpg' },
  { slug: 'oyun-gelistirme', sourcePath: path.join(ASSETS, 'hero-dashboard.jpg'), heroFileName: 'hero.jpg' },
  {
    slug: 'dijital-danismanlik',
    sourcePath: path.join(SERVICES_ASSETS, 'danismanlik-hero.png'),
    heroFileName: 'hero.png',
  },
]

async function login(): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  })
  const json = (await res.json()) as Record<string, unknown>
  const token =
    (json.token as string | undefined) ||
    ((json.data as Record<string, unknown> | undefined)?.token as string | undefined)
  if (!token) throw new Error('Admin login failed')
  return token
}

async function uploadFile(
  filePath: string,
  objectKey: string,
): Promise<{ publicUrl: string; size: number; objectKey: string }> {
  const body = fs.readFileSync(filePath)
  if (body.length < 10_240) {
    throw new Error(`Dosya çok küçük (stub olabilir): ${filePath} (${body.length} B)`)
  }
  const uploaded = await uploadPublicObject({
    objectKey,
    body,
    contentType: inferContentType(path.basename(filePath)),
  })
  await getR2S3Client().send(
    new HeadObjectCommand({ Bucket: getR2PublicBucketName(), Key: uploaded.objectKey }),
  )
  const head = await fetch(uploaded.publicUrl, { method: 'HEAD' }).catch((err: unknown) => {
    console.warn(`R2 public URL HEAD kontrolü atlandı: ${uploaded.publicUrl}`, err instanceof Error ? err.message : err)
    return null
  })
  if (head && !head.ok) {
    console.warn(`R2 public URL HEAD ${head.status}: ${uploaded.publicUrl}`)
  }
  return { publicUrl: uploaded.publicUrl, size: body.length, objectKey: uploaded.objectKey }
}

function normalizeServicePages(raw: unknown): Record<string, Record<string, unknown>> {
  if (!raw || typeof raw !== 'object') return {}
  const row = raw as Record<string, unknown>
  if (row.pages && typeof row.pages === 'object') {
    return row.pages as Record<string, Record<string, unknown>>
  }
  return row as Record<string, Record<string, unknown>>
}

async function main() {
  const uploads: Array<{
    slug: string
    publicUrl: string
    size: number
    objectKey: string
  }> = []

  for (const spec of SERVICE_HERO_SPECS) {
    if (!fs.existsSync(spec.sourcePath)) {
      throw new Error(`Kaynak dosya yok: ${spec.sourcePath}`)
    }
    const objectKey = buildServiceHeroObjectKey(spec.slug, spec.heroFileName)
    const uploaded = await uploadFile(spec.sourcePath, objectKey)
    uploads.push({ slug: spec.slug, ...uploaded })
    console.log(`R2 OK [${spec.slug}]:`, uploaded.publicUrl, `(${uploaded.size} B)`)
  }

  const token = await login()

  const rawRes = await fetch(`${API}/page-content/${SERVICE_PAGE_CONTENT_KEY}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const rawJson = (await rawRes.json()) as Record<string, unknown>
  const rawRoot = ((rawJson.data as Record<string, unknown> | null) ?? {}) as Record<string, unknown>
  const pages = normalizeServicePages(rawRoot)

  for (const item of uploads) {
    const existing = pages[item.slug] ?? {}
    const existingHero =
      existing.hero && typeof existing.hero === 'object'
        ? (existing.hero as Record<string, unknown>)
        : {}
    pages[item.slug] = {
      ...existing,
      hero: {
        ...existingHero,
        image: item.publicUrl,
      },
    }
  }

  const nextContent = {
    ...rawRoot,
    pages,
  }

  const patchRes = await fetch(`${API}/page-content/${SERVICE_PAGE_CONTENT_KEY}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: nextContent }),
  })
  if (!patchRes.ok) {
    const errText = await patchRes.text()
    throw new Error(`servicePages güncellenemedi (${patchRes.status}): ${errText}`)
  }

  const publicRes = await fetch(`${API}/page-content/${SERVICE_PAGE_CONTENT_KEY}`)
  const publicJson = (await publicRes.json()) as Record<string, unknown>
  const publicRoot = ((publicJson.data as Record<string, unknown> | null) ?? {}) as Record<string, unknown>
  const publicPages = normalizeServicePages(publicRoot)

  console.log('\nPublic servicePages hero.image:')
  for (const spec of SERVICE_HERO_SPECS) {
    const hero = publicPages[spec.slug]?.hero
    const image =
      hero && typeof hero === 'object' ? (hero as Record<string, unknown>).image : undefined
    console.log(`  ${spec.slug}:`, image)
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
