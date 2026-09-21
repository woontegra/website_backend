import type { BackfillWriteGuard, ImageBackfillCliFlags, ImageBackfillPriority } from './imageBackfill.types'

export const IMAGE_BACKFILL_APPLY_BLOCKED = 'IMAGE_BACKFILL_APPLY_BLOCKED'
export const IMAGE_BACKFILL_PRIORITY_REQUIRED = 'IMAGE_BACKFILL_PRIORITY_REQUIRED'
export const IMAGE_BACKFILL_DELETE_DISABLED = 'IMAGE_BACKFILL_DELETE_DISABLED'
export const IMAGE_BACKFILL_ROLLBACK_BLOCKED = 'IMAGE_BACKFILL_ROLLBACK_BLOCKED'
export const IMAGE_BACKFILL_ALLOW_PRODUCTION_WRITE = 'IMAGE_BACKFILL_ALLOW_PRODUCTION_WRITE'

const PRIORITIES = new Set<ImageBackfillPriority>(['P0', 'P1', 'P2', 'P3'])

export function parsePriorityList(raw?: string | null): ImageBackfillPriority[] {
  if (!raw?.trim()) return []
  return raw
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter((item): item is ImageBackfillPriority => PRIORITIES.has(item as ImageBackfillPriority))
}

export function parseBackfillCliFlags(argv: string[], env: NodeJS.ProcessEnv = process.env): ImageBackfillCliFlags {
  const priorityArg = argv.find((item) => item.startsWith('--priority='))
  return {
    apply: argv.includes('--apply'),
    confirmProductionBackfill: argv.includes('--confirm-production-backfill'),
    allowProductionWrite: env.IMAGE_BACKFILL_ALLOW_PRODUCTION_WRITE === '1',
    priorities: parsePriorityList(priorityArg?.slice('--priority='.length)),
    rollback: argv.includes('--rollback'),
    confirmProductionRollback: argv.includes('--confirm-production-rollback'),
    manifestPath: argv.find((item) => item.startsWith('--manifest='))?.slice('--manifest='.length),
  }
}

export function assertApplyAllowed(flags: ImageBackfillCliFlags): void {
  if (flags.apply && flags.confirmProductionBackfill && flags.allowProductionWrite) return
  const error = new Error(
    'Production backfill apply üçlü opt-in ister: --apply --confirm-production-backfill ve IMAGE_BACKFILL_ALLOW_PRODUCTION_WRITE=1',
  )
  error.name = IMAGE_BACKFILL_APPLY_BLOCKED
  throw error
}

export function assertPriorityFilter(flags: ImageBackfillCliFlags): void {
  if (flags.priorities.length > 0) return
  const error = new Error('Production apply --priority=P0,P1 olmadan yazılmaz.')
  error.name = IMAGE_BACKFILL_PRIORITY_REQUIRED
  throw error
}

export function assertProductionWriteAllowed(flags: ImageBackfillCliFlags): void {
  assertApplyAllowed(flags)
  assertPriorityFilter(flags)
}

export function assertRollbackAllowed(flags: ImageBackfillCliFlags): void {
  if (flags.rollback && flags.confirmProductionRollback && flags.allowProductionWrite && flags.manifestPath) {
    return
  }
  const error = new Error(
    'Rollback üçlü opt-in ister: --rollback --confirm-production-rollback --manifest=... ve IMAGE_BACKFILL_ALLOW_PRODUCTION_WRITE=1',
  )
  error.name = IMAGE_BACKFILL_ROLLBACK_BLOCKED
  throw error
}

export function createBackfillWriteGuard(flags: ImageBackfillCliFlags): BackfillWriteGuard {
  const deleteAsset = () => {
    const error = new Error('Backfill DELETE kapalıdır.')
    error.name = IMAGE_BACKFILL_DELETE_DISABLED
    throw error
  }

  if (!flags.apply) {
    return {
      mode: 'dry-run',
      uploadAsset() {
        throw new Error('dry-run storage write blocked')
      },
      updateCmsUrl() {
        throw new Error('dry-run DB write blocked')
      },
      deleteAsset,
    }
  }

  if (!flags.confirmProductionBackfill || !flags.allowProductionWrite || flags.priorities.length === 0) {
    return {
      mode: 'blocked-apply',
      uploadAsset() {
        assertProductionWriteAllowed(flags)
      },
      updateCmsUrl() {
        assertProductionWriteAllowed(flags)
      },
      deleteAsset,
    }
  }

  return {
    mode: 'apply-ready',
    uploadAsset() {
      /* real apply uses ImageBackfillApplyPort */
    },
    updateCmsUrl() {
      /* real apply uses ImageBackfillApplyPort */
    },
    deleteAsset,
  }
}
