import https from 'node:https'
import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import { isNonSalesDeliveryUrl } from './productDeliveryUrl'

const MAX_REDIRECTS = 3
const ALLOWED_REMOTE_SUFFIXES = ['.r2.dev']

function readEnv(name: string): string {
  return (process.env[name] ?? '').trim()
}

function hostnameFromEnvUrl(name: string): string | null {
  const raw = readEnv(name)
  if (!raw) return null
  try {
    return new URL(raw).hostname
  } catch {
    return null
  }
}

export function isBlockedDownloadHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase()
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '127.0.0.1' || host === '::1' || host === '[::1]') return true
  if (host === '0.0.0.0' || host === '169.254.169.254') return true
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host)) return true
  return false
}

export function isAllowlistedRemoteDownloadHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase()
  if (!host || isBlockedDownloadHostname(host)) return false
  if (ALLOWED_REMOTE_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true
  const configured = [
    hostnameFromEnvUrl('R2_PUBLIC_BASE_URL'),
    hostnameFromEnvUrl('R2_DOWNLOADS_PUBLIC_BASE_URL'),
  ]
  return configured.some((allowed) => allowed && allowed.toLowerCase() === host)
}

export function assertSafeRemoteDownloadUrl(url: string): URL {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') {
    throw new Error('REMOTE_DOWNLOAD_DENIED')
  }
  if (isNonSalesDeliveryUrl(parsed.toString())) {
    throw new Error('REMOTE_DOWNLOAD_DENIED')
  }
  if (!isAllowlistedRemoteDownloadHost(parsed.hostname)) {
    throw new Error('REMOTE_DOWNLOAD_DENIED')
  }
  return parsed
}

function statusError(status: number): Error {
  const code = status === 404 || status === 410 ? 'NOT_FOUND' : 'STORAGE_FAILURE'
  const error = new Error(code)
  ;(error as Error & { httpStatus: number }).httpStatus = status
  return error
}

function request(
  url: string,
  method: 'HEAD' | 'GET',
  headers: Record<string, string>,
  redirectCount = 0,
): Promise<IncomingMessage> {
  const parsed = assertSafeRemoteDownloadUrl(url)
  return new Promise((resolve, reject) => {
    const req = https.request(
      parsed,
      { method, headers },
      (res) => {
        const status = res.statusCode ?? 0
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          res.resume()
          if (redirectCount >= MAX_REDIRECTS) {
            reject(new Error('REMOTE_DOWNLOAD_REDIRECTS'))
            return
          }
          try {
            const next = new URL(res.headers.location, parsed).toString()
            if (next.startsWith('http://')) {
              reject(new Error('REMOTE_DOWNLOAD_DENIED'))
              return
            }
            void request(next, method, headers, redirectCount + 1).then(resolve, reject)
          } catch (error) {
            reject(error)
          }
          return
        }
        resolve(res)
      },
    )
    req.on('error', reject)
    req.end()
  })
}

export async function headRemoteHttpsDownload(url: string): Promise<{ size: number; status: number }> {
  const res = await request(url, 'HEAD', {})
  const status = res.statusCode ?? 0
  res.resume()
  if (status < 200 || status >= 300) throw statusError(status)
  const size = Number(res.headers['content-length'] ?? 0)
  if (!Number.isFinite(size) || size <= 0) throw new Error('Dosya boyutu alınamadı')
  return { size, status }
}

export async function getRemoteHttpsDownload(
  url: string,
  rangeHeader?: string | null,
): Promise<{ status: number; stream: Readable; contentLength?: number }> {
  const headers: Record<string, string> = {}
  if (rangeHeader?.trim()) headers.Range = rangeHeader.trim()
  const res = await request(url, 'GET', headers)
  const status = res.statusCode ?? 0
  if (status < 200 || status >= 300) {
    res.resume()
    throw statusError(status)
  }
  return {
    status,
    stream: res,
    contentLength: Number(res.headers['content-length'] ?? 0) || undefined,
  }
}
