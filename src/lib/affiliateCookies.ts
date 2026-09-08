import type { Request, Response } from 'express'
import { AFFILIATE_PARTNER_SESSION_COOKIE } from './affiliatePartners'
import {
  AFFILIATE_REFERRAL_COOKIE_NAME,
  getAffiliateAttributionMaxAgeMs,
} from './affiliateSiteOrigin'

const CODE_RE = /^[A-Za-z0-9_-]{8,64}$/

export function isValidReferralCodeFormat(code: string): boolean {
  return typeof code === 'string' && CODE_RE.test(code)
}

export function parseRequestCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie
  if (!header || typeof header !== 'string') return {}
  const out: Record<string, string> = {}
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx <= 0) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (!key) continue
    try {
      out[key] = decodeURIComponent(value)
    } catch {
      out[key] = value
    }
  }
  return out
}

export function readReferralCodeFromRequest(req: Request): string | null {
  const raw = parseRequestCookies(req)[AFFILIATE_REFERRAL_COOKIE_NAME]
  if (typeof raw !== 'string') return null
  const code = raw.trim()
  return isValidReferralCodeFormat(code) ? code : null
}

export function setReferralCookie(res: Response, code: string) {
  const secure = process.env.NODE_ENV === 'production'
  const maxAge = Math.floor(getAffiliateAttributionMaxAgeMs() / 1000)
  const parts = [
    `${AFFILIATE_REFERRAL_COOKIE_NAME}=${encodeURIComponent(code)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ]
  if (secure) parts.push('Secure')
  res.append('Set-Cookie', parts.join('; '))
}

export function clearReferralCookie(res: Response) {
  const secure = process.env.NODE_ENV === 'production'
  const parts = [
    `${AFFILIATE_REFERRAL_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ]
  if (secure) parts.push('Secure')
  res.append('Set-Cookie', parts.join('; '))
}

/**
 * Bilirkişi `partnerSessionCookieOptions(expiresAt)` ile aynı mantık:
 * HttpOnly + SameSite=Lax + Path=/ + mutlak Expires (oturum TTL’si; magic link TTL değil).
 */
export function partnerSessionCookieOptions(expiresAt: Date) {
  const secure = process.env.NODE_ENV === 'production'
  const expires = expiresAt instanceof Date ? expiresAt : new Date(expiresAt)
  const maxAgeSec = Math.max(0, Math.floor((expires.getTime() - Date.now()) / 1000))
  return {
    httpOnly: true as const,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    expires,
    maxAgeSec,
  }
}

export function buildPartnerSessionSetCookieHeader(rawSessionToken: string, expiresAt: Date): string {
  const opts = partnerSessionCookieOptions(expiresAt)
  const parts = [
    `${AFFILIATE_PARTNER_SESSION_COOKIE}=${encodeURIComponent(rawSessionToken)}`,
    `Path=${opts.path}`,
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${opts.maxAgeSec}`,
    `Expires=${opts.expires.toUTCString()}`,
  ]
  if (opts.secure) parts.push('Secure')
  return parts.join('; ')
}

export function setPartnerSessionCookie(res: Response, rawSessionToken: string, expiresAt: Date) {
  res.append('Set-Cookie', buildPartnerSessionSetCookieHeader(rawSessionToken, expiresAt))
}

export function clearPartnerSessionCookie(res: Response) {
  const secure = process.env.NODE_ENV === 'production'
  const parts = [
    `${AFFILIATE_PARTNER_SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ]
  if (secure) parts.push('Secure')
  res.append('Set-Cookie', parts.join('; '))
}

export function readPartnerSessionToken(req: Request): string | null {
  const raw = parseRequestCookies(req)[AFFILIATE_PARTNER_SESSION_COOKIE]
  return raw?.trim() || null
}
