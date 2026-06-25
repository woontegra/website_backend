import fs from 'fs'
import path from 'path'
import {
  isR2PublicUploadConfigured,
  getR2ConfigStatus,
  assertR2PublicUploadConfigured,
} from '../lib/r2.client'
import {
  buildBrandingObjectKey,
  inferContentType,
  uploadPublicObject,
} from './r2Upload.service'

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
  storage: 'r2' | 'frontend-public' | 'backend-uploads'
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

async function persistSiteAssetToR2(
  file: Express.Multer.File,
  kind: SiteAssetKind,
  fileName: string,
): Promise<SiteAssetPersistResult> {
  const contentType = file.mimetype || inferContentType(fileName)
  const objectKey = buildBrandingObjectKey(kind, fileName)
  const uploaded = await uploadPublicObject({
    objectKey,
    body: file.buffer,
    contentType,
  })
  return { path: uploaded.publicUrl, storage: 'r2' }
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
    kind === 'logo' ? `logo.${ext}` : kind === 'favicon' ? `favicon.${ext}` : `asset-${Date.now()}.${ext}`

  const r2Status = getR2ConfigStatus()
  if (r2Status.partiallyConfigured) {
    assertR2PublicUploadConfigured()
  }

  if (isR2PublicUploadConfigured()) {
    return persistSiteAssetToR2(file, kind, fileName)
  }

  if (process.env.NODE_ENV === 'production') {
    assertR2PublicUploadConfigured()
  }

  console.warn(
    '[siteAsset] R2 public upload env tanımlı değil; geliştirme modunda dosya yerel diske yazılıyor.',
  )
  return persistSiteAssetToDisk(file, kind, fileName)
}
