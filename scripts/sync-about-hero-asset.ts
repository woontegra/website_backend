/**
 * Hakkımızda hero görselini R2'ye yükler ve about page-content kaydını V3 formatına günceller.
 *   npx tsx scripts/sync-about-hero-asset.ts
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { getR2PublicBucketName, getR2S3Client } from '../src/lib/r2.client'
import { buildPageHeroObjectKey, inferContentType, uploadPublicObject } from '../src/services/r2Upload.service'

const API = process.env.API_BASE ?? 'http://localhost:4000/api'
const EMAIL = 'info@woontegra.com'
const PASS = process.env.ADMIN_SEED_PASSWORD ?? 'Admin123!'
const PAGE_KEY = 'about'

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const HERO_SOURCE = path.join(REPO_ROOT, 'frontend', 'src', 'assets', 'images', 'about', 'hakkimizda-hero.jpg')
const HERO_PUBLIC_COPY = path.join(REPO_ROOT, 'frontendV3', 'public', 'images', 'hakkimizda-hero.jpg')

function str(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v).trim()
}

function heroFromBuilder(raw: Record<string, unknown>): Record<string, unknown> | null {
  const sections = raw.sections
  if (!Array.isArray(sections)) return null
  for (const section of sections) {
    if (!section || typeof section !== 'object') continue
    const s = section as Record<string, unknown>
    if (s.type === 'hero' && s.data && typeof s.data === 'object') {
      return s.data as Record<string, unknown>
    }
  }
  return null
}

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

async function main() {
  if (!fs.existsSync(HERO_SOURCE)) throw new Error(`Kaynak dosya yok: ${HERO_SOURCE}`)

  fs.mkdirSync(path.dirname(HERO_PUBLIC_COPY), { recursive: true })
  fs.copyFileSync(HERO_SOURCE, HERO_PUBLIC_COPY)
  const localSize = fs.statSync(HERO_PUBLIC_COPY).size
  if (localSize < 10_240) throw new Error(`Public kopya çok küçük: ${localSize} B`)
  console.log('Public fallback kopyalandı:', HERO_PUBLIC_COPY, `(${localSize} B)`)

  const body = fs.readFileSync(HERO_SOURCE)
  const objectKey = buildPageHeroObjectKey('hakkimizda', 'hero.jpg')
  const uploaded = await uploadPublicObject({
    objectKey,
    body,
    contentType: inferContentType('hero.jpg'),
  })
  await getR2S3Client().send(
    new HeadObjectCommand({ Bucket: getR2PublicBucketName(), Key: uploaded.objectKey }),
  )
  console.log('R2 OK:', uploaded.publicUrl, `(${body.length} B)`)

  const token = await login()
  const rawRes = await fetch(`${API}/page-content/${PAGE_KEY}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const rawJson = (await rawRes.json()) as Record<string, unknown>
  const raw = ((rawJson.data as Record<string, unknown> | null) ?? {}) as Record<string, unknown>

  const builderHero = heroFromBuilder(raw)
  const existingHero =
    raw.hero && typeof raw.hero === 'object' ? (raw.hero as Record<string, unknown>) : builderHero ?? {}

  let nextContent: Record<string, unknown>
  if (Number(raw.version) >= 2) {
    nextContent = { ...raw, version: 2 }
    const hero =
      nextContent.hero && typeof nextContent.hero === 'object'
        ? { ...(nextContent.hero as Record<string, unknown>) }
        : {}
    nextContent.hero = {
      ...hero,
      eyebrow: str(hero.eyebrow, str(existingHero.tag, 'Hakkımızda')),
      title: str(hero.title, str(existingHero.title, "Woontegra'yı Tanıyın")),
      subtitle: str(
        hero.subtitle,
        str(
          existingHero.subtitle,
          'Yazılım, e-ticaret ve dijital sistemler alanında ürün geliştiren ve markalar yöneten bir teknoloji şirketiyiz.',
        ),
      ),
      image: uploaded.publicUrl,
    }
  } else {
    nextContent = {
      version: 2,
      hero: {
        eyebrow: str(existingHero.tag ?? existingHero.eyebrow, 'Hakkımızda'),
        title: str(existingHero.title, "Woontegra'yı Tanıyın"),
        subtitle: str(
          existingHero.subtitle,
          'Yazılım, e-ticaret ve dijital sistemler alanında ürün geliştiren ve markalar yöneten bir teknoloji şirketiyiz.',
        ),
        image: uploaded.publicUrl,
        highlights: [],
      },
      metaDescription: str(
        raw.metaDescription,
        'Yazılım, e-ticaret ve dijital sistemler alanında kendi ürünlerini geliştiren bir teknoloji şirketiyiz.',
      ),
    }
  }

  const patchRes = await fetch(`${API}/page-content/${PAGE_KEY}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: nextContent }),
  })
  if (!patchRes.ok) {
    throw new Error(`about güncellenemedi (${patchRes.status}): ${await patchRes.text()}`)
  }

  const publicRes = await fetch(`${API}/page-content/${PAGE_KEY}`)
  const publicJson = (await publicRes.json()) as Record<string, unknown>
  const saved = (publicJson.data as Record<string, unknown> | undefined) ?? {}
  const savedHero = saved.hero && typeof saved.hero === 'object' ? (saved.hero as Record<string, unknown>).image : null
  console.log('Public about hero.image:', savedHero)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
