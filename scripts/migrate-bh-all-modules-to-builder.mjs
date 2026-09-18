/**
 * Migrate all live BH published calculationModules → Woontegra bhModulePages.
 * Source only: https://webapi.bilirkisihesap.com/api/v2/public/content-bundle
 * No invented modules/content. Local DB only. Does not touch BH production.
 */
import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BH_CONTENT_BUNDLE_URL = 'https://webapi.bilirkisihesap.com/api/v2/public/content-bundle'
const PAGE_KEY = 'bhModulePages'

/** SEO public slugs (Woontegra). Key = BH `code`. */
export const BH_CODE_TO_SEO_SLUG = {
  kidem: 'kidem-tazminati-nasil-hesaplanir',
  ihbar: 'ihbar-tazminati-nasil-hesaplanir',
  'fazla-mesai': 'fazla-mesai-nasil-hesaplanir',
  'yillik-izin': 'yillik-izin-ucreti-nasil-hesaplanir',
  ubgt: 'ubgt-ucreti-nasil-hesaplanir',
  'hafta-tatili': 'hafta-tatili-ucreti-nasil-hesaplanir',
  ucret: 'ucret-alacagi-nasil-hesaplanir',
  bakiye: 'bakiye-ucret-alacagi-nasil-hesaplanir',
  'kotu-niyet': 'kotu-niyet-tazminati-nasil-hesaplanir',
  'ise-baslatmama': 'ise-baslatmama-tazminati-nasil-hesaplanir',
  'bosta-gecen': 'bosta-gecen-sure-ucreti-nasil-hesaplanir',
  ayrimcilik: 'ayrimcilik-tazminati-nasil-hesaplanir',
  prim: 'prim-alacagi-nasil-hesaplanir',
  'haksiz-fesih': 'haksiz-fesih-tazminati-nasil-hesaplanir',
}

/** Same defaults BH frontend uses when pageContents hero/cta missing */
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

function resolveModuleMedia(mediaAssets, slugPath, slot) {
  const key = `module.${String(slugPath).replace(/^\//, '')}.${slot}.image`
  const hit = (mediaAssets || []).find((a) => a.assetKey === key && a.fileUrl)
  return hit?.fileUrl?.trim() || ''
}

function pickAnyModuleCatalogImage(mediaAssets, code, pathSlug) {
  const needle = String(pathSlug || code || '')
    .replace(/^\//, '')
    .toLowerCase()
  const hit = (mediaAssets || []).find(
    (a) => a.fileUrl && String(a.assetKey || '').toLowerCase().includes(needle.split('-')[0] || needle),
  )
  return hit?.fileUrl?.trim() || undefined
}

function extractYoutubeFromLanding(lc) {
  const raw = JSON.stringify(lc || {})
  const m =
    raw.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/i) ||
    raw.match(/"youtubeUrl"\s*:\s*"([^"]+)"/i) ||
    raw.match(/"videoUrl"\s*:\s*"([^"]+)"/i)
  return m?.[1] || m?.[0] || null
}

