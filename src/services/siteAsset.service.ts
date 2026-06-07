import fs from 'fs'
import path from 'path'

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}

export type SiteAssetKind = 'logo' | 'favicon' | 'general'

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

export async function persistSiteAsset(
  file: Express.Multer.File,
  kind: SiteAssetKind = 'general',
): Promise<{ path: string; storage: 'frontend-public' | 'backend-uploads' }> {
  const ext = extensionForMime(file.mimetype)
  if (!ext) {
    throw new Error('Desteklenmeyen dosya türü. PNG, JPG, SVG, WEBP veya GIF kullanın.')
  }

  const fileName =
    kind === 'logo' ? `logo.${ext}` : kind === 'favicon' ? `favicon.${ext}` : `asset-${Date.now()}.${ext}`

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
