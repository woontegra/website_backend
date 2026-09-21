import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import type { ImageBackfillManifest, ImageBackfillManifestEntry } from './imageBackfill.types'

export function createRunId(): string {
  return `imgbf-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}-${randomUUID().slice(0, 8)}`
}

export function createManifest(
  runId: string,
  mode: ImageBackfillManifest['mode'],
  priorities: ImageBackfillManifest['priorities'],
  entries: ImageBackfillManifestEntry[] = [],
): ImageBackfillManifest {
  return {
    runId,
    timestamp: new Date().toISOString(),
    mode,
    priorities,
    entries,
  }
}

export async function writeManifest(filePath: string, manifest: ImageBackfillManifest): Promise<string> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(manifest, null, 2), 'utf8')
  return filePath
}

export async function readManifest(filePath: string): Promise<ImageBackfillManifest> {
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw) as ImageBackfillManifest
}

export function upsertManifestEntry(manifest: ImageBackfillManifest, entry: ImageBackfillManifestEntry): void {
  const index = manifest.entries.findIndex((item) => item.oldUrl === entry.oldUrl)
  if (index >= 0) manifest.entries[index] = entry
  else manifest.entries.push(entry)
}
