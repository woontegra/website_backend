/**
 * Local-only: sync bhModulePages catalog from live BH content-bundle only.
 * Does NOT invent modules. Preserves existing page blocks (e.g. fazla-mesai).
 * Removes catalog pages whose code is not in the live published SoT.
 */
import { PrismaClient } from '@prisma/client'

const BH_CONTENT_BUNDLE_URL = 'https://webapi.bilirkisihesap.com/api/v2/public/content-bundle'
const PAGE_KEY = 'bhModulePages'

const prisma = new PrismaClient()

function stubPage(mod) {
  const slug = String(mod.code || '').trim()
  const category = String(mod.landingEyebrow || 'İşçilik alacağı').trim()
  return {
    title: mod.cardTitle || mod.landingTitle || slug,
    slug,
    shortDescription: mod.cardDescription || mod.landingDescription || '',
    category,
    iconName: mod.iconName || 'Layers',
    sortOrder: typeof mod.sortOrder === 'number' ? mod.sortOrder : 0,
    published: true,
    status: 'published',
    showOnBhProductPage: true,
    seoTitle: mod.landingTitle || mod.cardTitle,
    seoDescription: mod.landingDescription || mod.cardDescription || '',
    blocks: [],
  }
}

async function main() {
  const res = await fetch(BH_CONTENT_BUNDLE_URL)
  if (!res.ok) throw new Error(`BH content-bundle HTTP ${res.status}`)
  const bundle = await res.json()
  const fromApi = (bundle.calculationModules || []).slice()
  fromApi.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))

  const allowedCodes = new Set(fromApi.map((m) => String(m.code || '').trim()).filter(Boolean))
  if (allowedCodes.size === 0) throw new Error('Live BH content-bundle returned 0 calculationModules')

  const existing = await prisma.pageContent.findUnique({ where: { pageKey: PAGE_KEY } })
  let doc = { pages: {} }
  if (existing?.content) {
    try {
      doc = typeof existing.content === 'string' ? JSON.parse(existing.content) : existing.content
    } catch {
      doc = { pages: {} }
    }
  }
  if (!doc.pages || typeof doc.pages !== 'object') doc.pages = {}

  // Drop any catalog page not in live SoT (e.g. hard-coded sendikal)
  const removed = []
  for (const slug of Object.keys(doc.pages)) {
    if (!allowedCodes.has(slug)) {
      removed.push(slug)
      delete doc.pages[slug]
    }
  }

  for (const mod of fromApi) {
    const slug = String(mod.code || '').trim()
    if (!slug) continue
    const prev = doc.pages[slug] && typeof doc.pages[slug] === 'object' ? doc.pages[slug] : null
    const next = stubPage(mod)
    if (prev) {
      doc.pages[slug] = {
        ...next,
        ...prev,
        title: prev.title || next.title,
        slug,
        shortDescription: prev.shortDescription || next.shortDescription,
        category: prev.category || next.category,
        iconName: prev.iconName || next.iconName,
        sortOrder: typeof mod.sortOrder === 'number' ? mod.sortOrder : next.sortOrder,
        published: prev.published !== false && prev.status !== 'draft',
        status: prev.status === 'draft' ? 'draft' : 'published',
        showOnBhProductPage: true,
        seoTitle: prev.seoTitle || next.seoTitle,
        seoDescription: prev.seoDescription || next.seoDescription,
        blocks: Array.isArray(prev.blocks) ? prev.blocks : [],
        source: prev.source,
      }
    } else {
      doc.pages[slug] = next
    }
  }

  const fm = doc.pages['fazla-mesai']
  if (fm) {
    fm.showOnBhProductPage = true
    fm.published = true
    fm.status = 'published'
  }

  const payload = JSON.stringify(doc)
  await prisma.pageContent.upsert({
    where: { pageKey: PAGE_KEY },
    create: { pageKey: PAGE_KEY, content: payload },
    update: { content: payload },
  })

  const product = Object.values(doc.pages)
    .filter((p) => p && p.published !== false && p.status !== 'draft' && p.showOnBhProductPage === true)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.title).localeCompare(String(b.title), 'tr'))

  console.log(
    JSON.stringify(
      {
        ok: true,
        pageKey: PAGE_KEY,
        liveSoTCount: fromApi.length,
        totalPages: Object.keys(doc.pages).length,
        productPageModules: product.length,
        removed,
        titles: product.map((p) => p.title),
        slugs: product.map((p) => p.slug),
        fazlaMesaiBlocks: Array.isArray(fm?.blocks) ? fm.blocks.length : 0,
      },
      null,
      2,
    ),
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
