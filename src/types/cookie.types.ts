export type CookieSource = 'cookie' | 'set-cookie' | 'localStorage' | 'sessionStorage'

export type CookieCategory = 'necessary' | 'analytics' | 'marketing' | 'functional' | 'unknown'

export type ScannedCookieItem = {
  name: string
  domain: string
  path: string
  provider: string
  category: CookieCategory
  purpose: string
  duration: string
  expiresAt: string | null
  maxAgeSeconds: number | null
  source: CookieSource
  firstSeenUrl: string
  httpOnly: boolean
  secure: boolean
  sameSite: string | null
}

export type PageScanResult = {
  path: string
  url: string
  status: 'ok' | 'unreachable'
  statusCode?: number
  error?: string
}

export type CookieScanReport = {
  scannedAt: string
  baseUrl: string
  pages: PageScanResult[]
  cookies: ScannedCookieItem[]
  scriptSources: string[]
  thirdPartyHosts: string[]
}

export type PublicCookieItem = {
  name: string
  provider: string
  category: CookieCategory
  purpose: string
  duration: string
  domain: string
  source: CookieSource
}

export type PublicCookiesResponse = {
  lastScannedAt: string | null
  cookies: PublicCookieItem[]
}
