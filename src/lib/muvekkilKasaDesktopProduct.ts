import { PRODUCT_CODE_MUVEKKIL_KASA_DESKTOP } from './productCode'
import { parseProductDownloadFiles, type PublicProductDownloadFile } from './productDownloadFiles'

const MK_DESKTOP_SLUGS = new Set([
  'muvekkil-kasa-defteri-yazilimi',
  'muvekkil-kasa-defteri-desktop',
])

export type MuvekkilKasaDesktopProductRef = {
  slug?: string | null
  licenseAppCode?: string | null
  licenseRequired?: boolean | null
  productType?: string | null
}

export function isMuvekkilKasaDesktopSalesProduct(
  product: Pick<MuvekkilKasaDesktopProductRef, 'slug' | 'licenseAppCode'> | null | undefined,
): boolean {
  if (!product) return false
  const appCode = product.licenseAppCode?.trim()
  if (appCode === PRODUCT_CODE_MUVEKKIL_KASA_DESKTOP) return true
  const slug = product.slug?.trim().toLowerCase()
  return Boolean(slug && MK_DESKTOP_SLUGS.has(slug))
}

export function isMuvekkilKasaDesktopCentralLicenseProduct(
  product: MuvekkilKasaDesktopProductRef | null | undefined,
): boolean {
  if (!product) return false
  if (product.licenseRequired !== true) return false
  return isMuvekkilKasaDesktopSalesProduct(product)
}

export const MUVEKKIL_KASA_DESKTOP_PRODUCT_SLUG = 'muvekkil-kasa-defteri-yazilimi'

export function mkDesktopProductPath(): string {
  return `/yazilimlar/${MUVEKKIL_KASA_DESKTOP_PRODUCT_SLUG}`
}

function filenameFromUrl(url: string): string {
  try {
    const name = decodeURIComponent(new URL(url.trim()).pathname.split('/').pop() || '').trim()
    return name || 'download.exe'
  } catch {
    return 'download.exe'
  }
}

/** Auto-update feed / blockmap — public installer değildir. */
export function isAutoUpdateDistributionUrl(url: string | null | undefined): boolean {
  const raw = (url ?? '').trim()
  if (!raw) return false
  const lower = raw.toLowerCase()
  if (lower.includes('/updates/')) return true
  const name = filenameFromUrl(raw).toLowerCase()
  if (name === 'latest.yml' || name === 'latest-mac.yml' || name === 'latest-linux.yml') return true
  if (name.endsWith('.blockmap')) return true
  return false
}

/** Admin paneli Kurulum sürümü: yalnızca public https Windows .exe. */
export function isPublicWindowsSetupInstallerUrl(url: string | null | undefined): boolean {
  const raw = (url ?? '').trim()
  if (!raw) return false
  if (isAutoUpdateDistributionUrl(raw)) return false
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'https:') return false
    return filenameFromUrl(raw).toLowerCase().endsWith('.exe')
  } catch {
    return false
  }
}

/**
 * Public ürün API’sine konan Müvekkil Kasa Desktop trial installer.
 * Kaynak: admin Product.downloadFiles files[].url (type=setup).
 * Auto-update R2 / latest.yml / blockmap / KoopPlus URL’si kullanılmaz.
 */
export function publicMuvekkilKasaDesktopInstallerFiles(product: {
  slug?: string | null
  licenseAppCode?: string | null
  downloadFiles?: unknown
}): PublicProductDownloadFile[] {
  if (!isMuvekkilKasaDesktopSalesProduct(product)) return []
  const setup = parseProductDownloadFiles(product.downloadFiles).files.find(
    (file) => file.type === 'setup' && isPublicWindowsSetupInstallerUrl(file.url),
  )
  if (!setup) return []
  const href = setup.url.trim()
  return [
    {
      label: setup.label,
      downloadPath: href,
      filename: filenameFromUrl(href),
      version: setup.version,
      size: setup.size,
      type: 'setup',
      buttonLabel: setup.buttonLabel?.trim() || setup.label,
    },
  ]
}
