import { prisma } from '../lib/prisma'

const PRODUCT_KEY = 'sifre-kasasi'

const FILE_PATHS = {
  setup: '/downloads/woontegra-sifre-kasasi-setup-1.0.0.exe',
  portable: '/downloads/woontegra-sifre-kasasi-portable-1.0.0.exe',
} as const

type DownloadVariant = keyof typeof FILE_PATHS

function getPublicSiteUrl(): string {
  const base =
    process.env.PUBLIC_SITE_URL ||
    process.env.CORS_ORIGIN ||
    (process.env.NODE_ENV !== 'production' ? 'http://localhost:5173' : '')
  return base.replace(/\/$/, '')
}

export const downloadsService = {
  async incrementDownload(productKey: string, variant: DownloadVariant) {
    await prisma.downloadStat.upsert({
      where: {
        productKey_variant: { productKey, variant },
      },
      create: {
        productKey,
        variant,
        count: 1,
      },
      update: {
        count: { increment: 1 },
      },
    })
  },

  async getStats(productKey: string) {
    const rows = await prisma.downloadStat.findMany({
      where: { productKey },
      select: { variant: true, count: true },
    })

    const setup = rows.find((row) => row.variant === 'setup')?.count ?? 0
    const portable = rows.find((row) => row.variant === 'portable')?.count ?? 0

    return {
      total: setup + portable,
      setup,
      portable,
    }
  },

  getRedirectUrl(variant: DownloadVariant): string {
    const filePath = FILE_PATHS[variant]
    const siteUrl = getPublicSiteUrl()
    return siteUrl ? `${siteUrl}${filePath}` : filePath
  },
}

export { PRODUCT_KEY, FILE_PATHS }
