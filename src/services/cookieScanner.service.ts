import { chromium, type Cookie, type Response } from 'playwright'
import { classifyCookieName } from './cookieCatalog.service'
import type { CookieScanReport, CookieSource, PageScanResult, ScannedCookieItem } from '../types/cookie.types'

export const COOKIE_SCAN_PATHS = [
  '/',
  '/hakkimizda',
  '/hizmetler',
  '/cozumler',
  '/ucretsiz-araclar/sifre-kasasi',
  '/blog',
  '/sss',
  '/iletisim',
] as const

const THIRD_PARTY_PATTERNS = [
  /google-analytics\.com/i,
  /googletagmanager\.com/i,
  /googleadservices\.com/i,
  /doubleclick\.net/i,
  /facebook\.com/i,
  /connect\.facebook\.net/i,
  /tiktok\.com/i,
  /analytics\.tiktok\.com/i,
]

type RawFinding = {
  name: string
  domain: string
  path: string
  source: CookieSource
  firstSeenUrl: string
  expiresAt: string | null
  maxAgeSeconds: number | null
  httpOnly: boolean
  secure: boolean
  sameSite: string | null
  session: boolean
  scriptHost?: string
}

function buildUniqueKey(name: string, domain: string, path: string, source: CookieSource): string {
  return `${name}|${domain}|${path}|${source}`
}

function parseSetCookieHeader(header: string): {
  name: string
  maxAgeSeconds: number | null
  expiresAt: string | null
  httpOnly: boolean
  secure: boolean
  sameSite: string | null
  path: string
  domain: string
  session: boolean
} | null {
  const parts = header.split(';').map((p) => p.trim())
  const [nameValue, ...attrs] = parts
  if (!nameValue || !nameValue.includes('=')) return null

  const eq = nameValue.indexOf('=')
  const name = nameValue.slice(0, eq).trim()
  if (!name) return null

  let maxAgeSeconds: number | null = null
  let expiresAt: string | null = null
  let httpOnly = false
  let secure = false
  let sameSite: string | null = null
  let path = '/'
  let domain = ''

  for (const attr of attrs) {
    const lower = attr.toLowerCase()
    if (lower === 'httponly') {
      httpOnly = true
      continue
    }
    if (lower === 'secure') {
      secure = true
      continue
    }
    if (lower.startsWith('max-age=')) {
      const value = Number(attr.split('=')[1])
      maxAgeSeconds = Number.isFinite(value) ? value : null
      continue
    }
    if (lower.startsWith('expires=')) {
      const date = new Date(attr.slice('expires='.length))
      expiresAt = Number.isNaN(date.getTime()) ? null : date.toISOString()
      continue
    }
    if (lower.startsWith('path=')) {
      path = attr.slice(5).trim() || '/'
      continue
    }
    if (lower.startsWith('domain=')) {
      domain = attr.slice(7).trim()
      continue
    }
    if (lower.startsWith('samesite=')) {
      sameSite = attr.slice('samesite='.length).trim()
    }
  }

  const session = maxAgeSeconds === null && expiresAt === null

  return {
    name,
    maxAgeSeconds,
    expiresAt,
    httpOnly,
    secure,
    sameSite,
    path,
    domain,
    session,
  }
}

function formatDuration(
  expiresAt: string | null,
  maxAgeSeconds: number | null,
  session: boolean,
): string {
  if (session) return 'Oturum süresince'

  if (maxAgeSeconds != null && maxAgeSeconds > 0) {
    if (maxAgeSeconds < 3600) {
      const minutes = Math.round(maxAgeSeconds / 60)
      return `${minutes} dakika`
    }
    if (maxAgeSeconds < 86400) {
      const hours = Math.round(maxAgeSeconds / 3600)
      return `${hours} saat`
    }
    const days = Math.round(maxAgeSeconds / 86400)
    return `${days} gün`
  }

  if (expiresAt) {
    const diffMs = new Date(expiresAt).getTime() - Date.now()
    if (diffMs <= 0) return 'Belirsiz'
    const diffDays = Math.round(diffMs / 86400000)
    if (diffDays < 1) {
      const hours = Math.round(diffMs / 3600000)
      return `${hours} saat`
    }
    return `${diffDays} gün`
  }

  return 'Belirsiz'
}

