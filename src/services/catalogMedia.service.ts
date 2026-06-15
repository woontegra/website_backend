import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { CatalogMediaFileType, Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { buildSafeCatalogStorageFilename, maybeFixMojibakeFilename } from '../utils/uploadFilename'

const UPLOAD_SUBDIR = 'catalog'

function resolveCatalogUploadDir(): string {
  const dir = path.join(process.cwd(), 'public', 'uploads', UPLOAD_SUBDIR)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function classifyCatalogFileType(mimetype: string, originalName: string): CatalogMediaFileType {
  const m = mimetype.toLowerCase()
  if (/^image\//.test(m)) return 'IMAGE'
  if (m === 'application/pdf') return 'DOCUMENT'
  return 'DOWNLOAD'
}

function safeExt(originalName: string, mimetype: string): string {
  const base = path.extname(originalName || '').toLowerCase().replace(/^\./, '')
  if (base && /^[a-z0-9]{1,8}$/.test(base)) return base
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'application/x-zip-compressed': 'zip',
    'application/x-msdownload': 'exe',
    'application/x-msi': 'msi',
    'application/x-apple-diskimage': 'dmg',
  }
  return map[mimetype.toLowerCase()] || 'bin'
}

export type CatalogMediaDto = {
  id: string
  fileName: string
  originalName: string
  mimeType: string
  fileType: CatalogMediaFileType
  fileSize: number
  url: string
  storageKey: string | null
  createdAt: string
  updatedAt: string
}

function mapRow(row: {
  id: string
  fileName: string
  originalName: string
  mimeType: string
  fileType: CatalogMediaFileType
  fileSize: number
  url: string
  storageKey: string | null
  createdAt: Date
  updatedAt: Date
}): CatalogMediaDto {
  return {
    id: row.id,
    fileName: row.fileName,
    originalName: maybeFixMojibakeFilename(row.originalName),
    mimeType: row.mimeType,
    fileType: row.fileType,
    fileSize: row.fileSize,
    url: row.url,
    storageKey: row.storageKey,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export const catalogMediaService = {
  async listAdmin(fileType?: CatalogMediaFileType): Promise<CatalogMediaDto[]> {
    const where: Prisma.CatalogMediaWhereInput = {}
    if (fileType) where.fileType = fileType
    const rows = await prisma.catalogMedia.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    return rows.map(mapRow)
  },

  async getById(id: string): Promise<CatalogMediaDto | null> {
    const row = await prisma.catalogMedia.findUnique({ where: { id } })
    return row ? mapRow(row) : null
  },

  async persistUpload(file: Express.Multer.File): Promise<CatalogMediaDto> {
    const rawOriginal = maybeFixMojibakeFilename(file.originalname || '')
    const fileType = classifyCatalogFileType(file.mimetype, rawOriginal)
    const ext = safeExt(rawOriginal, file.mimetype)
    const id = randomUUID()
    const { storageFileName, displayOriginalName } = buildSafeCatalogStorageFilename(rawOriginal, ext)
    const fileName = storageFileName
    const dir = resolveCatalogUploadDir()
    const absolutePath = path.join(dir, fileName)
    fs.writeFileSync(absolutePath, file.buffer)

    const publicUrl = `/uploads/${UPLOAD_SUBDIR}/${fileName}`
    const row = await prisma.catalogMedia.create({
      data: {
        id,
        fileName,
        originalName: displayOriginalName,
        mimeType: file.mimetype,
        fileType,
        fileSize: file.size,
        url: publicUrl,
        storageKey: null,
      },
    })
    return mapRow(row)
  },

  async deleteAdmin(id: string): Promise<CatalogMediaDto | null> {
    const row = await prisma.catalogMedia.findUnique({ where: { id } })
    if (!row) return null

    const usedCover = await prisma.product.count({ where: { coverImageMediaId: id } })
    const usedDl = await prisma.product.count({ where: { downloadMediaId: id } })
    if (usedCover + usedDl > 0) {
      throw new Error('Bu dosya bir veya daha fazla üründe kullanılıyor; önce ürünlerden kaldırın.')
    }

    const relPath = row.url.replace(/^\/uploads\//, '')
    const abs = path.join(process.cwd(), 'public', 'uploads', relPath)
    try {
      if (fs.existsSync(abs)) fs.unlinkSync(abs)
    } catch {
      // ignore fs errors
    }

    await prisma.catalogMedia.delete({ where: { id } })
    return mapRow(row)
  },
}
