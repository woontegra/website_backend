import { prisma } from '../lib/prisma'
import { ADMIN_TRACKED_DOWNLOAD_PRODUCTS } from '../lib/downloadStatsCatalog'

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

  async listAdminDownloadStats() {
    const productKeys = [
      ...new Set([
        ...ADMIN_TRACKED_DOWNLOAD_PRODUCTS.map((item) => item.productKey),
        ...(await prisma.downloadStat.findMany({ distinct: ['productKey'], select: { productKey: true } })).map(
          (row) => row.productKey,
        ),
      ]),
    ]

    const statRows = await prisma.downloadStat.findMany({
      where: { productKey: { in: productKeys } },
      select: { productKey: true, variant: true, count: true, updatedAt: true },
    })

    const slugs = ADMIN_TRACKED_DOWNLOAD_PRODUCTS.map((item) => item.slug)
    const products = await prisma.product.findMany({
      where: { slug: { in: slugs } },
      select: { slug: true, isActive: true },
    })
    const activeBySlug = new Map(products.map((p) => [p.slug, p.isActive]))

    return productKeys.map((productKey) => {
      const catalog = ADMIN_TRACKED_DOWNLOAD_PRODUCTS.find((item) => item.productKey === productKey)
      const rows = statRows.filter((row) => row.productKey === productKey)
      const setup = rows.find((row) => row.variant === 'setup')?.count ?? 0
      const portable = rows.find((row) => row.variant === 'portable')?.count ?? 0
      const lastUpdatedAt =
        rows.length > 0
          ? rows.reduce((max, row) => (row.updatedAt > max ? row.updatedAt : max), rows[0].updatedAt)
          : null

      const slug = catalog?.slug ?? productKey
      const isActive = activeBySlug.get(slug)

      return {
        productKey,
        name: catalog?.name ?? productKey,
        slug,
        publicPath: catalog?.publicPath ?? `/yazilimlar/${slug}`,
        freeSetupPath: catalog?.freeSetupPath ?? `/api/downloads/free/${slug}/setup`,
        freePortablePath: catalog?.freePortablePath ?? `/api/downloads/free/${slug}/portable`,
        total: setup + portable,
        setup,
        portable,
        lastUpdatedAt: lastUpdatedAt?.toISOString() ?? null,
        downloadsToday: null,
        downloadsThisMonth: null,
        status: isActive === true ? 'active' : isActive === false ? 'inactive' : 'unknown',
      }
    })
  },
}

export { PRODUCT_KEY, RELEASE_URLS }
