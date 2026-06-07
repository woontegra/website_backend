import path from 'path'
import { prisma } from '../lib/prisma'
import { deleteByUrl, isCloudinaryConfigured, uploadImageBuffer } from './cloudinary.service'

export class PersistentMediaNotConfiguredError extends Error {
  readonly code = 'CLOUDINARY_NOT_CONFIGURED'

  constructor() {
    super(
      'Kalıcı medya depolama yapılandırılmamış. Railway ortam değişkenlerine CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY ve CLOUDINARY_API_SECRET ekleyin.',
    )
    this.name = 'PersistentMediaNotConfiguredError'
  }
}

export class InvalidPersistentMediaUrlError extends Error {
  constructor(url: string) {
    super(`Cloudinary secure_url bekleniyordu; geçersiz yanıt: ${url}`)
    this.name = 'InvalidPersistentMediaUrlError'
  }
}

function assertCloudinarySecureUrl(url: string): string {
  if (!/^https:\/\/res\.cloudinary\.com\//i.test(url)) {
    throw new InvalidPersistentMediaUrlError(url)
  }
  return url
}

/**
 * Kurumsal site CMS görselleri — yalnızca Cloudinary (kalıcı).
 * Local /uploads fallback bilinçli olarak kaldırıldı (Railway/Vercel geçici disk).
 */
export async function persistUploadedImage(file: Express.Multer.File) {
  if (!isCloudinaryConfigured()) {
    throw new PersistentMediaNotConfiguredError()
  }

  const { secureUrl } = await uploadImageBuffer(file.buffer, file.originalname)
  const url = assertCloudinarySecureUrl(secureUrl)

  return prisma.mediaAsset.create({
    data: {
      url,
      filename: path.basename(file.originalname) || 'upload',
      mimeType: file.mimetype ?? null,
      size: file.size,
    },
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
  }

  await prisma.mediaAsset.delete({ where: { id } })
  return row
}

export function getMediaStorageInfo() {
  return {
    provider: 'cloudinary' as const,
    configured: isCloudinaryConfigured(),
    folder: process.env.CLOUDINARY_FOLDER?.trim() || 'woontegra',
    requiredEnv: ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'],
  }
}
