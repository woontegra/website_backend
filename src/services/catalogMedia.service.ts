import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { CatalogMediaFileType, MediaStorageProvider, Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { isR2PublicUploadConfigured, getR2ConfigStatus, assertR2PublicUploadConfigured } from '../lib/r2.client'
import { isVercelBlobConfigured, assertVercelBlobConfigured, VERCEL_BLOB_BUCKET_MARKER, getVercelBlobConfigStatus } from '../lib/vercelBlob.client'
import {
  buildWebsiteMediaBlobPath,
  deleteWebsiteMediaBlob,
  normalizeWebsiteMediaFolder,
  uploadWebsiteMediaBlob,
  type WebsiteMediaFolder,
} from './vercelBlobUpload.service'
import {
  buildCatalogObjectKey,
  deletePublicObject,
  inferContentType,
  uploadPublicObject,
} from './r2Upload.service'
import { buildSafeCatalogStorageFilename, maybeFixMojibakeFilename } from '../utils/uploadFilename'

const UPLOAD_SUBDIR = 'catalog'

function resolveCatalogUploadDir(): string {
  const dir = path.join(process.cwd(), 'public', 'uploads', UPLOAD_SUBDIR)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function classifyCatalogFileType(mimetype: string, originalName: string): CatalogMediaFileType {
  const m = (mimetype || '').toLowerCase().split(';')[0]?.trim() ?? ''
  if (/^image\//.test(m)) return 'IMAGE'
  if (m === 'application/pdf') return 'DOCUMENT'
  const lowerName = (originalName || '').toLowerCase()
  if (/\.(jpe?g|png|webp|svg|gif|avif|bmp|heic|heif)$/.test(lowerName)) return 'IMAGE'
  if (lowerName.endsWith('.pdf')) return 'DOCUMENT'
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
  storageProvider: MediaStorageProvider
  bucket: string | null
  publicUrl: string | null
  createdAt: string
  updatedAt: string
}

function effectiveMediaUrl(row: {
  url: string
  publicUrl: string | null
  storageProvider: MediaStorageProvider
  bucket: string | null
}): string {
  if (row.bucket === VERCEL_BLOB_BUCKET_MARKER && row.publicUrl) return row.publicUrl
  if (row.storageProvider === 'R2' && row.publicUrl) return row.publicUrl
  return row.url
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
  storageProvider: MediaStorageProvider
  bucket: string | null
  publicUrl: string | null
  createdAt: Date
  updatedAt: Date
}): CatalogMediaDto {
  const displayUrl = effectiveMediaUrl(row)
  return {
    id: row.id,
    fileName: row.fileName,
    originalName: maybeFixMojibakeFilename(row.originalName),
    mimeType: row.mimeType,
    fileType: row.fileType,
    fileSize: row.fileSize,
    url: displayUrl,
    storageKey: row.storageKey,
    storageProvider: row.storageProvider,
    bucket: row.bucket,
    publicUrl: row.publicUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function persistUploadToDisk(
  file: Express.Multer.File,
  id: string,
  fileName: string,
  displayOriginalName: string,
  fileType: CatalogMediaFileType,
): Promise<CatalogMediaDto> {
  const dir = resolveCatalogUploadDir()
  const absolutePath = path.join(dir, fileName)
  fs.writeFileSync(absolutePath, file.buffer)
  if (!fs.existsSync(absolutePath)) {
    throw new Error('Dosya diske yazılamadı')
  }

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
      storageProvider: 'LOCAL',
      bucket: null,
      publicUrl: null,
    },
  })
  return mapRow(row)
}

async function persistUploadToVercelBlob(
  file: Express.Multer.File,
  id: string,
  fileName: string,
  displayOriginalName: string,
  fileType: CatalogMediaFileType,
  folder: WebsiteMediaFolder,
): Promise<CatalogMediaDto> {
  const contentType = file.mimetype || inferContentType(fileName)
  const pathname = buildWebsiteMediaBlobPath(folder, fileName)
  const uploaded = await uploadWebsiteMediaBlob({
    pathname,
    body: file.buffer,
    contentType,
  })

  const row = await prisma.catalogMedia.create({
    data: {
      id,
      fileName,
      originalName: displayOriginalName,
      mimeType: contentType,
      fileType,
      fileSize: file.size,
      url: uploaded.url,
      storageKey: uploaded.pathname,
      storageProvider: 'LOCAL',
      bucket: VERCEL_BLOB_BUCKET_MARKER,
      publicUrl: uploaded.url,
    },
  })
  return mapRow(row)
}

async function persistUploadToR2(
  file: Express.Multer.File,
  id: string,
  fileName: string,
  displayOriginalName: string,
  fileType: CatalogMediaFileType,
): Promise<CatalogMediaDto> {
  const contentType = file.mimetype || inferContentType(fileName)
  const objectKey = buildCatalogObjectKey('general', fileName)
  const uploaded = await uploadPublicObject({
    objectKey,
    body: file.buffer,
    contentType,
  })

  const row = await prisma.catalogMedia.create({
    data: {
      id,
      fileName,
      originalName: displayOriginalName,
      mimeType: contentType,
      fileType,
      fileSize: file.size,
      url: uploaded.publicUrl,
      storageKey: uploaded.objectKey,
      storageProvider: 'R2',
      bucket: uploaded.bucket,
      publicUrl: uploaded.publicUrl,
    },
  })
  return mapRow(row)
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

  async persistUpload(
    file: Express.Multer.File,
    options?: { folder?: string },
  ): Promise<CatalogMediaDto> {
    const rawOriginal = maybeFixMojibakeFilename(file.originalname || '')
    const fileType = classifyCatalogFileType(file.mimetype, rawOriginal)
    const ext = safeExt(rawOriginal, file.mimetype)
    const id = randomUUID()
    const { storageFileName, displayOriginalName } = buildSafeCatalogStorageFilename(rawOriginal, ext)
    const fileName = storageFileName
    const mediaFolder = normalizeWebsiteMediaFolder(options?.folder)
    const blobStatus = getVercelBlobConfigStatus()

    // Website görselleri (IMAGE/DOCUMENT) → yalnızca Vercel Blob (R2'ye düşmez)
    if (fileType === 'IMAGE' || fileType === 'DOCUMENT') {
      if (blobStatus.configured) {
        const row = await persistUploadToVercelBlob(
          file,
          id,
          fileName,
          displayOriginalName,
          fileType,
          mediaFolder,
        )
        console.info('[catalogMedia] upload', {
          fileType,
          folder: mediaFolder,
          storage: 'vercel-blob',
          blobConfigured: true,
        })
        return row
      }

      if (process.env.NODE_ENV === 'production') {
        assertVercelBlobConfigured()
      }

      console.warn(
        '[catalogMedia] blobConfigured=false; geliştirme modunda IMAGE/DOCUMENT yerel diske yazılıyor.',
      )
      const row = await persistUploadToDisk(file, id, fileName, displayOriginalName, fileType)
      console.info('[catalogMedia] upload', {
        fileType,
        folder: mediaFolder,
        storage: 'local-disk',
        blobConfigured: false,
      })
      return row
    }

    if (fileType !== 'DOWNLOAD') {
      throw new Error(`Desteklenmeyen medya tipi: ${fileType}`)
    }

    // DOWNLOAD (setup/portable vb.) — mevcut R2 akışı korunur
    const r2Status = getR2ConfigStatus()
    if (r2Status.partiallyConfigured) {
      assertR2PublicUploadConfigured()
    }

    if (isR2PublicUploadConfigured()) {
      const row = await persistUploadToR2(file, id, fileName, displayOriginalName, fileType)
      console.info('[catalogMedia] upload', {
        fileType,
        storage: 'r2',
        blobConfigured: blobStatus.configured,
      })
      return row
    }

    if (process.env.NODE_ENV === 'production') {
      assertR2PublicUploadConfigured()
    }

    console.warn(
      '[catalogMedia] R2 public upload env tanımlı değil; geliştirme modunda dosya yerel diske yazılıyor (public/uploads/catalog).',
    )
    return persistUploadToDisk(file, id, fileName, displayOriginalName, fileType)
  },

  async deleteAdmin(id: string): Promise<CatalogMediaDto | null> {
    const row = await prisma.catalogMedia.findUnique({ where: { id } })
    if (!row) return null

    const usedCover = await prisma.product.count({ where: { coverImageMediaId: id } })
    const usedDl = await prisma.product.count({ where: { downloadMediaId: id } })
    if (usedCover + usedDl > 0) {
      throw new Error('Bu dosya bir veya daha fazla üründe kullanılıyor; önce ürünlerden kaldırın.')
    }

    if (row.bucket === VERCEL_BLOB_BUCKET_MARKER && row.storageKey) {
      try {
        if (isVercelBlobConfigured()) {
          await deleteWebsiteMediaBlob(row.storageKey)
        }
      } catch {
        // Blob silme hatası DB kaydını engellemesin
      }
    } else if (row.storageProvider === 'R2' && row.storageKey) {
      try {
        await deletePublicObject(row.storageKey, row.bucket ?? undefined)
      } catch {
        // R2 silme hatası DB kaydını engellemesin
      }
    } else if (row.url.startsWith('/uploads/')) {
      const relPath = row.url.replace(/^\/uploads\//, '')
      const abs = path.join(process.cwd(), 'public', 'uploads', relPath)
      try {
        if (fs.existsSync(abs)) fs.unlinkSync(abs)
      } catch {
        // ignore fs errors
      }
    }

    await prisma.catalogMedia.delete({ where: { id } })
    return mapRow(row)
  },
}
