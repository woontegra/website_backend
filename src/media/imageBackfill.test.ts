import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { classifySkipReason, classifyStorageSource, isInstallerUrl } from './imageBackfill.classify'
import { dedupeImageRefs } from './imageBackfill.collect'
import { applyOptimizedAsset } from './imageBackfill.apply'
import { createManifest, upsertManifestEntry } from './imageBackfill.manifest'
import {
  assertApplyAllowed,
  assertPriorityFilter,
  createBackfillWriteGuard,
  IMAGE_BACKFILL_APPLY_BLOCKED,
  IMAGE_BACKFILL_DELETE_DISABLED,
  IMAGE_BACKFILL_PRIORITY_REQUIRED,
  parseBackfillCliFlags,
} from './imageBackfill.safety'
import { buildRollbackMappings } from './imageBackfill.strategy'
import { runImageBackfillAudit } from './imageBackfill.runner'
import { parseOptimizedFileName } from './imageVariantNames'
import type { BackfillWriteGuard, ImageBackfillApplyPort, ImageBackfillItem, ImageBackfillRef } from './imageBackfill.types'

async function jpegFixture(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 80, b: 160 } },
  })
    .jpeg({ quality: 92 })
    .toBuffer()
}

async function pngFixture(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 12, g: 180, b: 90 } },
  })
    .png()
    .toBuffer()
}

function spyWriters() {
  const calls = { upload: 0, db: 0, del: 0 }
  const writers: BackfillWriteGuard = {
    mode: 'dry-run',
    uploadAsset() {
      calls.upload += 1
    },
    updateCmsUrl() {
      calls.db += 1
    },
    deleteAsset() {
      calls.del += 1
    },
  }
  return { calls, writers }
}

function applyFlags(overrides: Partial<ReturnType<typeof parseBackfillCliFlags>> = {}) {
  return {
    apply: false,
    confirmProductionBackfill: false,
    allowProductionWrite: false,
    priorities: [] as Array<'P0' | 'P1' | 'P2' | 'P3'>,
    rollback: false,
    confirmProductionRollback: false,
    ...overrides,
  }
}

test('CLI default dry-run; üçlü opt-in ve priority olmadan yazılmaz', () => {
  assert.deepEqual(parseBackfillCliFlags([]), {
    apply: false,
    confirmProductionBackfill: false,
    allowProductionWrite: false,
    priorities: [],
    rollback: false,
    confirmProductionRollback: false,
    manifestPath: undefined,
  })
  assert.throws(
    () => assertApplyAllowed(applyFlags({ apply: true, confirmProductionBackfill: true })),
    (error: unknown) => error instanceof Error && error.name === IMAGE_BACKFILL_APPLY_BLOCKED,
  )
  assert.throws(
    () =>
      assertPriorityFilter(
        applyFlags({ apply: true, confirmProductionBackfill: true, allowProductionWrite: true }),
      ),
    (error: unknown) => error instanceof Error && error.name === IMAGE_BACKFILL_PRIORITY_REQUIRED,
  )
  assert.doesNotThrow(() =>
    assertApplyAllowed(
      applyFlags({ apply: true, confirmProductionBackfill: true, allowProductionWrite: true }),
    ),
  )
})

test('write guard dry-run ve delete her zaman kapalı', () => {
  const dry = createBackfillWriteGuard(applyFlags())
  assert.equal(dry.mode, 'dry-run')
  assert.throws(() => dry.uploadAsset('x', 1), /dry-run storage write/)
  assert.throws(() => dry.updateCmsUrl('a', 'b'), /dry-run DB write/)
  assert.throws(
    () => dry.deleteAsset('x'),
    (error: unknown) => error instanceof Error && error.name === IMAGE_BACKFILL_DELETE_DISABLED,
  )

  const blocked = createBackfillWriteGuard(applyFlags({ apply: true, confirmProductionBackfill: true }))
  assert.throws(
    () => blocked.uploadAsset('x', 1),
    (error: unknown) =>
      error instanceof Error &&
      (error.name === IMAGE_BACKFILL_APPLY_BLOCKED || error.name === IMAGE_BACKFILL_PRIORITY_REQUIRED),
  )
})

