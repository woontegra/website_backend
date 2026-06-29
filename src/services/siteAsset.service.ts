import fs from 'fs'
import path from 'path'
import { isVercelBlobConfigured, assertVercelBlobConfigured } from '../lib/vercelBlob.client'
import { inferContentType } from './r2Upload.service'
import {
  buildWebsiteMediaBlobPath,
  normalizeWebsiteMediaFolder,
  uploadWebsiteMediaBlob,
} from './vercelBlobUpload.service'

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}

export type SiteAssetKind = 'logo' | 'favicon' | 'general'

export type SiteAssetPersistResult = {
  path: string
  storage: 'vercel-blob' | 'r2' | 'frontend-public' | 'backend-uploads'
}

function extensionForMime(mimetype: string): string | null {
  return ALLOWED_MIME[mimetype] ?? null
}

function resolveFrontendPublicDir(): string | null {
  const candidates = [
    path.join(process.cwd(), '..', 'frontend', 'public'),
    path.join(process.cwd(), 'frontend', 'public'),
    path.resolve(__dirname, '..', '..', '..', 'frontend', 'public'),
  ]

  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  return null
}

function resolveBackendBrandingDir(): string {
  const dir = path.join(process.cwd(), 'public', 'uploads', 'branding')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function writeFile(targetPath: string, buffer: Buffer) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, buffer)
}

async function persistSiteAssetToBlob(
  file: Express.Multer.File,
  kind: SiteAssetKind,
  fileName: string,
): Promise<SiteAssetPersistResult> {
  const contentType = file.mimetype || inferContentType(fileName)
  const folder = normalizeWebsiteMediaFolder(kind === 'general' ? 'general' : kind)
  const pathname = buildWebsiteMediaBlobPath(folder, fileName)
  const uploaded = await uploadWebsiteMediaBlob({
    pathname,
    body: file.buffer,
    contentType,
  })
  return { path: uploaded.url, storage: 'vercel-blob' }
}

function persistSiteAssetToDisk(
  file: Express.Multer.File,
  kind: SiteAssetKind,
  fileName: string,
): SiteAssetPersistResult {
  const publicDir = resolveFrontendPublicDir()
  if (publicDir) {
    const absolutePath = path.join(publicDir, fileName)
    writeFile(absolutePath, file.buffer)
    return { path: `/${fileName}`, storage: 'frontend-public' }
  }

  const brandingDir = resolveBackendBrandingDir()
  const absolutePath = path.join(brandingDir, fileName)
  writeFile(absolutePath, file.buffer)
  return { path: `/uploads/branding/${fileName}`, storage: 'backend-uploads' }
}

export async function persistSiteAsset(
  file: Express.Multer.File,
  kind: SiteAssetKind = 'general',
): Promise<SiteAssetPersistResult> {
  const ext = extensionForMime(file.mimetype)
  if (!ext) {
    throw new Error('Desteklenmeyen dosya türü. PNG, JPG, SVG, WEBP veya GIF kullanın.')
  }

  const fileName =
    kind === 'logo' ? `logo-${Date.now()}.${ext}` : kind === 'favicon' ? `favicon-${Date.now()}.${ext}` : `asset-${Date.now()}.${ext}`

  if (isVercelBlobConfigured()) {
    return persistSiteAssetToBlob(file, kind, fileName)
  }

  if (process.env.NODE_ENV === 'production') {
    assertVercelBlobConfigured()
  }

  console.warn(
    '[siteAsset] BLOB_READ_WRITE_TOKEN tanımlı değil; geliştirme modunda dosya yerel diske yazılıyor.',
  )
  return persistSiteAssetToDisk(file, kind, fileName)
}
