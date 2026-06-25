/**
 * Gerçek logo + hero dosyalarını R2'ye yükler ve site ayarları / ana sayfa kaydını günceller.
 *   npx tsx scripts/sync-real-branding-assets.ts
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { getR2PublicBucketName, getR2S3Client } from '../src/lib/r2.client'
import { buildBrandingObjectKey, inferContentType, uploadPublicObject } from '../src/services/r2Upload.service'

const API = process.env.API_BASE ?? 'http://localhost:4000/api'
const EMAIL = 'info@woontegra.com'
const PASS = process.env.ADMIN_SEED_PASSWORD ?? 'Admin123!'

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const LOGO_FILE = path.join(REPO_ROOT, 'frontendV3', 'public', 'logo.png')
const HERO_FILE = path.join(REPO_ROOT, 'frontendV3', 'public', 'images', 'hero-dashboard.jpg')

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

async function uploadFile(filePath: string, objectKey: string): Promise<{ publicUrl: string; size: number }> {
  const body = fs.readFileSync(filePath)
  if (body.length < 1024) {
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
  return { publicUrl: uploaded.publicUrl, size: body.length }
}

async function main() {
  if (!fs.existsSync(LOGO_FILE)) throw new Error(`Logo dosyası yok: ${LOGO_FILE}`)
  if (!fs.existsSync(HERO_FILE)) throw new Error(`Hero dosyası yok: ${HERO_FILE}`)

  const logoKey = buildBrandingObjectKey('logo', 'woontegra-logo.png')
  const heroKey = `catalog/general/2026/06/hero-dashboard.jpg`

  const logo = await uploadFile(LOGO_FILE, logoKey)
  const hero = await uploadFile(HERO_FILE, heroKey)

  console.log('R2 upload OK:', {
    logo: { publicUrl: logo.publicUrl, size: logo.size },
    hero: { publicUrl: hero.publicUrl, size: hero.size },
  })

  const token = await login()

  const settingsRes = await fetch(`${API}/settings/admin`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const settingsJson = (await settingsRes.json()) as Record<string, unknown>
  const settings = (settingsJson.data as Record<string, unknown>) ?? settingsJson

  const patchSettings = await fetch(`${API}/settings`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...settings,
      logo: logo.publicUrl,
      logoUpdatedAt: new Date().toISOString(),
    }),
  })
  const patchedSettings = (await patchSettings.json()) as Record<string, unknown>
  console.log('Settings logo:', (patchedSettings.logo as string | undefined) ?? logo.publicUrl)

  const homeRes = await fetch(`${API}/page-content/home`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const homeJson = (await homeRes.json()) as Record<string, unknown>
  const homeRaw = ((homeJson.data as Record<string, unknown> | null) ?? {}) as Record<string, unknown>
  const existingHero =
    homeRaw.hero && typeof homeRaw.hero === 'object'
      ? (homeRaw.hero as Record<string, unknown>)
      : {}
  const homeContent = {
    ...homeRaw,
    version: 4,
    hero: {
      enabled: existingHero.enabled ?? true,
      tag: existingHero.tag ?? 'Woontegra',
      title: existingHero.title ?? 'Dijital Dünyada Gerçek Çözümler Üretiyoruz',
      subtitle:
        existingHero.subtitle ??
        'Sadece yazılım geliştirmiyoruz, kendi ürünlerimizi yaratıyor ve yönetiyoruz.',
      image: hero.publicUrl,
      button1Text: existingHero.button1Text ?? 'Çözümleri İncele',
      button1Href: existingHero.button1Href ?? '#hizmetler',
      button2Text: existingHero.button2Text ?? 'İletişime Geç',
      button2Href: existingHero.button2Href ?? '/iletisim',
    },
  }

  const homePatch = await fetch(`${API}/page-content/home`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: homeContent }),
  })
  const homePatchJson = (await homePatch.json()) as Record<string, unknown>
  const saved = (homePatchJson.data as Record<string, unknown> | undefined) ?? homeContent
  const savedHero = (saved.hero as Record<string, unknown> | undefined)?.image
  console.log('Home hero.image:', savedHero ?? hero.publicUrl)

  const publicSettings = await fetch(`${API}/settings`)
  const pubSettings = (await publicSettings.json()) as Record<string, unknown>
  console.log('Public settings logo:', pubSettings.logo)

  const publicHome = await fetch(`${API}/page-content/home`)
  const pubHomeJson = (await publicHome.json()) as Record<string, unknown>
  const pubHome = (pubHomeJson.data as Record<string, unknown> | undefined) ?? {}
  const pubHero = ((pubHome.hero as Record<string, unknown> | undefined)?.image as string | undefined) ?? ''
  console.log('Public home hero.image:', pubHero)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
