import { prisma } from '../lib/prisma'

const PRODUCT_KEY = 'sifre-kasasi'

const RELEASE_URLS = {
  setup:
    'https://github.com/woontegra/website_frontend/releases/download/sifre-kasasi-v1.0.0/woontegra-sifre-kasasi-setup-1.0.0.exe',
  portable:
    'https://github.com/woontegra/website_frontend/releases/download/sifre-kasasi-v1.0.0/woontegra-sifre-kasasi-portable-1.0.0.exe',
} as const

type DownloadVariant = keyof typeof RELEASE_URLS

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
    return RELEASE_URLS[variant]
  },
}

export { PRODUCT_KEY, RELEASE_URLS }
