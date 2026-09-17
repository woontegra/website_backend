import {
  bhUpstreamFetch,
  bhUpstreamRemoteAuthLogin,
} from './bhWebapi.client'
import { isBhRemoteReadAllowed } from '../lib/assertSafeBhUpstream'

type Cache = { token: string; expiresAt: number }

let localCache: Cache | null = null
let remoteCache: Cache | null = null

function readLocalCreds(): { email: string; password: string } | null {
  const email = (process.env.BH_ADMIN_EMAIL || '').trim()
  const password = (process.env.BH_ADMIN_PASSWORD || '').trim()
  if (!email || !password) return null
  return { email, password }
}

function readRemoteCreds(): { email: string; password: string } | null {
  const email = (
    process.env.BH_REMOTE_ADMIN_EMAIL ||
    process.env.BH_ADMIN_EMAIL ||
    ''
  ).trim()
  const password = (
    process.env.BH_REMOTE_ADMIN_PASSWORD ||
    process.env.BH_ADMIN_PASSWORD ||
    ''
  ).trim()
  if (!email || !password) return null
  return { email, password }
}

function extractToken(data: unknown): string {
  const body = data as {
    token?: string
    accessToken?: string
    success?: boolean
    data?: { token?: string; accessToken?: string }
  }
  const nested = body?.data && typeof body.data === 'object' ? body.data : body
  return String(nested?.accessToken || nested?.token || '').trim()
}

/**
 * Service-account login to local BH webapi admin APIs.
 * Credentials stay server-side only (never sent to FE).
 */
export async function getBhAdminAuthorization(): Promise<
  { ok: true; authorization: string } | { ok: false; status: number; error: string }
> {
  const creds = readLocalCreds()
  if (!creds) {
    return {
      ok: false,
      status: 503,
      error:
        'BH admin kimlik bilgileri yapılandırılmamış (BH_ADMIN_EMAIL / BH_ADMIN_PASSWORD).',
    }
  }

  const now = Date.now()
  if (localCache && localCache.expiresAt > now + 60_000) {
    return { ok: true, authorization: `Bearer ${localCache.token}` }
  }

  const login = await bhUpstreamFetch('POST', '/api/auth/login', {
    email: creds.email,
    password: creds.password,
  })
  if (!login.ok) {
    return {
      ok: false,
      status: login.status || 502,
      error: login.error || 'BH admin girişi başarısız.',
    }
  }

  const token = extractToken(login.data)
  if (!token) {
    return { ok: false, status: 502, error: 'BH admin token alınamadı.' }
  }

  localCache = { token, expiresAt: now + 12 * 60 * 60 * 1000 }
  return { ok: true, authorization: `Bearer ${token}` }
}

/**
 * Development opt-in auth for remote BH read-only GETs.
 * Prefers BH_REMOTE_ADMIN_TOKEN; else remote/local admin email+password login.
 */
export async function getBhRemoteAdminAuthorization(): Promise<
  { ok: true; authorization: string } | { ok: false; status: number; error: string }
> {
  if (!isBhRemoteReadAllowed()) {
    return {
      ok: false,
      status: 503,
      error: 'BH remote read kapalı (BH_ALLOW_REMOTE_READ).',
    }
  }

  const staticToken = (process.env.BH_REMOTE_ADMIN_TOKEN || '').trim()
  if (staticToken) {
    return { ok: true, authorization: `Bearer ${staticToken}` }
  }

  const creds = readRemoteCreds()
  if (!creds) {
    return {
      ok: false,
      status: 503,
      error:
        'BH remote admin kimlik bilgileri yapılandırılmamış (BH_REMOTE_ADMIN_TOKEN veya BH_REMOTE_ADMIN_EMAIL / BH_REMOTE_ADMIN_PASSWORD).',
    }
  }

  const now = Date.now()
  if (remoteCache && remoteCache.expiresAt > now + 60_000) {
    return { ok: true, authorization: `Bearer ${remoteCache.token}` }
  }

  const login = await bhUpstreamRemoteAuthLogin({
    email: creds.email,
    password: creds.password,
  })
  if (!login.ok) {
    return {
      ok: false,
      status: login.status || 502,
      error: login.error || 'BH remote admin girişi başarısız.',
    }
  }

  const token = extractToken(login.data)
  if (!token) {
    return { ok: false, status: 502, error: 'BH remote admin token alınamadı.' }
  }

  remoteCache = { token, expiresAt: now + 12 * 60 * 60 * 1000 }
  return { ok: true, authorization: `Bearer ${token}` }
}

export function clearBhAdminAuthCache() {
  localCache = null
  remoteCache = null
}
