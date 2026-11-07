import type { Request, Response } from 'express'
import { getClientIp } from '../lib/clientIp'
import { postKoopPlusJson } from '../lib/koopplusIntegration'

/**
 * POST /api/koopplus/demo-request
 * Demo formu verisi website DB'ye YAZILMAZ; yalnızca KoopPlus'a HMAC imzalı proxy edilir.
 * PII (ad, e-posta, telefon) loglanmaz.
 */

export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

function str(body: Record<string, unknown>, key: string, max = 255): string {
  const v = body[key]
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

export type TurnstileResult = { ok: true } | { ok: false; reason: 'not_configured' | 'missing_token' | 'failed' }

export async function verifyTurnstile(token: string, remoteIp: string): Promise<TurnstileResult> {
  const secret = (process.env.TURNSTILE_SECRET_KEY ?? '').trim()
  if (!secret) {
    if (process.env.NODE_ENV === 'development') return { ok: true }
    return { ok: false, reason: 'not_configured' }
  }
  if (!token) return { ok: false, reason: 'missing_token' }
  try {
    const form = new URLSearchParams({ secret, response: token })
    if (remoteIp) form.set('remoteip', remoteIp)
    const res = await globalThis.fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })
    const json = (await res.json()) as { success?: boolean }
    return json.success === true ? { ok: true } : { ok: false, reason: 'failed' }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function createKoopPlusDemoRequest(req: Request, res: Response) {
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>

  const fullName = str(body, 'fullName')
  const email = str(body, 'email').toLowerCase()
  const phone = str(body, 'phone', 40)
  const cooperativeName = str(body, 'cooperativeName')
  const city = str(body, 'city', 100)
  const district = str(body, 'district', 100)
  const kvkkConsentVersion = str(body, 'kvkkConsentVersion', 64)
  const kvkkConsentRaw = str(body, 'kvkkConsentAt', 64)
  const turnstileToken = str(body, 'turnstileToken', 4096)

  if (!fullName || !email || !phone || !cooperativeName) {
    return res.status(400).json({ success: false, error: 'Ad soyad, e-posta, telefon ve kooperatif adı zorunludur.' })
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ success: false, error: 'Geçerli bir e-posta adresi girin.' })
  }
  const consentDate = kvkkConsentRaw ? new Date(kvkkConsentRaw) : null
  if (!consentDate || Number.isNaN(consentDate.getTime()) || !kvkkConsentVersion) {
    return res.status(400).json({ success: false, error: 'KVKK aydınlatma onayı zorunludur.' })
  }

  const clientIp = getClientIp(req)
  const turnstile = await verifyTurnstile(turnstileToken, clientIp)
  if (!turnstile.ok) {
    return res.status(400).json({
      success: false,
      error:
        turnstile.reason === 'not_configured'
          ? 'Doğrulama servisi yapılandırılmamış.'
          : 'Robot doğrulaması başarısız. Lütfen tekrar deneyin.',
    })
  }

  const upstream = await postKoopPlusJson('/api/integrations/demo-requests', {
    fullName,
    email,
    phone,
    cooperativeName,
    ...(city ? { city } : {}),
    ...(district ? { district } : {}),
    clientIp,
    kvkkConsentAt: consentDate.toISOString(),
    kvkkConsentVersion,
  })

  // Yapılandırma / imza sorunlarını istemciye sızdırma.
  if (upstream.status === 0 || upstream.status === 401 || upstream.status === 403 || upstream.status === 503) {
    console.error('[koopplus] demo-request upstream unavailable', { status: upstream.status })
    return res.status(502).json({
      success: false,
      error: 'Demo talebi şu anda alınamıyor. Lütfen daha sonra tekrar deneyin.',
    })
  }

  const json =
    upstream.json && typeof upstream.json === 'object'
      ? upstream.json
      : { success: upstream.ok, ...(upstream.ok ? {} : { error: 'Demo talebi işlenemedi.' }) }
  if (!upstream.ok) {
    console.warn('[koopplus] demo-request rejected', { status: upstream.status })
  }
  return res.status(upstream.status).json(json)
}