test('duplicate URL bir kere işlenir', () => {
  const refs = dedupeImageRefs([
    { url: 'https://cdn.example/a.jpg', usages: [{ page: 'home', field: 'hero' }] },
    { url: 'https://cdn.example/a.jpg#x', usages: [{ page: 'about', field: 'image' }] },
  ])
  assert.equal(refs.length, 1)
  assert.equal(refs[0].usages.length, 2)
})

test('SVG / GIF / installer skip', () => {
  assert.equal(classifySkipReason({ url: '/images/logo.svg' }), 'svg')
  assert.equal(classifySkipReason({ url: 'https://cdn.example/anim.gif' }), 'gif-animated')
  assert.equal(classifySkipReason({ url: 'https://cdn.example/Setup.exe' }), 'installer')
  assert.equal(isInstallerUrl('https://cdn.example/app.msi'), true)
  assert.equal(classifySkipReason({ url: 'https://cdn.example/hero.opt-w1920.jpg' }), 'already-optimized')
  assert.equal(classifySkipReason({ url: 'https://cdn.example/hero.optavif-w1440.webp' }), 'already-optimized')
  assert.equal(classifyStorageSource('https://fm.public.blob.vercel-storage.com/website-media/a.jpg'), 'vercel-blob')
  assert.equal(classifyStorageSource('https://pub.r2.dev/catalog/general/a.jpg'), 'r2')
  assert.equal(classifyStorageSource('/images/about-hero.png'), 'frontend-static')
})

test('dry-run storage/DB write yapmaz; büyük PNG tahmini ve rollback mapping üretir', async () => {
  const png = await pngFixture(1600, 1200)
  const jpeg = await jpegFixture(800, 600)
  const { calls, writers } = spyWriters()
  const refs: ImageBackfillRef[] = [
    {
      url: 'https://fm.public.blob.vercel-storage.com/website-media/hero/big.png',
      usages: [{ page: '/', field: 'blocks[0].slides[0].desktopSrc', component: 'Hero' }],
    },
    {
      url: '/images/small.jpg',
      usages: [{ page: '/hizmetler', field: 'heroImage', component: 'Services' }],
    },
  ]

  const report = await runImageBackfillAudit({
    refs,
    flags: applyFlags(),
    resolveFetchUrl: (url) => url,
    io: {
      writers,
      fetchBinary: async (url) => {
        if (url.endsWith('.png')) return { buffer: png, mime: 'image/png', bytes: png.length }
        return { buffer: jpeg, mime: 'image/jpeg', bytes: jpeg.length }
      },
    },
  })

  assert.equal(calls.upload, 0)
  assert.equal(calls.db, 0)
  assert.equal(calls.del, 0)
  assert.equal(report.mode, 'dry-run')
  assert.equal(report.totals.eligible, 2)
  const big = report.items.find((item) => item.url.endsWith('big.png'))
  assert.ok(big?.estimate)
  assert.ok((big.estimate?.canonicalBytes || 0) < png.length)
  assert.ok(big.estimate?.variants.some((item) => item.format === 'webp'))
  assert.equal(big?.isHeroLcp, true)
  assert.equal(big?.priority, 'P0')
  const small = report.items.find((item) => item.url.endsWith('small.jpg'))
  assert.equal(small?.estimate?.canonicalWidth, 800)
  assert.ok(!small?.estimate?.variants.some((item) => item.width === 960 || item.width === 1440 || item.width === 1920))
  const mappings = buildRollbackMappings(report.items)
  assert.equal(mappings.length, 2)
  assert.match(mappings[0].newUrl, /\.(optavif|opt)-w\d+\.(jpg|webp)$/)
})

