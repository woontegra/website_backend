/**
 * Pilot migrate: BH production Fazla Mesai → Woontegra bhModulePages CMS.
 * Source: https://webapi.bilirkisihesap.com/api/v2/public/content-bundle
 * Does NOT modify BH production data. Local DB upsert only.
 */
import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BH_CONTENT_BUNDLE_URL = 'https://webapi.bilirkisihesap.com/api/v2/public/content-bundle'
const PAGE_KEY = 'bhModulePages'
const SLUG = 'fazla-mesai'
const MODULE_CODE = 'fazla-mesai'

const DEFAULT_MODULE_HERO_NOTE =
  'Bu sayfa tanıtım amaçlıdır. Hesaplama işlemi program içinde yapılır.'
const DEFAULT_MODULE_CTA_DESCRIPTION =
  'Ücretsiz demo ile modülü deneyin veya mevcut hesabınızla programa giriş yapın.'

const PANEL_LOGIN_URL = 'https://panel.bilirkisihesap.com'
const PRICING_HREF = '/yazilimlar/bilirkisi-hesap/satin-al'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const prisma = new PrismaClient()

function escapeHtml(t) {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function articleHtml(sections) {
  return (sections || [])
    .map((s) => {
      const paras = (s.paragraphs || []).map((p) => `<p>${escapeHtml(p)}</p>`).join('')
      const list =
        s.listItems?.length > 0
          ? `<ul>${s.listItems.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
          : ''
      return `<h2>${escapeHtml(s.heading)}</h2>${paras}${list}`
    })
    .join('')
}

function baseVisibility(overrides = {}) {
  return {
    enabled: true,
    showTitle: true,
    showDescription: true,
    showImage: true,
    showButton: true,
    ...overrides,
  }
}

function baseStyle() {
  return {
    containerWidth: 'default',
    contentAlign: 'left',
    paddingTop: { desktop: '48px', mobile: '32px' },
    paddingBottom: { desktop: '48px', mobile: '32px' },
  }
}

function buildBlocks(fm, heroNote, bottomCtaDescription, heroImageUrl) {
  const lc = fm.landingContent
  let order = 0
  const blocks = []

  const heroButtons = [
    {
      id: 'bh-fm-hero-demo',
      label: 'Demo Talep Et',
      actionKey: 'openDemo',
      variant: 'primary',
      visible: true,
    },
    {
      id: 'bh-fm-hero-panel',
      label: 'Programa Giriş',
      href: PANEL_LOGIN_URL,
      variant: 'outline',
      visible: true,
      openInNewTab: true,
    },
  ]

  blocks.push({
    id: 'bh-fm-hero',
    type: 'hero',
    sortOrder: order++,
    title: fm.landingTitle,
    description: [lc.intro, heroNote].filter(Boolean).join('\n\n'),
    visibility: baseVisibility({ showBadge: true }),
    style: {
      ...baseStyle(),
      backgroundGradient: 'linear-gradient(135deg, #0f172a 0%, #134e4a 50%, #0f172a 100%)',
    },
    settings: {
      mode: heroImageUrl ? 'single-image' : 'gradient',
      layout: 'compact',
      badge: fm.landingEyebrow,
      slides: [],
      buttons: heroButtons,
      ...(heroImageUrl
        ? {
            desktopImage: { url: heroImageUrl, alt: `${fm.landingTitle} hero görseli` },
            mobileImage: { url: heroImageUrl, alt: `${fm.landingTitle} hero görseli` },
          }
        : {}),
    },
  })

  blocks.push({
    id: 'bh-fm-article',
    type: 'rich-text',
    sortOrder: order++,
    title: '',
    description: '',
    visibility: baseVisibility({ showTitle: false, showDescription: false }),
    style: {
      ...baseStyle(),
      containerWidth: 'narrow',
    },
    settings: { body: articleHtml(lc.articleSections) },
  })

  blocks.push({
    id: 'bh-fm-types',
    type: 'card-grid',
    sortOrder: order++,
    title: lc.moduleTypes?.title || 'Hesaplama türleri',
    description: '',
    visibility: baseVisibility({ showDescription: false }),
    style: baseStyle(),
    settings: {
      columns: 4,
      cards: (lc.moduleTypes?.cards || []).map((card, i) => ({
        id: `bh-fm-type-${i}`,
        title: card.title,
        description: card.description,
        icon: 'layers',
        color: '#059669',
      })),
    },
  })

  blocks.push({
    id: 'bh-fm-features',
    type: 'card-grid',
    sortOrder: order++,
    title: 'Programın özellikleri',
    description: '',
    visibility: baseVisibility({ showDescription: false }),
    style: baseStyle(),
    settings: {
      columns: 3,
      cards: (lc.programBenefits || []).map((b, i) => ({
        id: `bh-fm-feat-${i}`,
        title: b.title,
        description: b.text,
        icon: 'check-circle',
        color: '#059669',
      })),
    },
  })

  blocks.push({
    id: 'bh-fm-steps',
    type: 'card-grid',
    sortOrder: order++,
    title: 'Nasıl çalışır?',
    description: 'Üç adımda hesaplama ve rapor.',
    visibility: baseVisibility(),
    style: baseStyle(),
    settings: {
      columns: 3,
      variant: 'steps',
      cards: (fm.processSteps || []).map((s, i) => ({
        id: `bh-fm-step-${i}`,
        title: s.title,
        description: s.description,
        color: '#0d9488',
      })),
    },
  })

  blocks.push({
    id: 'bh-fm-cta',
    type: 'cta',
    sortOrder: order++,
    title: fm.ctaText,
    description: bottomCtaDescription,
    visibility: baseVisibility({ showImage: false }),
    style: baseStyle(),
    settings: {
      backgroundType: 'gradient',
      gradient: 'linear-gradient(135deg, #0f172a, #134e4a)',
      buttons: [
        {
          id: 'bh-fm-cta-demo',
          label: 'Demo Talep Et',
          actionKey: 'openDemo',
          variant: 'primary',
          visible: true,
        },
        {
          id: 'bh-fm-cta-panel',
          label: 'Programa Giriş',
          href: PANEL_LOGIN_URL,
          variant: 'outline',
          visible: true,
          openInNewTab: true,
        },
        {
          id: 'bh-fm-cta-pricing',
          label: 'Fiyatlandırma',
          href: PRICING_HREF,
          variant: 'secondary',
          visible: true,
        },
      ],
    },
  })

  return blocks
}

function resolveModuleMedia(mediaAssets, slugPath, slot) {
  const key = `module.${String(slugPath).replace(/^\//, '')}.${slot}.image`
  const hit = (mediaAssets || []).find((a) => a.assetKey === key && a.fileUrl)
  return hit?.fileUrl?.trim() || ''
}

function pickCatalogImage(mediaAssets) {
  const preferred = (mediaAssets || []).find(
    (a) =>
      a.fileUrl &&
      /fazla-mesai-alacag|dikey-fazla-mesai|standrtfazlamesai/i.test(String(a.assetKey || '')),
  )
  return preferred?.fileUrl?.trim() || undefined
}

function countParity(fm, blocks, heroNote, bottomCta) {
  const lc = fm.landingContent
  const article = blocks.find((b) => b.id === 'bh-fm-article')
  const body = article?.settings?.body || ''
  const headings = (lc.articleSections || []).map((s) => s.heading)
  const listItems = (lc.articleSections || []).flatMap((s) => s.listItems || [])
  const paragraphs = (lc.articleSections || []).flatMap((s) => s.paragraphs || [])
  return {
    source: {
      heroTitle: 1,
      heroIntro: lc.intro ? 1 : 0,
      heroNote: heroNote ? 1 : 0,
      heroCtas: 2,
      articleHeadings: headings.length,
      articleParagraphs: paragraphs.length,
      listItems: listItems.length,
      typeCards: lc.moduleTypes?.cards?.length || 0,
      programFeatures: lc.programBenefits?.length || 0,
      processSteps: fm.processSteps?.length || 0,
      bottomCtaTitle: fm.ctaText ? 1 : 0,
      bottomCtaDescription: bottomCta ? 1 : 0,
      bottomCtaButtons: 3,
      moduleMediaHero: 0,
      videoEmbed: 0,
    },
    migrated: {
      heroTitle: blocks.some((b) => b.type === 'hero' && b.title === fm.landingTitle) ? 1 : 0,
      heroIntro: String(blocks.find((b) => b.type === 'hero')?.description || '').includes(lc.intro)
        ? 1
        : 0,
      heroNote: String(blocks.find((b) => b.type === 'hero')?.description || '').includes(heroNote)
        ? 1
        : 0,
      heroCtas: blocks.find((b) => b.type === 'hero')?.settings?.buttons?.length || 0,
      articleHeadings: headings.filter((h) => body.includes(h)).length,
      articleParagraphs: paragraphs.filter((p) => body.includes(escapeHtml(p).slice(0, 40))).length,
      listItems: listItems.filter((i) => body.includes(i)).length,
      typeCards: blocks.find((b) => b.id === 'bh-fm-types')?.settings?.cards?.length || 0,
      programFeatures: blocks.find((b) => b.id === 'bh-fm-features')?.settings?.cards?.length || 0,
      processSteps: blocks.find((b) => b.id === 'bh-fm-steps')?.settings?.cards?.length || 0,
      bottomCtaTitle: blocks.some((b) => b.type === 'cta' && b.title === fm.ctaText) ? 1 : 0,
      bottomCtaDescription: blocks.some(
        (b) => b.type === 'cta' && b.description === bottomCta,
      )
        ? 1
        : 0,
      bottomCtaButtons: blocks.find((b) => b.type === 'cta')?.settings?.buttons?.length || 0,
      moduleMediaHero: blocks.find((b) => b.type === 'hero')?.settings?.desktopImage?.url ? 1 : 0,
      videoEmbed: blocks.filter((b) => b.type === 'video-embed').length,
    },
  }
}

async function main() {
  const res = await fetch(BH_CONTENT_BUNDLE_URL)
  if (!res.ok) throw new Error(`BH content-bundle HTTP ${res.status}`)
  const bundle = await res.json()
  const fm = (bundle.calculationModules || []).find((m) => m.code === MODULE_CODE)
  if (!fm?.landingContent) throw new Error('Fazla Mesai module missing from BH content-bundle')

  const pathSlug = fm.slug || '/fazla-mesai-hesaplama'
  const seoRow = (bundle.seo || []).find(
    (s) => s.path === pathSlug || s.path === `/${SLUG}` || s.path === '/fazla-mesai-hesaplama',
  )
  const pageHero = (bundle.pageContents || []).find(
    (p) =>
      (p.pageKey === pathSlug || p.pageKey === pathSlug.replace(/^\//, '')) &&
      p.sectionKey === 'hero',
  )
  const pageCta = (bundle.pageContents || []).find(
    (p) =>
      (p.pageKey === pathSlug || p.pageKey === pathSlug.replace(/^\//, '')) &&
      p.sectionKey === 'cta',
  )

  const heroNote = pageHero?.subtitle?.trim() || DEFAULT_MODULE_HERO_NOTE
  let bottomCtaDescription = DEFAULT_MODULE_CTA_DESCRIPTION
  if (pageCta?.bodyJson) {
    try {
      const body = typeof pageCta.bodyJson === 'string' ? JSON.parse(pageCta.bodyJson) : pageCta.bodyJson
      bottomCtaDescription =
        body?.bottomCtaDescription || body?.ctaDescription || pageCta.description || bottomCtaDescription
    } catch {
      bottomCtaDescription = pageCta.description?.trim() || bottomCtaDescription
    }
  } else if (pageCta?.description?.trim()) {
    bottomCtaDescription = pageCta.description.trim()
  }

  const heroImageUrl = resolveModuleMedia(bundle.mediaAssets, pathSlug, 'hero')
  const featuresImageUrl = resolveModuleMedia(bundle.mediaAssets, pathSlug, 'features')
  const ctaImageUrl = resolveModuleMedia(bundle.mediaAssets, pathSlug, 'cta')
  const catalogImage = pickCatalogImage(bundle.mediaAssets)

  const blocks = buildBlocks(fm, heroNote, bottomCtaDescription, heroImageUrl)
  if (featuresImageUrl) {
    // Preserve bound features media as gallery when CMS has a slot binding (none in current prod).
    blocks.splice(3, 0, {
      id: 'bh-fm-features-media',
      type: 'gallery',
      sortOrder: 3,
      title: '',
      description: '',
      visibility: baseVisibility({ showTitle: false, showDescription: false }),
      style: baseStyle(),
      settings: {
        columns: 1,
        images: [{ id: 'bh-fm-features-img', url: featuresImageUrl, alt: 'Özellikler görseli' }],
      },
    })
    blocks.forEach((b, i) => {
      b.sortOrder = i
    })
  }
  if (ctaImageUrl) {
    const cta = blocks.find((b) => b.id === 'bh-fm-cta')
    if (cta) {
      cta.settings.backgroundType = 'image'
      cta.settings.imageUrl = ctaImageUrl
    }
  }

  const seoTitle = seoRow?.title?.trim() || fm.landingTitle
  const seoDescription =
    seoRow?.description?.trim() || fm.landingDescription || fm.cardDescription

  const page = {
    title: fm.cardTitle || fm.landingTitle,
    slug: SLUG,
    shortDescription: fm.cardDescription || fm.landingDescription,
    category: fm.landingEyebrow || 'İşçilik alacağı',
    cardImage: catalogImage,
    iconName: fm.iconName || 'Timer',
    sortOrder: typeof fm.sortOrder === 'number' ? fm.sortOrder : 3,
    published: true,
    status: 'published',
    showOnBhProductPage: true,
    seoTitle,
    seoDescription,
    source: {
      bhCode: fm.code,
      bhSlug: fm.slug,
      migratedAt: new Date().toISOString(),
      contentBundleUrl: BH_CONTENT_BUNDLE_URL,
    },
    blocks,
  }

  const document = { pages: { [SLUG]: page } }
  const parity = countParity(fm, blocks, heroNote, bottomCtaDescription)

  const outDir = path.join(__dirname, '../tmp')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(
    path.join(outDir, 'bh-fazla-mesai-migrate-payload.json'),
    JSON.stringify({ document, parity, mediaSlots: { heroImageUrl, featuresImageUrl, ctaImageUrl } }, null, 2),
    'utf8',
  )

  await prisma.pageContent.upsert({
    where: { pageKey: PAGE_KEY },
    create: { pageKey: PAGE_KEY, content: JSON.stringify(document) },
    update: { content: JSON.stringify(document), updatedAt: new Date() },
  })

  console.log(JSON.stringify({ ok: true, pageKey: PAGE_KEY, slug: SLUG, blockCount: blocks.length, parity }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
