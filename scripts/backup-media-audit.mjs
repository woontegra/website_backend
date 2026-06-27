/**
 * DB görsel alanları + URL manifest yedeği.
 * Kullanım: node scripts/backup-media-audit.mjs
 * Ödeme/lisans/download endpointlerine dokunmaz; sadece okur.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const require = createRequire(import.meta.url)

require('dotenv').config({ path: path.join(root, '.env') })
try {
  require(path.join(root, 'scripts/resolve-database-url.cjs')).applyToProcessEnv()
} catch {
  /* */
}

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const IMAGE_FIELD_KEYS = new Set([
  'image',
  'imageUrl',
  'featuredImage',
  'coverImage',
  'coverImageUrl',
  'heroImage',
  'heroImageUrl',
  'logoUrl',
  'logo',
  'darkModeLogo',
  'backgroundImage',
  'ogImage',
  'twitterImage',
  'organizationLogo',
  'url',
])

function classifyUrl(url) {
  const trimmed = (url || '').trim()
  if (!trimmed) return 'empty'
  if (/^https?:\/\//i.test(trimmed)) {
    if (/r2\.cloudflarestorage\.com|pub-.*\.r2\.dev|\.r2\.cloudflarestorage/i.test(trimmed)) return 'r2'
    return 'external'
  }
  if (trimmed.startsWith('/uploads/') || trimmed.startsWith('uploads/')) return 'uploads'
  if (trimmed.startsWith('/images/') || trimmed.startsWith('images/')) return 'public_images'
  return 'other'
}

