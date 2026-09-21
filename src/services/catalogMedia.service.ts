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
import { IMAGE_OPTIMIZATION_CONFIG, IMAGE_VARIANT_WIDTHS } from '../media/imageOptimization.config'
import { assertRasterImageByteLimit } from '../media/imageOptimization.policy'
import { prepareCatalogImageForStorage } from '../media/prepareCatalogImage'
import type { OptimizedImageSet } from '../media/imageOptimization.service'
import {
  isOptimizedFileName,
  listOptimizedSiblingNames,
  parseOptimizedFileName,
  replacePathFileName,
  requireUploadedCanonical,
  type OptimizedImageFormat,
} from '../media/imageVariantNames'

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
    'image/avif': 'avif',
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

export type CatalogImageVariantDto = {
  width: number
  format: OptimizedImageFormat
  mimeType: string
  url: string
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
  width?: number
  height?: number
  format?: string
  variants?: CatalogImageVariantDto[]
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

function withOptimizedMeta(
  dto: CatalogMediaDto,
  set: OptimizedImageSet,
  urlForFileName: (fileName: string) => string,
): CatalogMediaDto {
  return {
    ...dto,
    width: set.width,
    height: set.height,
    format: set.format,
    variants: set.files
      .map((file) => ({
        width: file.width,
        format: file.format,
        mimeType: file.mimeType,
        url: urlForFileName(file.fileName),
      }))
      .filter((file) => Boolean(file.url)),
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

async function persistOptimizedImageToVercelBlob(
  set: OptimizedImageSet,
  id: string,
  displayOriginalName: string,
  folder: WebsiteMediaFolder,
): Promise<CatalogMediaDto> {
  const uploadedUrls = new Map<string, { url: string; pathname: string }>()

  for (const file of set.files) {
    const pathname = buildWebsiteMediaBlobPath(folder, file.fileName)
    const uploaded = await uploadWebsiteMediaBlob({
      pathname,
      body: file.buffer,
      contentType: file.mimeType,
      cacheControlMaxAge: IMAGE_OPTIMIZATION_CONFIG.blobCacheControlMaxAge,
    })
    uploadedUrls.set(file.fileName, { url: uploaded.url, pathname: uploaded.pathname })
  }

  const canonicalUpload = requireUploadedCanonical(uploadedUrls, set.canonical.fileName)
  if (!canonicalUpload.pathname) {
    throw new Error('Optimize edilmiş canonical görsel yüklenemedi.')
  }

  const row = await prisma.catalogMedia.create({
    data: {
      id,
      fileName: set.canonical.fileName,
      originalName: displayOriginalName,
      mimeType: set.canonical.mimeType,
      fileType: 'IMAGE',
      fileSize: set.canonical.fileSize,
      url: canonicalUpload.url,
      storageKey: canonicalUpload.pathname,
      storageProvider: 'LOCAL',
      bucket: VERCEL_BLOB_BUCKET_MARKER,
      publicUrl: canonicalUpload.url,
    },
  })

  return withOptimizedMeta(mapRow(row), set, (fileName) => uploadedUrls.get(fileName)?.url ?? '')
}

async function persistOptimizedImageToDisk(
  set: OptimizedImageSet,
  id: string,
  displayOriginalName: string,
): Promise<CatalogMediaDto> {
  const dir = resolveCatalogUploadDir()
  for (const file of set.files) {
    const absolutePath = path.join(dir, file.fileName)
    fs.writeFileSync(absolutePath, file.buffer)
    if (!fs.existsSync(absolutePath)) {
      throw new Error('Optimize edilmiş görsel diske yazılamadı')
    }
  }

  const publicUrl = `/uploads/${UPLOAD_SUBDIR}/${set.canonical.fileName}`
  const row = await prisma.catalogMedia.create({
    data: {
      id,
      fileName: set.canonical.fileName,
      originalName: displayOriginalName,
      mimeType: set.canonical.mimeType,
      fileType: 'IMAGE',
      fileSize: set.canonical.fileSize,
      url: publicUrl,
      storageKey: null,
      storageProvider: 'LOCAL',
      bucket: null,
      publicUrl: null,
    },
  })

  return withOptimizedMeta(mapRow(row), set, (fileName) => `/uploads/${UPLOAD_SUBDIR}/${fileName}`)
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

    if (fileType === 'IMAGE') {
      assertRasterImageByteLimit(file)
      const stem = fileName.replace(/\.[^.]+$/, '')
      const prepared = await prepareCatalogImageForStorage(file, stem)
      if (prepared.mode === 'optimized') {
        if (blobStatus.configured) {
          const row = await persistOptimizedImageToVercelBlob(
            prepared.set,
            id,
            displayOriginalName,
            mediaFolder,
          )
          console.info('[catalogMedia] upload', {
            fileType,
            folder: mediaFolder,
            storage: 'vercel-blob',
            optimized: true,
            width: prepared.set.width,
            height: prepared.set.height,
            variants: prepared.set.files.length,
          })
          return row
        }

        if (process.env.NODE_ENV === 'production') {
          assertVercelBlobConfigured()
        }

        console.warn(
          '[catalogMedia] blobConfigured=false; geliştirme modunda optimize IMAGE yerel diske yazılıyor.',
        )
        const row = await persistOptimizedImageToDisk(prepared.set, id, displayOriginalName)
        console.info('[catalogMedia] upload', {
          fileType,
          folder: mediaFolder,
          storage: 'local-disk',
          optimized: true,
          width: prepared.set.width,
          height: prepared.set.height,
        })
        return row
      }
    }

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
          if (isOptimizedFileName(row.fileName)) {
            const parsed = parseOptimizedFileName(row.fileName)
            const siblings = listOptimizedSiblingNames(
              row.fileName,
              [...IMAGE_VARIANT_WIDTHS, parsed?.width ?? 0].filter((width) => width > 0),
              ['jpeg', 'webp', 'avif', 'png'],
            )
            for (const name of siblings) {
              if (name === row.fileName) continue
              try {
                await deleteWebsiteMediaBlob(replacePathFileName(row.storageKey, name))
              } catch {
                // orphan variant
              }
            }
          }
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
