import { createHmac } from 'node:crypto'

/**
 * KoopPlus SaaS sunucu-sunucu entegrasyonu (HMAC-SHA256).
 * Sözleşme: KoopPlus-SaaS/backend/INTEGRATION.md
 * Gizli anahtar ve müşteri verisi (PII) asla loglanmaz.
 */

export const KOOPPLUS_DEFAULT_API_URL = 'https://api.koopplus.woontegra.com'
export const KOOPPLUS_REQUEST_TIMEOUT_MS = 15_000

export function koopPlusApiBase(): string {
  const raw = (process.env.KOOPPLUS_API_URL ?? '').trim() || KOOPPLUS_DEFAULT_API_URL
  return raw.replace(/\/+$/, '')
}

export function isKoopPlusIntegrationConfigured(): boolean {
  return Boolean((process.env.INTEGRATION_SECRET ?? '').trim())
}

/**
 * `HMAC_SHA256(INTEGRATION_SECRET, `${timestamp}.${rawBody}`)` → hex.
 * `rawBody` gönderilen birebir dizgedir.
 */
export function signKoopPlusBody(
  rawBody: string,
  opts?: { secret?: string; nowSeconds?: number },
): { timestamp: string; signature: string } {
  const secret = (opts?.secret ?? process.env.INTEGRATION_SECRET ?? '').trim()
  if (!secret) {
    throw new Error('INTEGRATION_SECRET tanımlı değil')
  }
  const timestamp = String(opts?.nowSeconds ?? Math.floor(Date.now() / 1000))
  const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex')
  return { timestamp, signature }
}

export type KoopPlusResponse = {
  ok: boolean
  /** 0 = ağ/zaman aşımı/yapılandırma hatası (HTTP yanıtı yok) */
  status: number
  json: unknown
}

/**
 * JSON'u bir kez serileştirir, aynı dizgeyi imzalar ve gönderir.
 * `Origin` / `Sec-Fetch-Site` başlığı eklenmez (KoopPlus tarayıcı isteklerini 403 ile reddeder).
 */
export async function postKoopPlusJson(path: string, bodyObj: unknown): Promise<KoopPlusResponse> {
  const rawBody = JSON.stringify(bodyObj)
  let signed: { timestamp: string; signature: string }
  try {
    signed = signKoopPlusBody(rawBody)
  } catch {
    return {
      ok: false,
      status: 0,
      json: { success: false, error: 'KoopPlus entegrasyonu yapılandırılmamış (INTEGRATION_SECRET).' },
    }
  }

  const url = `${koopPlusApiBase()}${path.startsWith('/') ? path : `/${path}`}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), KOOPPLUS_REQUEST_TIMEOUT_MS)
  try {
    const res = await globalThis.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Koop-Timestamp': signed.timestamp,
        'X-Koop-Signature': signed.signature,
      },
      body: rawBody,
      signal: controller.signal,
    })
    let json: unknown = null
    try {
      json = await res.json()
    } catch {
      json = null
    }
    return { ok: res.ok, status: res.status, json }
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError'
    return {
      ok: false,
      status: 0,
      json: {
        success: false,
        error: aborted ? 'KoopPlus isteği zaman aşımına uğradı.' : 'KoopPlus sunucusuna ulaşılamadı.',
      },
    }
  } finally {
    clearTimeout(timer)
  }
}

/** KoopPlus `{ success:false, error }` yanıtından güvenli (PII maskeli) hata metni. */
export function extractKoopPlusError(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null
  const err = (json as { error?: unknown }).error
  return typeof err === 'string' && err.trim() ? err.trim() : null
}
