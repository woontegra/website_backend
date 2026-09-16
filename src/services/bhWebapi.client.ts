import {
  assertBhRemoteReadUrl,
  assertSafeBhUpstreamUrl,
  isBhRemoteReadAllowed,
  isLocalBhHost,
  resolveBhWebapiBaseUrl,
  resolveBhWebapiRemoteBaseUrl,
} from '../lib/assertSafeBhUpstream'

export type BhUpstreamResult =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status: number; error: string; data?: unknown }

export type BhUpstreamMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

function baseUrlOrThrow(): string {
  const base = resolveBhWebapiBaseUrl()
  assertSafeBhUpstreamUrl(base)
  if (!base) {
    throw new Error('BH_WEBAPI_URL yapılandırılmamış.')
  }
  return base
}

function remoteReadBaseUrlOrThrow(): string {
  if (!isBhRemoteReadAllowed()) {
    throw new Error(
      'BH remote read kapalı. Development için BH_ALLOW_REMOTE_READ=true gerekir.',
    )
  }
  const base = resolveBhWebapiRemoteBaseUrl()
  assertBhRemoteReadUrl(base)
  return base
}

/** True when URL host is not localhost (used to hard-block remote writes). */
function isRemoteHostUrl(base: string): boolean {
  try {
    return !isLocalBhHost(new URL(base).hostname)
  } catch {
    return true
  }
}

/**
 * Hard safety: mutating methods never leave localhost in development,
 * even if env is misconfigured.
 */
function assertWriteStaysLocal(method: BhUpstreamMethod, base: string, path: string): void {
  const nodeEnv = (process.env.NODE_ENV || 'development').trim().toLowerCase()
  if (nodeEnv === 'production') return
  if (method === 'GET') return
  if (!isRemoteHostUrl(base)) return
  throw new Error(
    `[bh-upstream-guard] Refusing ${method} ${path} to remote BH host in development. ` +
      `Writes must use local BH_WEBAPI_URL only.`,
  )
}

/**
 * Thin forwarder to Bilirkişi Hesap webapi. No pricing/campaign business logic.
 */
export async function bhUpstreamFetch(
  method: BhUpstreamMethod,
  path: string,
  body?: unknown,
  init?: {
    cookie?: string
    timeoutMs?: number
    authorization?: string
    headers?: Record<string, string>
  },
): Promise<BhUpstreamResult> {
  let base: string
  try {
    base = baseUrlOrThrow()
    assertWriteStaysLocal(method, base, path)
  } catch (err) {
    return {
      ok: false,
      status: 503,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  const controller = new AbortController()
  const timeoutMs = init?.timeoutMs ?? 30_000
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.cookie ? { Cookie: init.cookie } : {}),
        ...(init?.authorization ? { Authorization: init.authorization } : {}),
        ...(init?.headers || {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })

    const text = await res.text()
    let data: unknown = null
    if (text) {
      try {
        data = JSON.parse(text) as unknown
      } catch {
        data = { raw: text.slice(0, 500) }
      }
    }

    if (!res.ok) {
      const msg =
        data && typeof data === 'object' && data !== null
          ? String(
              (data as { message?: unknown; error?: unknown }).message ??
                (data as { error?: unknown }).error ??
                `BH webapi HTTP ${res.status}`,
            )
          : `BH webapi HTTP ${res.status}`
      return { ok: false, status: res.status, error: msg, data }
    }

    return { ok: true, status: res.status, data }
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return {
      ok: false,
      status: 502,
      error: aborted
        ? 'BH webapi zaman aşımı.'
        : err instanceof Error
          ? err.message
          : String(err),
    }
  } finally {
    clearTimeout(timer)
  }
}

/** Local PAYMENT_DRY_RUN: complete pending payment without PayTR callback. */
export async function bhManualCallback(merchantOid: string): Promise<BhUpstreamResult> {
  return bhUpstreamFetch('POST', '/api/payment/manual-callback', { merchant_oid: merchantOid })
}

/**
 * Binary forwarder (PDF/ZIP) for admin legal archive downloads.
 * Returns raw buffer + content headers; does not parse JSON.
 */
