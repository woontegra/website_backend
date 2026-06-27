/**
 * Public sitede kullanılan görsel URL'lerini API'den çeker ve HTTP durumunu raporlar.
 * Kullanım: node scripts/check-public-images.mjs [--api-base URL]
 * Ödeme/lisans/download endpointlerine dokunmaz.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const API_BASE =
  process.argv.find((a) => a.startsWith('--api-base='))?.split('=')[1]?.replace(/\/+$/, '') ||
  process.env.SITEMAP_API_BASE?.trim()?.replace(/\/+$/, '') ||
  process.env.VITE_BACKEND_PUBLIC_URL?.trim()?.replace(/\/+$/, '') ||
  'https://websitebackend-production-ab6e.up.railway.app'

const SITE_BASE =
  process.argv.find((a) => a.startsWith('--site-base='))?.split('=')[1]?.replace(/\/+$/, '') ||
  process.env.SITEMAP_SITE_URL?.trim()?.replace(/\/+$/, '') ||
  'https://woontegra.com'

const IMAGE_KEYS = new Set([
  'image',
  'imageUrl',
  'featuredImage',
  'coverImage',
  'heroImage',
  'logo',
  'logoUrl',
])

function classifyUrl(url) {
  const t = (url || '').trim()
  if (!t) return 'empty'
  if (/^https?:\/\//i.test(t)) {
    if (/r2\.dev|r2\.cloudflarestorage/i.test(t)) return 'r2'
    return 'external'
  }
  if (t.startsWith('/uploads/') || t.startsWith('uploads/')) return 'uploads'
  if (t.startsWith('/images/') || t.startsWith('images/')) return 'public_images'
  if (t.startsWith('/brands/')) return 'legacy_brands'
  return 'other'
}

function resolveFetchUrl(raw) {
  const t = raw.trim()
  if (/^https?:\/\//i.test(t)) return t
  const rel = t.startsWith('/') ? t : `/${t}`
  if (rel.startsWith('/uploads/') || rel.startsWith('/images/') || rel.startsWith('/brands/')) {
    return `${SITE_BASE}${rel}`
  }
  return `${API_BASE}${rel}`
}

async function checkUrl(raw) {
  const urlType = classifyUrl(raw)
  if (urlType === 'empty') return { status: 'MISSING_IMAGE', http: null, urlType, fetchUrl: null }

  const fetchUrl = resolveFetchUrl(raw)
  try {
    let res = await fetch(fetchUrl, { method: 'HEAD', redirect: 'follow' })
    if (res.status === 405 || res.status === 404 || res.status === 308) {
      res = await fetch(fetchUrl, { method: 'GET', redirect: 'follow', headers: { Range: 'bytes=0-0' } })
    }
    const http = res.status
    if (http >= 200 && http < 300) {
      if (urlType === 'uploads') return { status: 'LEGACY_UPLOAD', http, urlType, fetchUrl }
      if (urlType === 'r2') return { status: 'R2_OK', http, urlType, fetchUrl }
      return { status: 'OK', http, urlType, fetchUrl }
    }
    return { status: 'BROKEN_IMAGE', http, urlType, fetchUrl }
  } catch (e) {
    return { status: 'BROKEN_IMAGE', http: null, urlType, fetchUrl, error: String(e.message || e) }
  }
}

function walkImages(source, id, value, fieldPath, out) {
  if (Array.isArray(value)) {
    value.forEach((item, i) => walkImages(source, id, item, `${fieldPath}[${i}]`, out))
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    const next = fieldPath ? `${fieldPath}.${key}` : key
    if (IMAGE_KEYS.has(key) && typeof child === 'string' && child.trim()) {
      out.push({ source, id, field: next, url: child.trim() })
    } else if ((key === 'coverMedia' || key === 'heroMedia' || key === 'media') && child && typeof child === 'object') {
      const u = child.url
      if (typeof u === 'string' && u.trim()) out.push({ source, id, field: `${next}.url`, url: u.trim() })
    } else {
      walkImages(source, id, child, next, out)
    }
  }
}

async function fetchJson(urlPath) {
  const res = await fetch(`${API_BASE}${urlPath}`)
  if (!res.ok) throw new Error(`${urlPath} → HTTP ${res.status}`)
  return res.json()
}

async function collectFromApi() {
  const items = []

  const blog = await fetchJson('/api/blog/posts')
  const posts = blog?.data ?? blog ?? []
  if (Array.isArray(posts)) {
    for (const p of posts) {
      if (p.featuredImage?.trim()) {
        items.push({ page: `/blog/${p.slug}`, component: 'BlogCard', field: 'featuredImage', url: p.featuredImage.trim() })
      } else if (p.status === 'published') {
        items.push({ page: `/blog/${p.slug}`, component: 'BlogCard', field: 'featuredImage', url: '', note: 'published without image' })
      }
    }
  }

  const products = await fetchJson('/api/products')
  const list = products?.data ?? products ?? []
  if (Array.isArray(list)) {
    for (const p of list) {
      const url = p.coverImage?.trim() || p.coverMedia?.url?.trim() || ''
      items.push({
        page: `/yazilimlar/${p.slug}`,
        component: 'ProductCard',
        field: p.coverMedia?.url ? 'coverMedia.url' : 'coverImage',
        url,
      })
    }
  }

  const pageKeys = ['home', 'contact', 'about', 'servicesPage', 'solutionsPage', 'servicePages']
  for (const key of pageKeys) {
    try {
      const res = await fetchJson(`/api/page-content/${key}`)
      const data = res?.data
      if (!data) continue
      const found = []
      walkImages('pageContent', key, data, 'content', found)
      for (const f of found) {
        items.push({ page: key, component: 'PageContent', field: f.field, url: f.url })
      }
    } catch {
      /* optional page */
    }
  }

  return items
}

async function main() {
  console.log(`API: ${API_BASE}`)
  console.log(`Site (uploads/images): ${SITE_BASE}\n`)

  const items = await collectFromApi()
  const results = []

  for (const item of items) {
    const check = await checkUrl(item.url || '')
    results.push({ ...item, ...check })
  }

  const summary = {}
  for (const r of results) {
    summary[r.status] = (summary[r.status] || 0) + 1
  }

  const report = {
    checkedAt: new Date().toISOString(),
    apiBase: API_BASE,
    siteBase: SITE_BASE,
    total: results.length,
    summary,
    results,
  }

  const outDir = path.resolve(__dirname, '..', '..', 'backups', 'media-audit')
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, `check-public-images-${Date.now()}.json`)
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2))

  console.log('=== check-public-images ===')
  console.log(`Toplam: ${results.length}`)
  for (const [k, v] of Object.entries(summary)) console.log(`  ${k}: ${v}`)

  const broken = results.filter((r) => r.status === 'BROKEN_IMAGE' || r.status === 'MISSING_IMAGE')
  if (broken.length) {
    console.log('\n--- Sorunlu ---')
    for (const r of broken) {
      console.log(`  [${r.status}] ${r.page} ${r.field} → ${r.url || '(boş)'} HTTP=${r.http ?? 'n/a'}`)
    }
  }

  console.log(`\nRapor: ${outFile}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