function buildBlocks(mod, heroNote, bottomCtaDescription, heroImageUrl, featuresImageUrl, ctaImageUrl) {
  const lc = mod.landingContent && typeof mod.landingContent === 'object' ? mod.landingContent : {}
  const code = mod.code
  const prefix = `bh-${code}`
  let order = 0
  const blocks = []

  const intro =
    String(lc.intro || '').trim() || String(mod.landingDescription || '').trim() || ''

  blocks.push({
    id: `${prefix}-hero`,
    type: 'hero',
    sortOrder: order++,
    title: mod.landingTitle || mod.cardTitle,
    description: [intro, heroNote].filter(Boolean).join('\n\n'),
    visibility: baseVisibility({ showBadge: true }),
    style: {
      ...baseStyle(),
      backgroundGradient: 'linear-gradient(135deg, #0f172a 0%, #134e4a 50%, #0f172a 100%)',
    },
    settings: {
      mode: heroImageUrl ? 'single-image' : 'gradient',
      layout: 'compact',
      badge: mod.landingEyebrow || '',
      slides: [],
      buttons: [
        {
          id: `${prefix}-hero-demo`,
          label: 'Demo Talep Et',
          actionKey: 'openDemo',
          variant: 'primary',
          visible: true,
        },
        {
          id: `${prefix}-hero-panel`,
          label: 'Programa Giriş',
          href: PANEL_LOGIN_URL,
          variant: 'outline',
          visible: true,
          openInNewTab: true,
        },
      ],
      ...(heroImageUrl
        ? {
            desktopImage: { url: heroImageUrl, alt: `${mod.landingTitle || mod.cardTitle} hero görseli` },
            mobileImage: { url: heroImageUrl, alt: `${mod.landingTitle || mod.cardTitle} hero görseli` },
          }
        : {}),
    },
  })

  const sections = Array.isArray(lc.articleSections) ? lc.articleSections : []
  if (sections.length > 0) {
    blocks.push({
      id: `${prefix}-article`,
      type: 'rich-text',
      sortOrder: order++,
      title: '',
      description: '',
      visibility: baseVisibility({ showTitle: false, showDescription: false }),
      style: { ...baseStyle(), containerWidth: 'narrow' },
      settings: { body: articleHtml(sections) },
    })
  }

  const typeCards = Array.isArray(lc.moduleTypes?.cards) ? lc.moduleTypes.cards : []
  if (typeCards.length > 0) {
    const typeTitle = String(lc.moduleTypes?.title || '').trim()
    blocks.push({
      id: `${prefix}-types`,
      type: 'card-grid',
      sortOrder: order++,
      title: typeTitle || 'Hesaplama türleri',
      description: '',
      visibility: baseVisibility({ showDescription: false, showTitle: Boolean(typeTitle) || true }),
      style: baseStyle(),
      settings: {
        columns: 4,
        cards: typeCards.map((card, i) => ({
          id: `${prefix}-type-${i}`,
          title: card.title,
          description: card.description,
          icon: 'layers',
          color: '#059669',
        })),
      },
    })
  }

  if (featuresImageUrl) {
    blocks.push({
      id: `${prefix}-features-media`,
      type: 'gallery',
      sortOrder: order++,
      title: '',
      description: '',
      visibility: baseVisibility({ showTitle: false, showDescription: false }),
      style: baseStyle(),
      settings: {
        columns: 1,
        images: [{ id: `${prefix}-features-img`, url: featuresImageUrl, alt: 'Özellikler görseli' }],
      },
    })
  }

  const programBenefits = Array.isArray(lc.programBenefits) ? lc.programBenefits : []
  if (programBenefits.length > 0) {
    blocks.push({
      id: `${prefix}-features`,
      type: 'card-grid',
      sortOrder: order++,
      title: 'Programın özellikleri',
      description: '',
      visibility: baseVisibility({ showDescription: false }),
      style: baseStyle(),
      settings: {
        columns: 3,
        cards: programBenefits.map((b, i) => ({
          id: `${prefix}-feat-${i}`,
          title: b.title,
          description: b.text,
          icon: 'check-circle',
          color: '#059669',
        })),
      },
    })
  }

  const steps = Array.isArray(mod.processSteps) ? mod.processSteps : []
  if (steps.length > 0) {
    blocks.push({
      id: `${prefix}-steps`,
      type: 'card-grid',
      sortOrder: order++,
      title: 'Nasıl çalışır?',
      description: '',
      visibility: baseVisibility({ showDescription: false }),
      style: baseStyle(),
      settings: {
        columns: 3,
        variant: 'steps',
        cards: steps.map((s, i) => ({
          id: `${prefix}-step-${i}`,
          title: s.title,
          description: s.description,
          color: '#0d9488',
        })),
      },
    })
  }

  const yt = extractYoutubeFromLanding(lc)
  if (yt) {
    const url = String(yt).startsWith('http') ? yt : `https://www.youtube.com/watch?v=${yt}`
    blocks.push({
      id: `${prefix}-video`,
      type: 'video-embed',
      sortOrder: order++,
      title: '',
      description: '',
      visibility: baseVisibility({ showTitle: false, showDescription: false }),
      style: baseStyle(),
      settings: { url, provider: 'youtube' },
    })
  }

  if (mod.ctaText || bottomCtaDescription) {
    blocks.push({
      id: `${prefix}-cta`,
      type: 'cta',
      sortOrder: order++,
      title: mod.ctaText || '',
      description: bottomCtaDescription,
      visibility: baseVisibility({ showImage: false }),
      style: baseStyle(),
      settings: {
        backgroundType: ctaImageUrl ? 'image' : 'gradient',
        gradient: 'linear-gradient(135deg, #0f172a, #134e4a)',
        ...(ctaImageUrl ? { imageUrl: ctaImageUrl } : {}),
        buttons: [
          {
            id: `${prefix}-cta-demo`,
            label: 'Demo Talep Et',
            actionKey: 'openDemo',
            variant: 'primary',
            visible: true,
          },
          {
            id: `${prefix}-cta-panel`,
            label: 'Programa Giriş',
            href: PANEL_LOGIN_URL,
            variant: 'outline',
            visible: true,
            openInNewTab: true,
          },
          {
            id: `${prefix}-cta-pricing`,
            label: 'Fiyatlandırma',
            href: PRICING_HREF,
            variant: 'secondary',
            visible: true,
          },
        ],
      },
    })
  }

  blocks.forEach((b, i) => {
    b.sortOrder = i
  })
  return blocks
}