function cookieToFinding(
  cookie: Cookie,
  source: CookieSource,
  firstSeenUrl: string,
  scriptHost?: string,
): RawFinding {
  const session = cookie.expires === -1
  const expiresAt =
    cookie.expires > 0 ? new Date(cookie.expires * 1000).toISOString() : null

  return {
    name: cookie.name,
    domain: cookie.domain,
    path: cookie.path || '/',
    source,
    firstSeenUrl,
    expiresAt,
    maxAgeSeconds: null,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite ?? null,
    session,
    scriptHost,
  }
}

function upsertFinding(map: Map<string, RawFinding>, finding: RawFinding): void {
  const key = buildUniqueKey(finding.name, finding.domain, finding.path, finding.source)
  const existing = map.get(key)
  if (!existing) {
    map.set(key, finding)
    return
  }

  if (!existing.expiresAt && finding.expiresAt) existing.expiresAt = finding.expiresAt
  if (existing.maxAgeSeconds == null && finding.maxAgeSeconds != null) {
    existing.maxAgeSeconds = finding.maxAgeSeconds
  }
  if (!existing.httpOnly && finding.httpOnly) existing.httpOnly = true
  if (!existing.secure && finding.secure) existing.secure = true
  if (!existing.sameSite && finding.sameSite) existing.sameSite = finding.sameSite
}

function finalizeFindings(map: Map<string, RawFinding>): ScannedCookieItem[] {
  const items: ScannedCookieItem[] = []

  for (const raw of map.values()) {
    const catalog = classifyCookieName(raw.name, raw.domain, raw.scriptHost ?? '')
    const duration = formatDuration(raw.expiresAt, raw.maxAgeSeconds, raw.session)

    items.push({
      name: raw.name,
      domain: raw.domain,
      path: raw.path,
      provider: catalog.provider,
      category: catalog.category,
      purpose: catalog.purpose,
      duration,
      expiresAt: raw.expiresAt,
      maxAgeSeconds: raw.maxAgeSeconds,
      source: raw.source,
      firstSeenUrl: raw.firstSeenUrl,
      httpOnly: raw.httpOnly,
      secure: raw.secure,
      sameSite: raw.sameSite,
    })
  }

  items.sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  return items
}

function resolveBaseUrl(): string {
  const fromEnv = process.env.COOKIE_SCAN_BASE_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return 'https://woontegra.com'
}

