import fs from 'fs'
import path from 'path'
import { prisma } from '../lib/prisma'

const UPLOAD_SUBDIR = 'uploads'

export function getUploadsDir(): string {
  return path.join(process.cwd(), 'public', UPLOAD_SUBDIR)
}

export function ensureUploadsDir() {
  const dir = getUploadsDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

/** Public URL path (Express static serves /uploads from public/uploads) */
export function publicUrlForFilename(filename: string): string {
  return `/${UPLOAD_SUBDIR}/${filename}`
}

export async function createMediaRecord(filename: string, mimeType: string | undefined, size: number) {
  const url = publicUrlForFilename(filename)
  return prisma.mediaAsset.create({
    data: { url, filename, mimeType: mimeType ?? null, size },
  })
}

export async function listMediaAssets() {
  return prisma.mediaAsset.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })
}

export async function deleteMediaAsset(id: string) {
  const row = await prisma.mediaAsset.findUnique({ where: { id } })
  if (!row) return null
  const filePath = path.join(getUploadsDir(), row.filename)
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {
    /* ignore */
  }
  await prisma.mediaAsset.delete({ where: { id } })
  return row
}