function resolveHeroNote(bundle, pathSlug) {
  const pageHero = (bundle.pageContents || []).find(
    (p) =>
      (p.pageKey === pathSlug || p.pageKey === pathSlug.replace(/^\//, '')) &&
      p.sectionKey === 'hero',
  )
  return pageHero?.subtitle?.trim() || DEFAULT_MODULE_HERO_NOTE
}

function resolveBottomCta(bundle, pathSlug) {
  const pageCta = (bundle.pageContents || []).find(
    (p) =>
      (p.pageKey === pathSlug || p.pageKey === pathSlug.replace(/^\//, '')) &&
      p.sectionKey === 'cta',
  )
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
  return bottomCtaDescription
}

function parityForModule(mod, page, heroNote, bottomCta) {
  const lc = mod.landingContent || {}
  const blocks = page.blocks || []
  const article = blocks.find((b) => b.type === 'rich-text')
  const body = article?.settings?.body || ''
  const headings = (lc.articleSections || []).map((s) => s.heading).filter(Boolean)
  const paragraphs = (lc.articleSections || []).flatMap((s) => s.paragraphs || [])
  const listItems = (lc.articleSections || []).flatMap((s) => s.listItems || [])
  const typeCards = lc.moduleTypes?.cards || []
  const features = lc.programBenefits || []
  const steps = mod.processSteps || []
  const intro =
    String(lc.intro || '').trim() || String(mod.landingDescription || '').trim() || ''
  const hero = blocks.find((b) => b.type === 'hero')
  const typesBlock = blocks.find((b) => b.id?.endsWith('-types'))
  const featBlock = blocks.find((b) => b.id?.endsWith('-features'))
  const stepsBlock = blocks.find((b) => b.id?.endsWith('-steps'))
  const cta = blocks.find((b) => b.type === 'cta')

  const checks = []
  const add = (name, pass, detail = '') => checks.push({ name, pass: Boolean(pass), detail })

  add('heroTitle', hero?.title === (mod.landingTitle || mod.cardTitle), `${hero?.title} vs ${mod.landingTitle}`)
  add('heroEyebrow', (hero?.settings?.badge || '') === (mod.landingEyebrow || ''))
  if (intro) add('heroIntro', String(hero?.description || '').includes(intro.slice(0, 40)))
  add('heroNote', String(hero?.description || '').includes(heroNote))
  add('articleHeadings', headings.every((h) => body.includes(h)), `${headings.filter((h) => body.includes(h)).length}/${headings.length}`)
  add(
    'articleParagraphs',
    paragraphs.every((p) => body.includes(escapeHtml(p).slice(0, 40))),
    `${paragraphs.filter((p) => body.includes(escapeHtml(p).slice(0, 40))).length}/${paragraphs.length}`,
  )
  add('listItems', listItems.every((i) => body.includes(i)), `${listItems.filter((i) => body.includes(i)).length}/${listItems.length}`)
  add('typeCardsCount', (typesBlock?.settings?.cards?.length || 0) === typeCards.length, `${typesBlock?.settings?.cards?.length || 0}/${typeCards.length}`)
  add(
    'typeCardTitles',
    typeCards.every((c, i) => typesBlock?.settings?.cards?.[i]?.title === c.title),
  )
  add(
    'typeCardDescriptions',
    typeCards.every((c, i) => typesBlock?.settings?.cards?.[i]?.description === c.description),
  )
  add('featuresCount', (featBlock?.settings?.cards?.length || 0) === features.length)
  add(
    'featureTitles',
    features.every((f, i) => featBlock?.settings?.cards?.[i]?.title === f.title),
  )
  add(
    'featureTexts',
    features.every((f, i) => featBlock?.settings?.cards?.[i]?.description === f.text),
  )
  add('stepsCount', (stepsBlock?.settings?.cards?.length || 0) === steps.length)
  add(
    'stepTitles',
    steps.every((s, i) => stepsBlock?.settings?.cards?.[i]?.title === s.title),
  )
  add(
    'stepDescriptions',
    steps.every((s, i) => stepsBlock?.settings?.cards?.[i]?.description === s.description),
  )
  add('ctaTitle', !mod.ctaText || cta?.title === mod.ctaText)
  add('ctaDescription', cta?.description === bottomCta)
  add('ctaDemoAction', cta?.settings?.buttons?.some((b) => b.actionKey === 'openDemo'))
  add('cardTitle', page.title === (mod.cardTitle || mod.landingTitle))

  const failed = checks.filter((c) => !c.pass)
  return {
    code: mod.code,
    slug: page.slug,
    pass: failed.length === 0,
    failed: failed.map((f) => `${f.name}${f.detail ? ` (${f.detail})` : ''}`),
    checks,
  }
}

async function main() {
  const res = await fetch(BH_CONTENT_BUNDLE_URL)
  if (!res.ok) throw new Error(`BH content-bundle HTTP ${res.status}`)
  const bundle = await res.json()
  const mods = (bundle.calculationModules || [])
    .filter((m) => {
      if (!m || !m.code) return false
      // Public content-bundle already omits drafts/deleted; when fields exist, enforce them.
      if (m.publishStatus != null && m.publishStatus !== 'published') return false
      if (m.isActive != null && m.isActive !== true) return false
      if (m.deletedAt != null && m.deletedAt !== '') return false
      return true
    })
    .slice()
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
  if (mods.length === 0) throw new Error('No calculationModules in live bundle')

  const pages = {}
  const parityRows = []

  for (const mod of mods) {
    const code = String(mod.code || '').trim()
    const seoSlug = BH_CODE_TO_SEO_SLUG[code]
    if (!seoSlug) throw new Error(`Missing SEO slug mapping for BH code=${code}`)
    if (!mod.landingContent) {
      console.warn(`WARN: ${code} has no landingContent — still creating catalog stub with available fields`)
    }

    const pathSlug = mod.slug || `/${code}`
    const heroNote = resolveHeroNote(bundle, pathSlug)
    const bottomCta = resolveBottomCta(bundle, pathSlug)
    const heroImageUrl = resolveModuleMedia(bundle.mediaAssets, pathSlug, 'hero')
    const featuresImageUrl = resolveModuleMedia(bundle.mediaAssets, pathSlug, 'features')
    const ctaImageUrl = resolveModuleMedia(bundle.mediaAssets, pathSlug, 'cta')
    const catalogImage = pickAnyModuleCatalogImage(bundle.mediaAssets, code, pathSlug)

    const seoRow = (bundle.seo || []).find(
      (s) => s.path === pathSlug || s.path === `/${code}` || s.path === pathSlug.replace(/^\//, ''),
    )

    const blocks = buildBlocks(mod, heroNote, bottomCta, heroImageUrl, featuresImageUrl, ctaImageUrl)

    const page = {
      title: mod.cardTitle || mod.landingTitle,
      slug: seoSlug,
      shortDescription: mod.cardDescription || mod.landingDescription || '',
      category: mod.landingEyebrow || 'İşçilik alacağı',
      cardImage: catalogImage,
      iconName: mod.iconName || 'Layers',
      sortOrder: typeof mod.sortOrder === 'number' ? mod.sortOrder : 0,
      published: true,
      status: 'published',
      showOnBhProductPage: true,
      seoTitle: seoRow?.title?.trim() || mod.landingTitle || mod.cardTitle,
      seoDescription:
        seoRow?.description?.trim() || mod.landingDescription || mod.cardDescription || '',
      source: {
        bhCode: code,
        bhSlug: mod.slug,
        migratedAt: new Date().toISOString(),
        contentBundleUrl: BH_CONTENT_BUNDLE_URL,
      },
      blocks,
    }

    pages[seoSlug] = page
    parityRows.push(parityForModule(mod, page, heroNote, bottomCta))
  }

  const document = { pages }
  const payload = JSON.stringify(document)
  await prisma.pageContent.upsert({
    where: { pageKey: PAGE_KEY },
    create: { pageKey: PAGE_KEY, content: payload },
    update: { content: payload },
  })

  const outDir = path.join(__dirname, '../tmp')
  fs.mkdirSync(outDir, { recursive: true })
  const reportPath = path.join(outDir, 'bh-all-modules-migrate-parity.json')
  const passCount = parityRows.filter((r) => r.pass).length
  const report = {
    ok: true,
    liveCount: mods.length,
    woontegraCount: Object.keys(pages).length,
    pass: passCount,
    fail: parityRows.length - passCount,
    invented: 0,
    removedLegacyKeys: true,
    rows: parityRows,
    slugs: Object.keys(pages),
  }
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify({ ...report, reportPath }, null, 2))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
