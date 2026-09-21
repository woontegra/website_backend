import type { ImageBackfillApplyPort, ImageBackfillManifest } from './imageBackfill.types'
import { assertRollbackAllowed, type parseBackfillCliFlags } from './imageBackfill.safety'

type RollbackFlags = ReturnType<typeof parseBackfillCliFlags>

export async function rollbackCmsFromManifest(input: {
  flags: RollbackFlags
  manifest: ImageBackfillManifest
  port: ImageBackfillApplyPort
}): Promise<{ restored: number; locations: string[] }> {
  assertRollbackAllowed(input.flags)
  let restored = 0
  const locations: string[] = []
  for (const entry of input.manifest.entries) {
    if (!entry.cmsUpdated || !entry.newCanonicalUrl) continue
    const result = await input.port.replaceCmsUrls(entry.newCanonicalUrl, entry.oldUrl)
    restored += result.updated
    locations.push(...result.locations)
  }
  return { restored, locations }
}
