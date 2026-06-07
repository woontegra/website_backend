/**
 * /uploads/... kayıtlarını bilinen /images/... path'lerine taşır.
 * Kullanım: npx tsx scripts/fix-upload-image-paths.ts
 */
import path from 'path'
import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { sanitizeImageFields } from '../src/utils/sanitizeImageFields'

config({ path: path.resolve(process.cwd(), '.env') })
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(path.join(process.cwd(), 'scripts/resolve-database-url.cjs')).applyToProcessEnv()
} catch {
  /* */
}

const prisma = new PrismaClient()

/** pageKey → hero image (sections[0].data.image veya flat image alanı) */
const PAGE_HERO_IMAGES: Record<string, string> = {
  home: '/images/hero-dashboard.jpg',
  'software-dev': '/images/yazilim.png',
  about: '/images/about-hero.png',
  'web-design': '/images/web-tasarim.png',
  ecommerce: '/images/e-ticaret.jpeg',
  saas: '/images/saas-dashboard.jpg',
  'trademark-patent': '/images/marka-patent-belge.jpg',
  'digital-consulting': '/images/dijital-danismanlik.jpg',
  solutions: '/images/cozumler-sistem.jpg',
}

function fixPageContent(content: unknown, pageKey: string): { fixed: unknown; changed: boolean } {
  const sanitized = sanitizeImageFields(content)
  const heroPath = PAGE_HERO_IMAGES[pageKey]
  if (!heroPath) return { fixed: sanitized, changed: sanitized !== content }

  if (
    typeof sanitized === 'object' &&
    sanitized !== null &&
    'sections' in sanitized &&
    Array.isArray((sanitized as { sections: unknown[] }).sections)
  ) {
    const page = sanitized as { sections: { type?: string; data?: { image?: string } }[] }
    let changed = JSON.stringify(sanitized) !== JSON.stringify(content)
    for (const section of page.sections) {
      if (section.type === 'hero' && section.data) {
        const img = section.data.image ?? ''
        if (!img || img.startsWith('/uploads/')) {
          section.data.image = heroPath
          changed = true
        }
      }
    }
    return { fixed: page, changed }
  }

  return { fixed: sanitized, changed: JSON.stringify(sanitized) !== JSON.stringify(content) }
}

async function main() {
  const rows = await prisma.pageContent.findMany()
  let updated = 0

  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.content) as unknown
      const { fixed, changed } = fixPageContent(parsed, row.pageKey)
      if (changed) {
        await prisma.pageContent.update({
          where: { id: row.id },
          data: { content: JSON.stringify(fixed) },
        })
        console.log(`✓ pageContent/${row.pageKey} güncellendi`)
        updated++
      }
    } catch (e) {
      console.warn(`pageContent ${row.pageKey} atlandı:`, e)
    }
  }

  const mediaRows = await prisma.mediaAsset.findMany({
    where: { url: { startsWith: '/uploads/' } },
  })
  for (const row of mediaRows) {
    await prisma.mediaAsset.delete({ where: { id: row.id } })
    console.log(`✓ mediaAsset silindi (geçici upload): ${row.url}`)
    updated++
  }

  console.log(`\nToplam ${updated} kayıt düzeltildi/silindi.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
