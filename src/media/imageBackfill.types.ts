export type ImageStorageSource = 'vercel-blob' | 'r2' | 'frontend-static' | 'other'

export type ImageBackfillPriority = 'P0' | 'P1' | 'P2' | 'P3'

export type ImageBackfillSkipReason =
  | 'svg'
  | 'gif-animated'
  | 'installer'
  | 'document'
  | 'private-storage'
  | 'already-optimized'
  | 'not-raster'
  | 'fetch-failed'
  | 'transform-failed'
  | 'empty-url'
  | 'too-small'
  | 'priority-filtered'

export type ImageBackfillUsage = {
  page: string
  field: string
  component?: string
}

export type ImageBackfillRef = {
  url: string
  usages: ImageBackfillUsage[]
  localPath?: string
}

export type ImageBackfillCliFlags = {
  apply: boolean
  confirmProductionBackfill: boolean
  allowProductionWrite: boolean
  priorities: ImageBackfillPriority[]
  rollback: boolean
  confirmProductionRollback: boolean
  manifestPath?: string
}

export type OptimizedVariantEstimate = {
  fileName: string
  format: string
  width: number
  height: number
  bytes: number
}

export type ImageBackfillEstimate = {
  canonicalFormat: string
  canonicalBytes: number
  canonicalWidth: number
  canonicalHeight: number
  hasAvif: boolean
  marker: 'opt' | 'optavif'
  proposedCanonicalFileName: string
  proposedCanonicalUrl: string
  variants: OptimizedVariantEstimate[]
  variantStorageBytes: number
  typicalMobileBytes: number
  typicalDesktopBytes: number
}

export type ImageBackfillItem = {
  url: string
  source: ImageStorageSource
  usages: ImageBackfillUsage[]
  mime: string | null
  originalBytes: number | null
  width: number | null
  height: number | null
  priority: ImageBackfillPriority
  isHeroLcp: boolean
  eligible: boolean
  skipReason: ImageBackfillSkipReason | null
  estimate: ImageBackfillEstimate | null
}

export type ImageBackfillRollbackMapping = {
  oldUrl: string
  newUrl: string
  usages: ImageBackfillUsage[]
}

export type ImageBackfillTotals = {
  scanned: number
  eligible: number
  skipped: number
  skipReasons: Partial<Record<ImageBackfillSkipReason, number>>
  originalRasterBytes: number
  optimizedCanonicalBytes: number
  variantStorageBytes: number
  typicalMobileBytes: number
  typicalDesktopBytes: number
  estimatedCanonicalReductionPct: number | null
}

export type ImageBackfillApplyStatus =
  | 'planned'
  | 'success'
  | 'failed-upload'
  | 'failed-cms'
  | 'skipped'
  | 'static-written'

export type ImageBackfillManifestEntry = {
  sourceType: ImageStorageSource
  priority: ImageBackfillPriority
  oldUrl: string
  newCanonicalUrl: string | null
  usages: ImageBackfillUsage[]
  variantUrls: string[]
  orphanVariantUrls: string[]
  cmsUpdated: boolean
  cmsLocations: string[]
  status: ImageBackfillApplyStatus
  timestamp: string
}

export type ImageBackfillManifest = {
  runId: string
  timestamp: string
  mode: 'apply' | 'dry-run' | 'rollback'
  priorities: ImageBackfillPriority[]
  entries: ImageBackfillManifestEntry[]
}

export type ImageBackfillApplyResult = {
  status: ImageBackfillApplyStatus
  newCanonicalUrl: string | null
  variantUrls: string[]
  orphanVariantUrls: string[]
  cmsUpdated: boolean
  cmsLocations: string[]
  error?: string
}

export type ImageBackfillReport = {
  mode: 'dry-run' | 'apply'
  generatedAt: string
  runId: string | null
  apiBase: string | null
  siteBase: string | null
  coverageNotes: string[]
  totals: ImageBackfillTotals
  apply?: {
    attempted: number
    succeeded: number
    failed: number
    skipped: number
    blobUploads: number
    r2Uploads: number
    staticFiles: number
    cmsUpdates: number
  }
  items: ImageBackfillItem[]
  rollbackMappings: ImageBackfillRollbackMapping[]
  heavyItems: ImageBackfillItem[]
  manifestPath?: string
}

export type BackfillWriteGuard = {
  mode: 'dry-run' | 'blocked-apply' | 'apply-ready'
  uploadAsset: (fileName: string, bytes: number) => Promise<void> | void
  updateCmsUrl: (oldUrl: string, newUrl: string) => Promise<void> | void
  deleteAsset: (url: string) => void
}

export type PreparedVariantFile = {
  fileName: string
  mimeType: string
  buffer: Buffer
  bytes: number
}

export type ImageBackfillApplyPort = {
  uploadVariants: (input: {
    source: ImageStorageSource
    originalUrl: string
    files: PreparedVariantFile[]
    canonicalFileName: string
  }) => Promise<{ uploaded: { fileName: string; url: string }[]; canonicalUrl: string }>
  replaceCmsUrls: (oldUrl: string, newUrl: string) => Promise<{ updated: number; locations: string[] }>
  writeStaticFiles: (files: { relativePath: string; buffer: Buffer }[]) => Promise<string[]>
  replaceFrontendRefs?: (oldUrl: string, newUrl: string) => Promise<number>
}
