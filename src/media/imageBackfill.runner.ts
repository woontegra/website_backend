import {
  classifyPriority,
  classifySkipReason,
  classifyStorageSource,
  isHeroLcpUsage,
  stemFromUrl,
} from './imageBackfill.classify'
import { estimateOptimizedImage } from './imageBackfill.estimate'
import { applyOptimizedAsset } from './imageBackfill.apply'
import { createManifest, createRunId, upsertManifestEntry, writeManifest } from './imageBackfill.manifest'
import { assertProductionWriteAllowed, createBackfillWriteGuard } from './imageBackfill.safety'
import { buildRollbackMappings } from './imageBackfill.strategy'
import type {
  BackfillWriteGuard,
  ImageBackfillApplyPort,
  ImageBackfillCliFlags,
  ImageBackfillItem,
  ImageBackfillManifestEntry,
  ImageBackfillRef,
  ImageBackfillReport,
  ImageBackfillSkipReason,
  ImageBackfillTotals,
} from './imageBackfill.types'

export const MIN_APPLY_BYTES = 2048

export type ImageBinary = {
  buffer: Buffer
  mime: string
  bytes: number
}

export type ImageBackfillIo = {
  fetchBinary?: (url: string) => Promise<ImageBinary | null>
  readLocal?: (localPath: string) => Promise<ImageBinary | null>
  writers?: BackfillWriteGuard
  applyPort?: ImageBackfillApplyPort
  manifestPath?: string
}

function emptyTotals(): ImageBackfillTotals {
  return {
    scanned: 0,
    eligible: 0,
    skipped: 0,
    skipReasons: {},
    originalRasterBytes: 0,
    optimizedCanonicalBytes: 0,
    variantStorageBytes: 0,
    typicalMobileBytes: 0,
    typicalDesktopBytes: 0,
    estimatedCanonicalReductionPct: null,
  }
}

function addSkip(totals: ImageBackfillTotals, reason: ImageBackfillSkipReason) {
  totals.skipped += 1
  totals.skipReasons[reason] = (totals.skipReasons[reason] || 0) + 1
}

async function loadBinary(ref: ImageBackfillRef, fetchUrl: string, io: ImageBackfillIo): Promise<ImageBinary | null> {
  if (ref.localPath && io.readLocal) {
    const local = await io.readLocal(ref.localPath)
    if (local) return local
  }
  if (!io.fetchBinary) return null
  return io.fetchBinary(fetchUrl)
}

