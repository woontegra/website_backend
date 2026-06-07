import { prisma } from '../lib/prisma'
import { deleteByUrl } from './cloudinary.service'
import { normalizePublicImagePath } from './imagePathAliases'

export class MediaUploadDisabledError extends Error {
  readonly code = 'UPLOAD_DISABLED'

  constructor() {
    super(
      'Bilgisayardan görsel yükleme devre dışı. Woontegra kurumsal site görselleri frontend/public/images altındadır; panelden /images/... yolu seçin.',
    )
    this.name = 'MediaUploadDisabledError'
  }
}

/** Kurumsal site CMS — yükleme kapalı; yalnızca public/images path kullanılır */
export async function persistUploadedImage(_file: Express.Multer.File): Promise<never> {
  throw new MediaUploadDisabledError()
}

export async function listMediaAssets() {
  const rows = await prisma.mediaAsset.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })
  return rows.map((row) => ({
    ...row,
    url: normalizePublicImagePath(row.url) || row.url,
  }))
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
    provider: 'public-images' as const,
    uploadEnabled: false,
    basePath: '/images/',
    message: 'Görseller frontend/public/images klasöründen servis edilir.',
  }
}
