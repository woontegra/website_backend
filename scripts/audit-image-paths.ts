/**
 * Veritabanındaki görsel path'lerini tarar.
 * Kullanım: npx tsx scripts/audit-image-paths.ts
 */
import path from 'path'
import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { normalizePublicImagePath } from '../src/services/imagePathAliases'

config({ path: path.resolve(process.cwd(), '.env') })
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(path.join(process.cwd(), 'scripts/resolve-database-url.cjs')).applyToProcessEnv()
} catch {
  /* */
}

const prisma = new PrismaClient()

const IMAGE_FIELD_KEYS = new Set([
  'image',
  'imageUrl',
  'featuredImage',
  'coverImage',
  'logoUrl',
  'logo',
  'darkModeLogo',
  'backgroundImage',
  'ogImage',
  'twitterImage',
  'organizationLogo',
])

type Finding = {
  source: string
  id: string
  field: string
  original: string
  normalized: string
  issue: 'uploads' | 'alias' | 'empty' | 'external' | 'ok'
}

const findings: Finding[] = []

function classify(url: string): Finding['issue'] {
  const trimmed = url.trim()
  if (!trimmed) return 'empty'
  if (trimmed.startsWith('/uploads/')) return 'uploads'
  if (/^https?:\/\//i.test(trimmed)) return 'external'
  const normalized = normalizePublicImagePath(trimmed)
  if (!normalized) return 'empty'
  if (normalized !== trimmed) return 'alias'
  if (normalized.startsWith('/images/')) return 'ok'
  return 'ok'
}

function walkJson(source: string, id: string, value: unknown, fieldPath: string) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkJson(source, id, item, `${fieldPath}[${index}]`))
    return
  }
  if (typeof value !== 'object' || value === null) return

  for (const [key, child] of Object.entries(value)) {
    const nextPath = fieldPath ? `${fieldPath}.${key}` : key
    if (IMAGE_FIELD_KEYS.has(key) && typeof child === 'string' && child.trim()) {
      const original = child.trim()
      const normalized = normalizePublicImagePath(original)
      findings.push({
        source,
        id,
        field: nextPath,
        original,
        normalized,
        issue: classify(original),
      })
    } else {
      walkJson(source, id, child, nextPath)
    }
  }
}

async function main() {
  const pageContents = await prisma.pageContent.findMany()
  for (const row of pageContents) {
    try {
      walkJson('pageContent', row.pageKey, JSON.parse(row.content), 'content')
    } catch {
      console.warn(`pageContent ${row.pageKey}: JSON parse hatası`)
    }
  }

  const brands = await prisma.brand.findMany()
  for (const row of brands) {
    if (row.image?.trim()) {
      const original = row.image.trim()
      findings.push({
        source: 'brand',
        id: row.id,
        field: 'image',
        original,
        normalized: normalizePublicImagePath(original),
        issue: classify(original),
      })
    }
  }

  const posts = await prisma.post.findMany()
  for (const row of posts) {
    if (row.featuredImage?.trim()) {
      const original = row.featuredImage.trim()
      findings.push({
        source: 'post',
        id: row.slug || row.id,
        field: 'featuredImage',
        original,
        normalized: normalizePublicImagePath(original),
        issue: classify(original),
      })
    }
  }

  const media = await prisma.mediaAsset.findMany()
  for (const row of media) {
    if (row.url?.trim()) {
      const original = row.url.trim()
      findings.push({
        source: 'mediaAsset',
        id: row.id,
        field: 'url',
        original,
        normalized: normalizePublicImagePath(original),
        issue: classify(original),
      })
    }
  }

  const settings = await prisma.siteSetting.findMany()
  for (const row of settings) {
    if (!IMAGE_FIELD_KEYS.has(row.key)) continue
    if (!row.value?.trim()) continue
    const original = row.value.trim()
    findings.push({
      source: 'siteSetting',
      id: row.key,
      field: 'value',
      original,
      normalized: normalizePublicImagePath(original),
      issue: classify(original),
    })
  }

  const uploads = findings.filter((f) => f.issue === 'uploads')
  const aliases = findings.filter((f) => f.issue === 'alias')
  const ok = findings.filter((f) => f.issue === 'ok')
  const external = findings.filter((f) => f.issue === 'external')

  console.log('\n=== Woontegra Görsel Path Denetimi ===\n')
  console.log(`Toplam görsel alanı: ${findings.length}`)
  console.log(`  /uploads/ (kayıp riski): ${uploads.length}`)
  console.log(`  Alias ile düzeltilebilir: ${aliases.length}`)
  console.log(`  /images/ doğru: ${ok.length}`)
  console.log(`  Harici URL: ${external.length}`)

  if (uploads.length) {
    console.log('\n--- /uploads/ kayıtları (deploy sonrası kaybolur) ---')
    for (const f of uploads) {
      console.log(`  [${f.source}] ${f.id} → ${f.field}: ${f.original}`)
    }
  }

  if (aliases.length) {
    console.log('\n--- Uzantı/alias uyuşmazlığı ---')
    for (const f of aliases) {
      console.log(`  [${f.source}] ${f.id} → ${f.field}: ${f.original} → ${f.normalized}`)
    }
  }

  if (!findings.length) {
    console.log('\nVeritabanında görsel path kaydı bulunamadı.')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