export async function runCookieScan(baseUrlInput?: string): Promise<CookieScanReport> {
  const baseUrl = (baseUrlInput?.trim() || resolveBaseUrl()).replace(/\/$/, '')
  const findings = new Map<string, RawFinding>()
  const pages: PageScanResult[] = []
  const scriptSources = new Set<string>()
  const thirdPartyHosts = new Set<string>()

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 WoontegraCookieScanner/1.0',
  })

  await context.addInitScript({
    content: `localStorage.setItem('woontegra_cookie_consent', JSON.stringify({
      necessary: true,
      analytics: true,
      marketing: true,
      functional: true,
      updatedAt: new Date().toISOString()
    }));`,
  })

  for (const path of COOKIE_SCAN_PATHS) {
    const url = `${baseUrl}${path}`
    const page = await context.newPage()

    page.on('response', (response: Response) => {
      const responseUrl = response.url()
      try {
        const host = new URL(responseUrl).hostname
        if (THIRD_PARTY_PATTERNS.some((p) => p.test(host))) {
          thirdPartyHosts.add(host)
        }
      } catch {
        /* ignore invalid URL */
      }

      const headers = response.headers()
      const setCookie = headers['set-cookie']
      if (!setCookie) return

      const headerList = Array.isArray(setCookie) ? setCookie : [setCookie]
      for (const header of headerList) {
        const parsed = parseSetCookieHeader(header)
        if (!parsed) continue

        upsertFinding(findings, {
          name: parsed.name,
          domain: parsed.domain || new URL(url).hostname,
          path: parsed.path,
          source: 'set-cookie',
          firstSeenUrl: url,
          expiresAt: parsed.expiresAt,
          maxAgeSeconds: parsed.maxAgeSeconds,
          httpOnly: parsed.httpOnly,
          secure: parsed.secure,
          sameSite: parsed.sameSite,
          session: parsed.session,
        })
      }
    })

    try {
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      })

      const statusCode = response?.status() ?? 0
      if (!response || statusCode >= 400) {
        pages.push({
          path,
          url,
          status: 'unreachable',
          statusCode: statusCode || undefined,
          error: statusCode ? `HTTP ${statusCode}` : 'Sayfa yüklenemedi',
        })
        await page.close()
        continue
      }

      await page.waitForTimeout(2500)

      const browserCookies = await context.cookies(url)
      for (const cookie of browserCookies) {
        upsertFinding(findings, cookieToFinding(cookie, 'cookie', url))
      }

      const docCookieNames = (await page.evaluate(
        `document.cookie ? document.cookie.split(';').map((part) => part.trim().split('=')[0]).filter(Boolean) : []`,
      )) as string[]

      const pageHost = new URL(url).hostname
      for (const name of docCookieNames) {
        const match = browserCookies.find((c) => c.name === name)
        if (match) {
          upsertFinding(findings, cookieToFinding(match, 'cookie', url))
        } else {
          upsertFinding(findings, {
            name,
            domain: pageHost,
            path: '/',
            source: 'cookie',
            firstSeenUrl: url,
            expiresAt: null,
            maxAgeSeconds: null,
            httpOnly: false,
            secure: false,
            sameSite: null,
            session: true,
          })
        }
      }

      const storageItems = (await page.evaluate(`(() => {
        const local = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (key) local.push({ key, value: localStorage.getItem(key) || '' });
        }
        const session = [];
        for (let j = 0; j < sessionStorage.length; j += 1) {
          const key = sessionStorage.key(j);
          if (key) session.push({ key, value: sessionStorage.getItem(key) || '' });
        }
        return { local, session };
      })()`)) as { local: Array<{ key: string; value: string }>; session: Array<{ key: string; value: string }> }

      for (const item of storageItems.local) {
        upsertFinding(findings, {
          name: item.key,
          domain: pageHost,
          path: '/',
          source: 'localStorage',
          firstSeenUrl: url,
          expiresAt: null,
          maxAgeSeconds: null,
          httpOnly: false,
          secure: false,
          sameSite: null,
          session: false,
        })
      }

      for (const item of storageItems.session) {
        upsertFinding(findings, {
          name: item.key,
          domain: pageHost,
          path: '/',
          source: 'sessionStorage',
          firstSeenUrl: url,
          expiresAt: null,
          maxAgeSeconds: null,
          httpOnly: false,
          secure: false,
          sameSite: null,
          session: true,
        })
      }

      const scripts = (await page.evaluate(
        `Array.from(document.scripts).map((script) => script.src).filter(Boolean)`,
      )) as string[]

      for (const src of scripts) {
        scriptSources.add(src)
        try {
          const host = new URL(src).hostname
          if (THIRD_PARTY_PATTERNS.some((p) => p.test(host))) {
            thirdPartyHosts.add(host)
          }
        } catch {
          /* ignore */
        }
      }

      pages.push({ path, url, status: 'ok', statusCode })
    } catch (error) {
      pages.push({
        path,
        url,
        status: 'unreachable',
        error: error instanceof Error ? error.message : 'Bilinmeyen hata',
      })
    } finally {
      await page.close()
    }
  }

  await browser.close()

  return {
    scannedAt: new Date().toISOString(),
    baseUrl,
    pages,
    cookies: finalizeFindings(findings),
    scriptSources: Array.from(scriptSources).sort(),
    thirdPartyHosts: Array.from(thirdPartyHosts).sort(),
  }
}
