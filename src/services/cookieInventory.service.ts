import { PrismaClient } from '@prisma/client'
import { runCookieScan } from './cookieScanner.service'
import type { CookieSource, PublicCookieItem, PublicCookiesResponse, ScannedCookieItem } from '../types/cookie.types'

const prisma = new PrismaClient()

function buildUniqueKey(name: string, domain: string, path: string, source: CookieSource): string {
  return `${name}|${domain}|${path}|${source}`
}

function toPublicItem(item: {
  name: string
  domain: string
  source: string
  provider: string
  category: string
  purpose: string
  duration: string
  adminProvider: string | null
  adminCategory: string | null
  adminPurpose: string | null
  adminDurationLabel: string | null
}): PublicCookieItem {
  return {
    name: item.name,
    domain: item.domain,
    source: item.source as CookieSource,
    provider: item.adminProvider?.trim() || item.provider,
    category: (item.adminCategory?.trim() || item.category) as PublicCookieItem['category'],
    purpose: item.adminPurpose?.trim() || item.purpose,
    duration: item.adminDurationLabel?.trim() || item.duration,
  }
}

export const cookieInventoryService = {
  async getLatestScanRun() {
    return prisma.cookieScanRun.findFirst({
      orderBy: { scannedAt: 'desc' },
    })
  },

  async getInventory() {
    return prisma.cookieInventoryItem.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    })
  },

  async getPublicCookies(): Promise<PublicCookiesResponse> {
    const [latestRun, items] = await Promise.all([
      this.getLatestScanRun(),
      this.getInventory(),
    ])

    return {
      lastScannedAt: latestRun?.scannedAt.toISOString() ?? null,
      cookies: items.map(toPublicItem),
    }
  },

  async getAdminDashboard() {
    const [latestRun, items] = await Promise.all([
      this.getLatestScanRun(),
      this.getInventory(),
    ])

    const categoryCounts: Record<string, number> = {}
    for (const item of items) {
      const category = item.adminCategory?.trim() || item.category
      categoryCounts[category] = (categoryCounts[category] ?? 0) + 1
    }

    let pageResults: unknown[] = []
    if (latestRun?.pageResults) {
      try {
        pageResults = JSON.parse(latestRun.pageResults) as unknown[]
      } catch {
        pageResults = []
      }
    }

    return {
      lastScannedAt: latestRun?.scannedAt.toISOString() ?? null,
      scanStatus: latestRun?.status ?? null,
      baseUrl: latestRun?.baseUrl ?? null,
      pagesTotal: latestRun?.pagesTotal ?? 0,
      pagesOk: latestRun?.pagesOk ?? 0,
      pagesFailed: latestRun?.pagesFailed ?? 0,
      pageResults,
      totalCookies: items.length,
      categoryCounts,
      cookies: items,
    }
  },

  async runScan(baseUrl?: string) {
    const report = await runCookieScan(baseUrl)
    const pagesOk = report.pages.filter((p) => p.status === 'ok').length
    const pagesFailed = report.pages.length - pagesOk

    const run = await prisma.cookieScanRun.create({
      data: {
        baseUrl: report.baseUrl,
        status: 'completed',
        pagesTotal: report.pages.length,
        pagesOk,
        pagesFailed,
        pageResults: JSON.stringify(report.pages),
      },
    })

    await this.mergeScannedItems(report.cookies)

    return {
      runId: run.id,
      scannedAt: run.scannedAt.toISOString(),
      report,
    }
  },

  async mergeScannedItems(cookies: ScannedCookieItem[]) {
    for (const cookie of cookies) {
      const uniqueKey = buildUniqueKey(cookie.name, cookie.domain, cookie.path, cookie.source)

      await prisma.cookieInventoryItem.upsert({
        where: { uniqueKey },
        create: {
          uniqueKey,
          name: cookie.name,
          domain: cookie.domain,
          path: cookie.path,
          provider: cookie.provider,
          category: cookie.category,
          purpose: cookie.purpose,
          duration: cookie.duration,
          expiresAt: cookie.expiresAt,
          maxAgeSeconds: cookie.maxAgeSeconds,
          source: cookie.source,
          firstSeenUrl: cookie.firstSeenUrl,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: cookie.sameSite,
          lastSeenAt: new Date(),
        },
        update: {
          provider: cookie.provider,
          category: cookie.category,
          purpose: cookie.purpose,
          duration: cookie.duration,
          expiresAt: cookie.expiresAt,
          maxAgeSeconds: cookie.maxAgeSeconds,
          firstSeenUrl: cookie.firstSeenUrl,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: cookie.sameSite,
          lastSeenAt: new Date(),
        },
      })
    }
  },

  async updateItem(
    id: string,
    data: {
      adminProvider?: string | null
      adminCategory?: string | null
      adminPurpose?: string | null
      adminDurationLabel?: string | null
    },
  ) {
    return prisma.cookieInventoryItem.update({
      where: { id },
      data: {
        adminProvider: data.adminProvider ?? undefined,
        adminCategory: data.adminCategory ?? undefined,
        adminPurpose: data.adminPurpose ?? undefined,
        adminDurationLabel: data.adminDurationLabel ?? undefined,
      },
    })
  },
}