test('mevcut .opt-w asset tekrar backfill edilmez', async () => {
  const { calls, writers } = spyWriters()
  const report = await runImageBackfillAudit({
    refs: [
      {
        url: 'https://cdn.example/pic.opt-w1920.jpg',
        usages: [{ page: 'home', field: 'hero' }],
      },
    ],
    flags: applyFlags(),
    resolveFetchUrl: (url) => url,
    io: {
      writers,
      fetchBinary: async () => {
        throw new Error('optimized asset should not be fetched')
      },
    },
  })
  assert.equal(report.items[0].skipReason, 'already-optimized')
  assert.equal(calls.upload, 0)
})

test('LFS stub / tiny raster skip', async () => {
  const report = await runImageBackfillAudit({
    refs: [{ url: '/images/ana-sayfa-hero.jpg', usages: [{ page: '/', field: 'hero' }] }],
    flags: applyFlags(),
    resolveFetchUrl: (url) => url,
    io: {
      fetchBinary: async () => ({ buffer: Buffer.alloc(532, 1), mime: 'image/jpeg', bytes: 532 }),
    },
  })
  assert.equal(report.items[0].skipReason, 'too-small')
})

test('apply flagsiz / priority yoksa runner yazma yapmadan durur', async () => {
  const jpeg = await jpegFixture(640, 480)
  const { calls, writers } = spyWriters()
  await assert.rejects(
    () =>
      runImageBackfillAudit({
        refs: [{ url: 'https://cdn.example/a.jpg', usages: [{ page: 'x', field: 'y' }] }],
        flags: applyFlags({ apply: true, confirmProductionBackfill: true }),
        resolveFetchUrl: (url) => url,
        io: {
          writers,
          fetchBinary: async () => ({ buffer: jpeg, mime: 'image/jpeg', bytes: jpeg.length }),
        },
      }),
    (error: unknown) => error instanceof Error && error.name === IMAGE_BACKFILL_APPLY_BLOCKED,
  )
  assert.equal(calls.upload, 0)
  assert.equal(calls.db, 0)
})

test('P0,P1 filtresi P2/P3 fetch/apply etmez', async () => {
  const jpeg = await jpegFixture(800, 600)
  const report = await runImageBackfillAudit({
    refs: [
      {
        url: 'https://fm.public.blob.vercel-storage.com/website-media/hero/p0.jpg',
        usages: [{ page: '/', field: 'hero.image' }],
      },
      {
        url: 'https://cdn.example/blog/cover.png',
        usages: [{ page: '/blog/x', field: 'featuredImage', component: 'BlogCard' }],
      },
    ],
    flags: applyFlags({
      apply: true,
      confirmProductionBackfill: true,
      allowProductionWrite: true,
      priorities: ['P0', 'P1'],
    }),
    resolveFetchUrl: (url) => url,
    io: {
      fetchBinary: async (url) => {
        if (url.includes('cover.png')) throw new Error('P2 should not be fetched')
        return { buffer: jpeg, mime: 'image/jpeg', bytes: jpeg.length }
      },
      applyPort: {
        async uploadVariants({ files, canonicalFileName }) {
          return {
            uploaded: files.map((file) => ({
              fileName: file.fileName,
              url: `https://cdn.example/${file.fileName}`,
            })),
            canonicalUrl: `https://cdn.example/${canonicalFileName}`,
          }
        },
        async replaceCmsUrls() {
          return { updated: 1, locations: ['pageContent:home'] }
        },
        async writeStaticFiles() {
          return []
        },
      },
    },
  })
  assert.equal(report.items.find((item) => item.url.includes('cover.png'))?.skipReason, 'priority-filtered')
  assert.ok(report.items.find((item) => item.url.includes('p0.jpg'))?.eligible)
})