export async function runImageBackfillAudit(input: {
  refs: ImageBackfillRef[]
  flags: ImageBackfillCliFlags
  resolveFetchUrl: (url: string) => string
  io?: ImageBackfillIo
  apiBase?: string | null
  siteBase?: string | null
  coverageNotes?: string[]
}): Promise<ImageBackfillReport> {
  if (input.flags.apply) {
    assertProductionWriteAllowed(input.flags)
  }

  const writers = input.io?.writers ?? createBackfillWriteGuard(input.flags)
  const items: ImageBackfillItem[] = []
  const totals = emptyTotals()
  totals.scanned = input.refs.length
  const runId = input.flags.apply ? createRunId() : null
  const applyStats = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    blobUploads: 0,
    r2Uploads: 0,
    staticFiles: 0,
    cmsUpdates: 0,
  }
  const manifest = runId
    ? createManifest(runId, 'apply', input.flags.priorities)
    : createManifest('dry-run', 'dry-run', input.flags.priorities)

  for (const ref of input.refs) {
    const source = classifyStorageSource(ref.url)
    const heroLcp = isHeroLcpUsage(ref.url, ref.usages)
    const priority = classifyPriority(ref.url, ref.usages, heroLcp)
    const earlySkip = classifySkipReason({ url: ref.url })
    const base: ImageBackfillItem = {
      url: ref.url,
      source,
      usages: ref.usages,
      mime: null,
      originalBytes: null,
      width: null,
      height: null,
      priority,
      isHeroLcp: heroLcp,
      eligible: false,
      skipReason: earlySkip,
      estimate: null,
    }

    if (earlySkip) {
      addSkip(totals, earlySkip)
      items.push(base)
      continue
    }

    if (input.flags.apply && !input.flags.priorities.includes(priority)) {
      base.skipReason = 'priority-filtered'
      addSkip(totals, 'priority-filtered')
      items.push(base)
      continue
    }

    const binary = await loadBinary(ref, input.resolveFetchUrl(ref.url), input.io ?? {})
    if (!binary) {
      base.skipReason = 'fetch-failed'
      addSkip(totals, 'fetch-failed')
      items.push(base)
      continue
    }

    base.mime = binary.mime
    base.originalBytes = binary.bytes
    if (binary.bytes < MIN_APPLY_BYTES) {
      base.skipReason = 'too-small'
      addSkip(totals, 'too-small')
      items.push(base)
      continue
    }
    const mimeSkip = classifySkipReason({ url: ref.url, mime: binary.mime })
    if (mimeSkip) {
      base.skipReason = mimeSkip
      addSkip(totals, mimeSkip)
      items.push(base)
      continue
    }

    const estimate = await estimateOptimizedImage({
      url: ref.url,
      stem: stemFromUrl(ref.url),
      mime: binary.mime || 'image/jpeg',
      buffer: binary.buffer,
    })

    if ('skip' in estimate) {
      base.skipReason = estimate.skip
      addSkip(totals, estimate.skip)
      items.push(base)
      continue
    }

    base.eligible = true
    base.skipReason = null
    base.estimate = estimate
    base.width = estimate.canonicalWidth
    base.height = estimate.canonicalHeight
    totals.eligible += 1
    totals.originalRasterBytes += binary.bytes
    totals.optimizedCanonicalBytes += estimate.canonicalBytes
    totals.variantStorageBytes += estimate.variantStorageBytes
    totals.typicalMobileBytes += estimate.typicalMobileBytes
    totals.typicalDesktopBytes += estimate.typicalDesktopBytes
    items.push(base)

    if (!input.flags.apply || !input.io?.applyPort) continue

    applyStats.attempted += 1
    const planned: ImageBackfillManifestEntry = {
      sourceType: source,
      priority,
      oldUrl: ref.url,
      newCanonicalUrl: estimate.proposedCanonicalUrl,
      usages: ref.usages,
      variantUrls: [],
      orphanVariantUrls: [],
      cmsUpdated: false,
      cmsLocations: [],
      status: 'planned',
      timestamp: new Date().toISOString(),
    }
    upsertManifestEntry(manifest, planned)
    if (input.io.manifestPath) await writeManifest(input.io.manifestPath, manifest)

    const applied = await applyOptimizedAsset({
      item: base,
      buffer: binary.buffer,
      mime: binary.mime || 'image/jpeg',
      port: input.io.applyPort,
      updateCms: source !== 'frontend-static',
    })

    planned.newCanonicalUrl = applied.newCanonicalUrl
    planned.variantUrls = applied.variantUrls
    planned.orphanVariantUrls = applied.orphanVariantUrls
    planned.cmsUpdated = applied.cmsUpdated
    planned.cmsLocations = applied.cmsLocations
    planned.status = applied.status
    planned.timestamp = new Date().toISOString()
    upsertManifestEntry(manifest, planned)
    if (input.io.manifestPath) await writeManifest(input.io.manifestPath, manifest)

    if (applied.status === 'success' || applied.status === 'static-written') {
      applyStats.succeeded += 1
      if (source === 'vercel-blob' || (source === 'r2' && applied.variantUrls.some((url) => /blob\.vercel-storage/.test(url)))) {
        applyStats.blobUploads += applied.variantUrls.length
      } else if (source === 'r2') {
        applyStats.r2Uploads += applied.variantUrls.length
      } else if (source === 'frontend-static') {
        applyStats.staticFiles += applied.variantUrls.length
      }
      if (applied.cmsUpdated) applyStats.cmsUpdates += applied.cmsLocations.length
    } else if (applied.status === 'skipped') {
      applyStats.skipped += 1
    } else {
      applyStats.failed += 1
    }
  }

  if (totals.originalRasterBytes > 0) {
    totals.estimatedCanonicalReductionPct = Number(
      (
        ((totals.originalRasterBytes - totals.optimizedCanonicalBytes) / totals.originalRasterBytes) *
        100
      ).toFixed(1),
    )
  }

  if (input.flags.apply && !input.io?.applyPort) {
    for (const item of items) {
      if (!item.eligible || !item.estimate) continue
      await writers.uploadAsset(item.estimate.proposedCanonicalFileName, item.estimate.canonicalBytes)
      await writers.updateCmsUrl(item.url, item.estimate.proposedCanonicalUrl)
    }
  }

  const rollbackMappings = buildRollbackMappings(items)
  const heavyItems = items
    .filter((item) => (item.originalBytes || 0) >= 1024 * 1024)
    .sort((a, b) => (b.originalBytes || 0) - (a.originalBytes || 0))

  return {
    mode: input.flags.apply ? 'apply' : 'dry-run',
    generatedAt: new Date().toISOString(),
    runId,
    apiBase: input.apiBase ?? null,
    siteBase: input.siteBase ?? null,
    coverageNotes: input.coverageNotes ?? [],
    totals,
    apply: input.flags.apply ? applyStats : undefined,
    items,
    rollbackMappings,
    heavyItems,
    manifestPath: input.io?.manifestPath,
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
