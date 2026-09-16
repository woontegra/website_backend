/**
 * Fail-fast: development must not call production Bilirkişi Hesap webapi
 * for ordinary (write-capable) upstream traffic.
 *
 * Opt-in exception: BH_ALLOW_REMOTE_READ=true + BH_WEBAPI_REMOTE_URL enables
 * development-only GET (and auth-login bootstrap) against a remote host.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

export function isLocalBhHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(String(hostname || '').toLowerCase())
}

export function isBhRemoteReadAllowed(): boolean {
  const nodeEnv = (process.env.NODE_ENV || 'development').trim().toLowerCase()
  if (nodeEnv === 'production') return false
  return String(process.env.BH_ALLOW_REMOTE_READ || '')
    .trim()
    .toLowerCase() === 'true'
}

export function resolveBhWebapiBaseUrl(): string {
  return (process.env.BH_WEBAPI_URL || '').trim().replace(/\/+$/, '')
}

export function resolveBhWebapiRemoteBaseUrl(): string {
  return (process.env.BH_WEBAPI_REMOTE_URL || '').trim().replace(/\/+$/, '')
}

export function assertSafeBhUpstreamUrl(
  baseUrl: string | undefined | null,
  { label = 'BH_WEBAPI_URL' }: { label?: string } = {},
): void {
  const nodeEnv = (process.env.NODE_ENV || 'development').trim().toLowerCase()
  if (nodeEnv === 'production') return

  const raw = String(baseUrl || '').trim()
  if (!raw) {
    throw new Error(
      `[bh-upstream-guard] ${label} is empty. Development must point at local BH webapi (http://127.0.0.1:3001).`,
    )
  }

  let host = ''
  try {
    host = new URL(raw).hostname.toLowerCase()
  } catch {
    throw new Error(`[bh-upstream-guard] ${label} is not a valid URL.`)
  }

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Development environment cannot use production BH webapi. ` +
        `${label} host "${host}" is not localhost. ` +
        `Set ${label} to http://127.0.0.1:3001.`,
    )
  }
}

/**
 * Validates remote read-only upstream URL (dev opt-in only).
 */
export function assertBhRemoteReadUrl(
  baseUrl: string | undefined | null,
  { label = 'BH_WEBAPI_REMOTE_URL' }: { label?: string } = {},
): void {
  if (!isBhRemoteReadAllowed()) {
    throw new Error(
      `[bh-remote-read] ${label} requires BH_ALLOW_REMOTE_READ=true in development.`,
    )
  }

  const raw = String(baseUrl || '').trim()
  if (!raw) {
    throw new Error(`[bh-remote-read] ${label} is empty.`)
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`[bh-remote-read] ${label} is not a valid URL.`)
  }

  if (url.protocol !== 'https:') {
    throw new Error(`[bh-remote-read] ${label} must use HTTPS.`)
  }

  if (isLocalBhHost(url.hostname)) {
    throw new Error(
      `[bh-remote-read] ${label} must point at a remote host, not localhost.`,
    )
  }
}