test('upload başarısızsa CMS URL değişmez; başarıda değişir', async () => {
  const jpeg = await jpegFixture(800, 600)
  const item: ImageBackfillItem = {
    url: 'https://fm.public.blob.vercel-storage.com/website-media/hero/a.jpg',
    source: 'vercel-blob',
    usages: [{ page: '/', field: 'hero' }],
    mime: 'image/jpeg',
    originalBytes: jpeg.length,
    width: 800,
    height: 600,
    priority: 'P0',
    isHeroLcp: true,
    eligible: true,
    skipReason: null,
    estimate: null,
  }

  const failPort: ImageBackfillApplyPort = {
    async uploadVariants() {
      throw new Error('upload down')
    },
    async replaceCmsUrls() {
      throw new Error('cms should not run')
    },
    async writeStaticFiles() {
      return []
    },
  }
  const failed = await applyOptimizedAsset({
    item,
    buffer: jpeg,
    mime: 'image/jpeg',
    port: failPort,
    updateCms: true,
  })
  assert.equal(failed.status, 'failed-upload')
  assert.equal(failed.cmsUpdated, false)

  const cms: string[] = []
  const okPort: ImageBackfillApplyPort = {
    async uploadVariants({ files, canonicalFileName }) {
      return {
        uploaded: files.map((file) => ({
          fileName: file.fileName,
          url: `https://cdn.example/${file.fileName}`,
        })),
        canonicalUrl: `https://cdn.example/${canonicalFileName}`,
      }
    },
    async replaceCmsUrls(oldUrl, newUrl) {
      cms.push(`${oldUrl}=>${newUrl}`)
      return { updated: 2, locations: ['pageContent:home', 'product:x'] }
    },
    async writeStaticFiles() {
      return []
    },
  }
  const ok = await applyOptimizedAsset({
    item,
    buffer: jpeg,
    mime: 'image/jpeg',
    port: okPort,
    updateCms: true,
  })
  assert.equal(ok.status, 'success')
  assert.equal(ok.cmsUpdated, true)
  assert.equal(cms.length, 1)
  assert.match(ok.newCanonicalUrl || '', /\.(optavif|opt)-w\d+\.(jpg|webp)$/)
  assert.ok(parseOptimizedFileName(ok.newCanonicalUrl!.split('/').pop() || ''))
})

test('rollback manifest üretilebiliyor', () => {
  const manifest = createManifest('run-1', 'apply', ['P0', 'P1'], [])
  upsertManifestEntry(manifest, {
    sourceType: 'vercel-blob',
    priority: 'P0',
    oldUrl: 'https://cdn.example/old.jpg',
    newCanonicalUrl: 'https://cdn.example/old.opt-w800.jpg',
    usages: [{ page: '/', field: 'hero' }],
    variantUrls: ['https://cdn.example/old.opt-w800.jpg'],
    orphanVariantUrls: [],
    cmsUpdated: true,
    cmsLocations: ['pageContent:home'],
    status: 'success',
    timestamp: new Date().toISOString(),
  })
  assert.equal(manifest.entries[0].oldUrl, 'https://cdn.example/old.jpg')
  assert.equal(manifest.entries[0].cmsUpdated, true)
})

test('static output .opt-w path yazar ve CMS apply etmez', async () => {
  const jpeg = await jpegFixture(800, 600)
  const written: string[] = []
  const item: ImageBackfillItem = {
    url: '/images/web-tasarim-hero.png',
    source: 'frontend-static',
    usages: [{ page: 'servicePages', field: 'hero' }],
    mime: 'image/jpeg',
    originalBytes: jpeg.length,
    width: 800,
    height: 600,
    priority: 'P0',
    isHeroLcp: true,
    eligible: true,
    skipReason: null,
    estimate: null,
  }
  const result = await applyOptimizedAsset({
    item,
    buffer: jpeg,
    mime: 'image/jpeg',
    updateCms: false,
    port: {
      async uploadVariants() {
        throw new Error('static should not upload')
      },
      async replaceCmsUrls() {
        throw new Error('static cms deferred')
      },
      async writeStaticFiles(files) {
        written.push(...files.map((file) => file.relativePath))
        return files.map((file) => `/${file.relativePath}`)
      },
    },
  })
  assert.equal(result.status, 'static-written')
  assert.equal(result.cmsUpdated, false)
  assert.ok(written.some((path) => /\.(optavif|opt)-w\d+\.(jpg|webp|avif)$/.test(path)))
})
