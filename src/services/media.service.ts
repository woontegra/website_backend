import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'
import { deleteByUrl, isCloudinaryConfigured, uploadImageBuffer } from './cloudinary.service'

const UPLOAD_SUBDIR = 'uploads'

export function getUploadsDir(): string {
  return path.join(process.cwd(), 'public', UPLOAD_SUBDIR)
}

export function ensureUploadsDir() {
  const dir = getUploadsDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

/** Yerel disk için public URL (Railway'de geçici — yeni yüklemeler Cloudinary kullanmalı) */
export function publicUrlForFilename(filename: string): string {
  return `/${UPLOAD_SUBDIR}/${filename}`
}

export async function persistUploadedImage(file: Express.Multer.File) {
  if (isCloudinaryConfigured()) {
    const { secureUrl } = await uploadImageBuffer(file.buffer, file.originalname)
    return prisma.mediaAsset.create({
      data: {
        url: secureUrl,
        filename: file.originalname,
        mimeType: file.mimetype ?? null,
        size: file.size,
      },
    })
  }

  ensureUploadsDir()
  const ext = path.extname(file.originalname) || '.bin'
  const filename = `${randomUUID()}${ext}`
  const filePath = path.join(getUploadsDir(), filename)
  fs.writeFileSync(filePath, file.buffer)

  const url = publicUrlForFilename(filename)
  return prisma.mediaAsset.create({
    data: { url, filename, mimeType: file.mimetype ?? null, size: file.size },
  })
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

  if (row.url.includes('cloudinary.com')) {
    await deleteByUrl(row.url)
  } else {
    const filePath = path.join(getUploadsDir(), row.filename)
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    } catch {
      /* ignore */
    }
  }

  await prisma.mediaAsset.delete({ where: { id } })
  return row
}