function walkJson(source, id, value, fieldPath, out) {
  if (Array.isArray(value)) {
    value.forEach((item, i) => walkJson(source, id, item, `${fieldPath}[${i}]`, out))
    return
  }
  if (typeof value !== 'object' || value === null) return
  for (const [key, child] of Object.entries(value)) {
    const nextPath = fieldPath ? `${fieldPath}.${key}` : key
    if (IMAGE_FIELD_KEYS.has(key) && typeof child === 'string' && child.trim()) {
      out.push({
        source,
        id,
        field: nextPath,
        url: child.trim(),
        urlType: classifyUrl(child),
      })
    } else if (key === 'coverMedia' || key === 'heroMedia' || key === 'media') {
      if (child && typeof child === 'object' && typeof child.url === 'string' && child.url.trim()) {
        out.push({
          source,
          id,
          field: `${nextPath}.url`,
          url: child.url.trim(),
          urlType: classifyUrl(child.url),
        })
      }
    } else {
      walkJson(source, id, child, nextPath, out)
    }
  }
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function timestampDir() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}`
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|svg|avif)(\?|$)/i
const SKIP_EXT = /\.(exe|zip|msi|dmg|pkg|deb|rpm|7z|tar|gz)(\?|$)/i

async function downloadImage(url, destDir, manifest) {
  if (SKIP_EXT.test(url)) return
  if (!IMAGE_EXT.test(url) && !url.includes('/uploads/') && !url.includes('r2')) return

  let fetchUrl = url
  if (url.startsWith('/uploads/') || url.startsWith('/images/')) {
    const base =
      process.env.BACKEND_PUBLIC_URL?.trim() ||
      process.env.VITE_BACKEND_PUBLIC_URL?.trim() ||
      'https://websitebackend-production-ab6e.up.railway.app'
    fetchUrl = `${base.replace(/\/+$/, '')}${url.startsWith('/') ? url : `/${url}`}`
  }

  try {
    const res = await fetch(fetchUrl, { method: 'GET', redirect: 'follow' })
    if (!res.ok) {
      manifest.downloadErrors.push({ url, status: res.status })
      return
    }
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/') && !ct.includes('svg')) return
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > 5 * 1024 * 1024) return
    const name = url.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)
    fs.writeFileSync(path.join(destDir, name), buf)
    manifest.downloaded.push(url)
  } catch (e) {
    manifest.downloadErrors.push({ url, error: String(e.message || e) })
  }
}

async function main() {
  const stamp = timestampDir()
  const backupDir = path.resolve(root, '..', 'backups', 'media-audit', stamp)
  const filesDir = path.join(backupDir, 'files')
  fs.mkdirSync(filesDir, { recursive: true })

  const imageFields = {
    exportedAt: new Date().toISOString(),
    posts: [],
    products: [],
    pageContents: [],
    brands: [],
    mediaAssets: [],
    catalogMedia: [],
    siteSettings: [],
    uploadsRecords: [],
    r2Records: [],
  }

  const manifestEntries = []
  const seenUrls = new Set()

  function addManifest(entry) {
    manifestEntries.push(entry)
    if (entry.url && !seenUrls.has(entry.url)) {
      seenUrls.add(entry.url)
    }
  }

  const posts = await prisma.post.findMany({
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      featuredImage: true,
    },
  })
  for (const row of posts) {
    imageFields.posts.push(row)
    if (row.featuredImage?.trim()) {
      const url = row.featuredImage.trim()
      const type = classifyUrl(url)
      addManifest({
        page: `/blog/${row.slug}`,
        component: 'BlogCard/BlogDetail',
        field: 'featuredImage',
        url,
        urlType: type,
        empty: false,
        published: row.status === 'published',
      })
      if (type === 'uploads') imageFields.uploadsRecords.push({ source: 'post', id: row.slug, url })
      if (type === 'r2') imageFields.r2Records.push({ source: 'post', id: row.slug, url })
    }
  }

  const products = await prisma.product.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      isActive: true,
      coverImage: true,
      coverImageMediaId: true,
      coverImageMedia: { select: { id: true, url: true, fileType: true } },
    },
  })
  for (const row of products) {
    imageFields.products.push(row)
    const mediaUrl = row.coverImageMedia?.url?.trim() || ''
    const directUrl = row.coverImage?.trim() || ''
    const url = mediaUrl || directUrl
    if (url) {
      const type = classifyUrl(url)
      addManifest({
        page: `/yazilimlar/${row.slug}`,
        component: 'ProductCard/ProductDetail',
        field: mediaUrl ? 'coverImageMedia.url' : 'coverImage',
        url,
        urlType: type,
        empty: false,
        active: row.isActive,
      })
      if (type === 'uploads') imageFields.uploadsRecords.push({ source: 'product', id: row.slug, url })
      if (type === 'r2') imageFields.r2Records.push({ source: 'product', id: row.slug, url })
    }
  }

  const pageContents = await prisma.pageContent.findMany()
  for (const row of pageContents) {
    imageFields.pageContents.push({ pageKey: row.pageKey, contentLength: row.content?.length ?? 0 })
    try {
      const json = JSON.parse(row.content)
      const found = []
      walkJson('pageContent', row.pageKey, json, 'content', found)
      for (const f of found) {
        addManifest({
          page: row.pageKey,
          component: 'PageContent',
          field: f.field,
          url: f.url,
          urlType: f.urlType,
          empty: false,
        })
        if (f.urlType === 'uploads') imageFields.uploadsRecords.push({ source: 'pageContent', id: row.pageKey, url: f.url })
        if (f.urlType === 'r2') imageFields.r2Records.push({ source: 'pageContent', id: row.pageKey, url: f.url })
      }
    } catch {
      /* parse error */
    }
  }

  const brands = await prisma.brand.findMany({ select: { id: true, name: true, image: true } })
  for (const row of brands) {
    imageFields.brands.push(row)
    if (row.image?.trim()) {
      addManifest({
        page: '/',
        component: 'HomeBrands',
        field: 'image',
        url: row.image.trim(),
        urlType: classifyUrl(row.image),
        empty: false,
      })
    }
  }

  const mediaAssets = await prisma.mediaAsset.findMany({
    select: { id: true, filename: true, url: true, mimeType: true },
  })
  imageFields.mediaAssets = mediaAssets
  for (const row of mediaAssets) {
    if (row.url?.trim()) {
      addManifest({
        page: 'media-library',
        component: 'MediaAsset',
        field: 'url',
        url: row.url.trim(),
        urlType: classifyUrl(row.url),
        empty: false,
      })
    }
  }

  const catalogMedia = await prisma.catalogMedia.findMany({
    where: { fileType: { not: 'DOWNLOAD' } },
    select: { id: true, url: true, fileType: true, originalName: true },
  })
  imageFields.catalogMedia = catalogMedia

  const settings = await prisma.siteSetting.findMany()
  for (const row of settings) {
    if (!IMAGE_FIELD_KEYS.has(row.key) && !row.key.toLowerCase().includes('image')) continue
    if (!row.value?.trim()) continue
    imageFields.siteSettings.push({ key: row.key, value: row.value })
    addManifest({
      page: 'site-settings',
      component: 'SiteSetting',
      field: row.key,
      url: row.value.trim(),
      urlType: classifyUrl(row.value),
      empty: false,
    })
  }

  const manifest = {
    exportedAt: new Date().toISOString(),
    totalUrls: manifestEntries.length,
    uniqueUrls: seenUrls.size,
    byType: {},
    entries: manifestEntries,
    downloadErrors: [],
    downloaded: [],
  }
  for (const e of manifestEntries) {
    manifest.byType[e.urlType] = (manifest.byType[e.urlType] || 0) + 1
  }

  fs.writeFileSync(path.join(backupDir, 'current-image-fields.json'), JSON.stringify(imageFields, null, 2))
  fs.writeFileSync(path.join(backupDir, 'media-url-manifest.json'), JSON.stringify(manifest, null, 2))

  console.log(`Backup dir: ${backupDir}`)
  console.log(`Posts: ${imageFields.posts.length}, Products: ${imageFields.products.length}`)
  console.log(`Manifest entries: ${manifestEntries.length}, unique URLs: ${seenUrls.size}`)
  console.log(`Uploads records: ${imageFields.uploadsRecords.length}, R2 records: ${imageFields.r2Records.length}`)

  let dlCount = 0
  for (const url of seenUrls) {
    if (dlCount >= 50) break
    await downloadImage(url, filesDir, manifest)
    if (manifest.downloaded.includes(url)) dlCount++
  }
  fs.writeFileSync(path.join(backupDir, 'media-url-manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`Downloaded ${manifest.downloaded.length} image files to files/`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