export async function bhUpstreamBinaryFetch(
  method: 'GET',
  path: string,
  init?: { authorization?: string; timeoutMs?: number },
): Promise<
  | { ok: true; status: number; buffer: Buffer; contentType: string; contentDisposition: string | null }
  | { ok: false; status: number; error: string; data?: unknown }
> {
  let base: string
  try {
    base = baseUrlOrThrow()
  } catch (err) {
    return {
      ok: false,
      status: 503,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  const controller = new AbortController()
  const timeoutMs = init?.timeoutMs ?? 60_000
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method,
      headers: {
        Accept: '*/*',
        ...(init?.authorization ? { Authorization: init.authorization } : {}),
      },
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text()
      let data: unknown = null
      if (text) {
        try {
          data = JSON.parse(text) as unknown
        } catch {
          data = { raw: text.slice(0, 300) }
        }
      }
      const msg =
        data && typeof data === 'object' && data !== null
          ? String(
              (data as { message?: unknown }).message ??
                `BH webapi HTTP ${res.status}`,
            )
          : `BH webapi HTTP ${res.status}`
      return { ok: false, status: res.status, error: msg, data }
    }

    const ab = await res.arrayBuffer()
    return {
      ok: true,
      status: res.status,
      buffer: Buffer.from(ab),
      contentType: res.headers.get('content-type') || 'application/octet-stream',
      contentDisposition: res.headers.get('content-disposition'),
    }
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return {
      ok: false,
      status: 502,
      error: aborted
        ? 'BH webapi zaman aşımı.'
        : err instanceof Error
          ? err.message
          : String(err),
    }
  } finally {
    clearTimeout(timer)
  }
}

async function remoteFetchRaw(
  method: 'GET' | 'POST',
  path: string,
  body: unknown | undefined,
  init?: { authorization?: string; timeoutMs?: number },
): Promise<BhUpstreamResult> {
  let base: string
  try {
    base = remoteReadBaseUrlOrThrow()
  } catch (err) {
    return {
      ok: false,
      status: 503,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // Remote mutating methods are forbidden except auth login bootstrap.
  if (method !== 'GET') {
    const normalized = path.split('?')[0].replace(/\/+$/, '') || '/'
    if (!(method === 'POST' && normalized === '/api/auth/login')) {
      return {
        ok: false,
        status: 403,
        error: `[bh-remote-read] Refusing ${method} ${path} to remote BH. Only GET (and POST /api/auth/login) allowed.`,
      }
    }
  }

  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  const controller = new AbortController()
  const timeoutMs = init?.timeoutMs ?? 30_000
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.authorization ? { Authorization: init.authorization } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })

    const text = await res.text()
    let data: unknown = null
    if (text) {
      try {
        data = JSON.parse(text) as unknown
      } catch {
        data = { raw: text.slice(0, 500) }
      }
    }

    if (!res.ok) {
      const msg =
        data && typeof data === 'object' && data !== null
          ? String(
              (data as { message?: unknown; error?: unknown }).message ??
                (data as { error?: unknown }).error ??
                `BH webapi HTTP ${res.status}`,
            )
          : `BH webapi HTTP ${res.status}`
      return { ok: false, status: res.status, error: msg, data }
    }

    return { ok: true, status: res.status, data }
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return {
      ok: false,
      status: 502,
      error: aborted
        ? 'BH remote webapi zaman aşımı.'
        : err instanceof Error
          ? err.message
          : String(err),
    }
  } finally {
    clearTimeout(timer)
  }
}

/** Development opt-in: GET-only against BH_WEBAPI_REMOTE_URL. */
export async function bhUpstreamRemoteReadGet(
  path: string,
  init?: { authorization?: string; timeoutMs?: number },
): Promise<BhUpstreamResult> {
  return remoteFetchRaw('GET', path, undefined, init)
}

/**
 * Development opt-in: POST /api/auth/login only (token bootstrap for remote GET).
 * Campaign/product/order writes are never allowed on remote.
 */
export async function bhUpstreamRemoteAuthLogin(body: {
  email: string
  password: string
}): Promise<BhUpstreamResult> {
  return remoteFetchRaw('POST', '/api/auth/login', body)
}
