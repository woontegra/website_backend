import fs from 'fs/promises'
import path from 'path'
import { walkImageRefs } from './imageBackfill.collect'
import type { ImageBackfillRef } from './imageBackfill.types'

export const DEFAULT_API_BASE = 'https://websitebackend-production-ab6e.up.railway.app'
export const DEFAULT_SITE_BASE = 'https://www.woontegra.com'

export const PUBLIC_PAGE_CONTENT_KEYS = [
  'home',
  'about',
  'contact',
  'servicesPage',
  'solutionsPage',
  'softwarePage',
  'blogPage',
  'blogPages',
  'productPages',
  'servicePages',
  'solutionPages',
  'serviceCards',
  'solutionCards',
  'solutionBenefitCards',
  'bhModulePages',
  'legalCookiePage',
  'legalKvkkPage',
  'legalPrivacyPage',
  'legalConsentPage',
  'legalTermsPage',
  'legalCompanyInfo',
]

export const KNOWN_STATIC_CANDIDATES = [
  '/images/web-tasarim-hero.png',
  '/images/about-hero.png',
  '/images/ana-sayfa-hero.jpg',
]

function unwrapData(payload: unknown): unknown {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: unknown }).data
  }
  return payload
}

async function fetchJson(apiBase: string, urlPath: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${apiBase.replace(/\/+$/, '')}${urlPath}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function collectLocalStaticImages(imagesDir: string, siteBase: string): Promise<ImageBackfillRef[]> {
  const refs: ImageBackfillRef[] = []
  async function walk(dir: string) {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, String(entry.name))
      if (entry.isDirectory()) {
        await walk(full)
        continue
      }
      if (!/\.(jpe?g|png|webp|avif|gif|svg)$/i.test(String(entry.name))) continue
      const rel = path.relative(imagesDir, full).replace(/\\/g, '/')
      refs.push({
        url: `/images/${rel}`,
        localPath: full,
        usages: [{ page: 'frontend-static', field: `/images/${rel}`, component: 'public/images' }],
      })
    }
  }
  await walk(imagesDir)
  for (const candidate of KNOWN_STATIC_CANDIDATES) {
    if (!refs.some((ref) => ref.url === candidate)) {
      refs.push({
        url: `${siteBase.replace(/\/+$/, '')}${candidate}`,
        usages: [{ page: 'known-candidate', field: candidate, component: 'static-probe' }],
      })
    }
  }
  return refs
}

export async function collectPublicImageRefs(input: {
  apiBase: string
  siteBase: string
  staticImagesDir?: string
}): Promise<{ refs: ImageBackfillRef[]; coverageNotes: string[] }> {
  const refs: ImageBackfillRef[] = []
  const coverageNotes = [
    'Envanter public API + frontend static + bilinen /images adaylarından toplandı.',
    'Production DB read-only credential kullanılmadı.',
    'Vercel Blob / R2 object listing yapılmadı; yalnız referans verilen public URL’ler alındı.',
    'Installer / private download storage taranmadı.',
  ]

  const blog = unwrapData(await fetchJson(input.apiBase, '/api/blog/posts'))
  if (Array.isArray(blog)) {
    for (const post of blog) {
      const row = post as { slug?: string; featuredImage?: string }
      walkImageRefs(row, { page: `/blog/${row.slug || ''}`, component: 'BlogCard' }, refs)
    }
  } else {
    coverageNotes.push('Blog listesi public API’den alınamadı.')
  }

  const products = unwrapData(await fetchJson(input.apiBase, '/api/products'))
  if (Array.isArray(products)) {
    for (const product of products) {
      const row = product as { slug?: string }
      walkImageRefs(row, { page: `/yazilimlar/${row.slug || ''}`, component: 'ProductCard' }, refs)
      if (row.slug) {
        const detail = unwrapData(await fetchJson(input.apiBase, `/api/products/${encodeURIComponent(row.slug)}`))
        walkImageRefs(detail, { page: `/yazilimlar/${row.slug}`, component: 'ProductDetail' }, refs)
      }
    }
  } else {
    coverageNotes.push('Ürün listesi public API’den alınamadı.')
  }

  const services = unwrapData(await fetchJson(input.apiBase, '/api/services'))
  walkImageRefs(services, { page: '/hizmetler', component: 'Services' }, refs)

  const brands = unwrapData(await fetchJson(input.apiBase, '/api/brands'))
  walkImageRefs(brands, { page: 'brands', component: 'Brands' }, refs)

  const settings = unwrapData(await fetchJson(input.apiBase, '/api/settings'))
  walkImageRefs(settings, { page: 'settings', component: 'SiteSettings' }, refs)

  for (const key of PUBLIC_PAGE_CONTENT_KEYS) {
    const data = unwrapData(await fetchJson(input.apiBase, `/api/page-content/${key}`))
    if (data == null) continue
    const page = key === 'home' ? '/' : key
    walkImageRefs(data, { page, component: 'PageContent' }, refs)
  }

  if (input.staticImagesDir) {
    refs.push(...(await collectLocalStaticImages(input.staticImagesDir, input.siteBase)))
  }

  return { refs, coverageNotes }
}

export async function fetchPublicImageBinary(url: string): Promise<{ buffer: Buffer; mime: string; bytes: number } | null> {
  try {
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) return null
    const mime = (res.headers.get('content-type') || '').split(';')[0]?.trim() || ''
    if (/^text\/|^application\/json/i.test(mime)) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length < 24) return null
    return { buffer, mime: mime || 'application/octet-stream', bytes: buffer.length }
  } catch {
    return null
  }
}

export async function readLocalImageBinary(localPath: string): Promise<{ buffer: Buffer; mime: string; bytes: number } | null> {
  try {
    const buffer = await fs.readFile(localPath)
    const ext = path.extname(localPath).toLowerCase()
    const mime =
      ext === '.png'
        ? 'image/png'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.avif'
            ? 'image/avif'
            : ext === '.gif'
              ? 'image/gif'
              : ext === '.svg'
                ? 'image/svg+xml'
                : 'image/jpeg'
    return { buffer, mime, bytes: buffer.length }
  } catch {
    return null
  }
}
