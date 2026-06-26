import { Prisma } from '@prisma/client'
import { isDeliverableDownloadRawUrl } from './mailDeliveryUrl'

export type ProductDownloadFile = {
  label: string
  url: string
  version?: string
  size?: string
  type?: 'setup' | 'portable' | 'other'
  sha256?: string
  buttonLabel?: string
}

export type ProductDownloadFilesConfig = {
  version?: string
  publicFreeDownload?: boolean
  showAfterPaymentOnly?: boolean
  files: ProductDownloadFile[]
}

export type PublicProductDownloadFile = {
  label: string
  downloadPath: string
  filename: string
  version?: string
  size?: string
  type?: 'setup' | 'portable' | 'other'
  buttonLabel?: string
}

function parseFile(raw: unknown): ProductDownloadFile | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const typeRaw = row.type
  const type =
    typeRaw === 'setup' || typeRaw === 'portable' || typeRaw === 'other' ? typeRaw : undefined
  const label =
    typeof row.label === 'string' && row.label.trim()
      ? row.label.trim()
      : type === 'setup'
        ? 'Kurulum Sürümü'
        : type === 'portable'
          ? 'Portable Sürüm'
          : ''
  const url = typeof row.url === 'string' ? row.url.trim() : ''
  if (!label || !url) return null
  return {
    label,
    url,
    version: typeof row.version === 'string' ? row.version.trim() || undefined : undefined,
    size: typeof row.size === 'string' ? row.size.trim() || undefined : undefined,
    type,
    sha256: typeof row.sha256 === 'string' ? row.sha256.trim() || undefined : undefined,
    buttonLabel: typeof row.buttonLabel === 'string' ? row.buttonLabel.trim() || undefined : undefined,
  }
}

export function parseProductDownloadFiles(raw: unknown): ProductDownloadFilesConfig {
  if (!raw || typeof raw !== 'object') return { files: [] }
  const row = raw as Record<string, unknown>
  const files = Array.isArray(row.files)
    ? row.files.map(parseFile).filter((f): f is ProductDownloadFile => f !== null)
    : []
  return {
    version: typeof row.version === 'string' ? row.version.trim() || undefined : undefined,
    publicFreeDownload: row.publicFreeDownload === true,
    showAfterPaymentOnly: row.showAfterPaymentOnly !== false,
    files,
  }
}

export function hasValidDownloadFiles(raw: unknown): boolean {
  const config = parseProductDownloadFiles(raw)
  return config.files.some((f) => f.url.trim() && isDeliverableDownloadRawUrl(f.url))
}

export function normalizeProductDownloadFilesForDb(
  raw: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (raw === null || raw === undefined) return Prisma.DbNull
  const config = parseProductDownloadFiles(raw)
  const filesWithUrl = config.files.filter((f) => f.url.trim())
  if (filesWithUrl.length === 0 && !config.version) return Prisma.DbNull
  for (const f of filesWithUrl) {
    if (!isDeliverableDownloadRawUrl(f.url)) {
      throw new Error(`Geçersiz R2 indirme URL: ${f.label || f.url}`)
    }
  }
  return {
    version: config.version ?? null,
    publicFreeDownload: config.publicFreeDownload !== false,
    showAfterPaymentOnly: config.showAfterPaymentOnly !== false,
    files: filesWithUrl.map((f) => ({
      label: f.label,
      url: f.url.trim(),
      version: f.version ?? null,
      size: f.size ?? null,
      type: f.type ?? null,
      sha256: f.sha256 ?? null,
      buttonLabel: f.buttonLabel ?? null,
    })),
  }
}

export function sanitizePublicDownloadFiles(
  productSlug: string,
  files: ProductDownloadFile[],
): PublicProductDownloadFile[] {
  const slug = productSlug.trim()
  return files
    .filter((f) => f.url.trim() && (f.type === 'setup' || f.type === 'portable'))
    .map((f) => ({
      label: f.label,
      downloadPath: `/api/downloads/free/${slug}/${f.type}`,
      filename: filenameFromPublicUrl(f.url),
      version: f.version,
      size: f.size,
      type: f.type,
      buttonLabel: f.buttonLabel?.trim() || f.label,
    }))
}

function filenameFromPublicUrl(url: string): string {
  try {
    const name = new URL(url.trim()).pathname.split('/').pop()?.trim()
    return name && name.length > 0 ? name : 'download.exe'
  } catch {
    return 'download.exe'
  }
}

export function isPublicFreeDownloadProduct(row: {
  productType: string
  purchaseEnabled: boolean
  price: Prisma.Decimal | number
}): boolean {
  const price = typeof row.price === 'number' ? row.price : Number(row.price)
  return row.productType === 'DOWNLOAD' && !row.purchaseEnabled && Number.isFinite(price) && price <= 0
}
