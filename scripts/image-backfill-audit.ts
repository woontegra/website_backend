/**
 * Public CMS / static görsel backfill.
 * Default: dry-run, write yok.
 * Production apply: --apply --confirm-production-backfill --priority=P0,P1
 * ve IMAGE_BACKFILL_ALLOW_PRODUCTION_WRITE=1
 */
import 'dotenv/config'
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('../scripts/resolve-database-url.cjs').applyToProcessEnv()
import fs from 'fs/promises'
import path from 'path'
import {
  collectPublicImageRefs,
  DEFAULT_API_BASE,
  DEFAULT_SITE_BASE,
  fetchPublicImageBinary,
  readLocalImageBinary,
} from '../src/media/imageBackfill.publicCollect'
import { dedupeImageRefs, resolvePublicFetchUrl } from '../src/media/imageBackfill.collect'
import { createBackfillWriteGuard, parseBackfillCliFlags } from '../src/media/imageBackfill.safety'
import { formatBytes, runImageBackfillAudit } from '../src/media/imageBackfill.runner'
import { replaceCmsImageUrls } from '../src/media/imageBackfill.cms'
import { uploadBackfillVariants, writeStaticVariantFiles } from '../src/media/imageBackfill.storage'
import { replaceFrontendImageRefs } from '../src/media/imageBackfill.frontendRefs'
import { readManifest, writeManifest } from '../src/media/imageBackfill.manifest'
import { rollbackCmsFromManifest } from '../src/media/imageBackfill.rollback'
import type { ImageBackfillApplyPort } from '../src/media/imageBackfill.types'

function argValue(argv: string[], name: string, fallback: string): string {
  const match = argv.find((item) => item.startsWith(`${name}=`))
  return match ? match.slice(name.length + 1) : fallback
}

function createProductionPort(siteBase: string, staticRoot: string, frontendSrc: string): ImageBackfillApplyPort {
  return {
    uploadVariants: uploadBackfillVariants,
    replaceCmsUrls: (oldUrl, newUrl) => replaceCmsImageUrls(oldUrl, newUrl, siteBase),
    writeStaticFiles: (files) => writeStaticVariantFiles(staticRoot, files),
    replaceFrontendRefs: (oldUrl, newUrl) => replaceFrontendImageRefs(frontendSrc, oldUrl, newUrl, siteBase),
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const flags = parseBackfillCliFlags(argv)
  const apiBase = argValue(argv, '--api-base', process.env.IMAGE_BACKFILL_API_BASE || DEFAULT_API_BASE)
  const siteBase = argValue(argv, '--site-base', process.env.IMAGE_BACKFILL_SITE_BASE || DEFAULT_SITE_BASE)
  const staticImagesDir = path.resolve(__dirname, '../../FrontendV4/public/images')
  const frontendSrc = path.resolve(__dirname, '../../FrontendV4/src')
  const manifestDir = path.resolve(process.cwd(), 'tmp')
  await fs.mkdir(manifestDir, { recursive: true })

  if (flags.rollback) {
    if (!flags.manifestPath) throw new Error('--manifest gerekli')
    const manifest = await readManifest(flags.manifestPath)
    const result = await rollbackCmsFromManifest({
      flags,
      manifest,
      port: createProductionPort(siteBase, staticImagesDir, frontendSrc),
    })
    console.log(`rollback restored=${result.restored}`)
    return
  }

  if (argv.includes('--finalize-static-cms')) {
    if (!flags.manifestPath) throw new Error('--manifest gerekli')
    const { assertProductionWriteAllowed } = await import('../src/media/imageBackfill.safety')
    assertProductionWriteAllowed(flags)
    const manifest = await readManifest(flags.manifestPath)
    const port = createProductionPort(siteBase, staticImagesDir, frontendSrc)
    for (const entry of manifest.entries) {
      if (entry.status !== 'static-written' || !entry.newCanonicalUrl || entry.cmsUpdated) continue
      const cms = await port.replaceCmsUrls(entry.oldUrl, entry.newCanonicalUrl)
      entry.cmsUpdated = cms.updated > 0
      entry.cmsLocations = cms.locations
      entry.status = cms.updated > 0 ? 'success' : entry.status
    }
    await writeManifest(flags.manifestPath, manifest)
    console.log(`finalize-static-cms manifest=${flags.manifestPath}`)
    return
  }

  const { refs, coverageNotes } = await collectPublicImageRefs({
    apiBase,
    siteBase,
    staticImagesDir,
  })
  const unique = dedupeImageRefs(refs)
  const runStamp = Date.now()
  const manifestPath = path.join(manifestDir, `image-backfill-manifest-${runStamp}.json`)

  const report = await runImageBackfillAudit({
    refs: unique,
    flags,
    resolveFetchUrl: (url) => resolvePublicFetchUrl(url, siteBase),
    apiBase,
    siteBase,
    coverageNotes,
    io: {
      writers: createBackfillWriteGuard(flags),
      fetchBinary: fetchPublicImageBinary,
      readLocal: readLocalImageBinary,
      applyPort: flags.apply ? createProductionPort(siteBase, staticImagesDir, frontendSrc) : undefined,
      manifestPath: flags.apply ? manifestPath : undefined,
    },
  })

  const outFile = path.join(
    manifestDir,
    flags.apply ? `image-backfill-apply-${runStamp}.json` : `image-backfill-dry-run-${runStamp}.json`,
  )
  await fs.writeFile(outFile, JSON.stringify(report, null, 2), 'utf8')

  const { totals } = report
  console.log(`=== image-backfill ${report.mode} ===`)
  console.log(`runId=${report.runId || 'n/a'}`)
  console.log(`scanned=${totals.scanned} eligible=${totals.eligible} skipped=${totals.skipped}`)
  console.log(`original=${formatBytes(totals.originalRasterBytes)}`)
  console.log(`canonical=${formatBytes(totals.optimizedCanonicalBytes)}`)
  console.log(`reduction=${totals.estimatedCanonicalReductionPct ?? 'n/a'}%`)
  if (report.apply) {
    console.log(
      `apply attempted=${report.apply.attempted} ok=${report.apply.succeeded} fail=${report.apply.failed} blob=${report.apply.blobUploads} r2=${report.apply.r2Uploads} static=${report.apply.staticFiles} cms=${report.apply.cmsUpdates}`,
    )
  }
  console.log(`report=${outFile}`)
  if (report.manifestPath) console.log(`manifest=${report.manifestPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
