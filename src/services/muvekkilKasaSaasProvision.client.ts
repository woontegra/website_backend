import { MUVEKKIL_KASA_SAAS_PRODUCT_CODE } from '../lib/muvekkilKasaSaasProduct'

export type MuvekkilKasaSaasProvisionRequest = {
  externalOrderId: string
  externalCustomerId?: string | null
  productCode: typeof MUVEKKIL_KASA_SAAS_PRODUCT_CODE
  customer: {
    name: string
    email: string
    phone?: string | null
  }
  tenant?: {
    name?: string | null
    officeName?: string | null
    phone?: string | null
    email?: string | null
    taxNumber?: string | null
    taxOffice?: string | null
    address?: string | null
  }
  licenseDays: number
  licenseStatus: 'AKTIF'
  demoMu: boolean
  billing?: {
    amount?: number
    currency: string
    paidAt?: string
  }
  notes?: string
}

export type MuvekkilKasaSaasProvisionResponse = {
  ok: true
  status: 'created' | 'already_exists'
  tenantId: string
  tenantSlug: string
  ownerUserId?: string
  ownerEmail: string
  ownerUsername?: string
  temporaryPassword?: string
  loginUrl?: string
  licenseStartDate: string
  licenseEndDate: string
  licenseKey: string | null
  musteriNo?: string | null
  mailSent?: boolean
  mailError?: string
}

export type MuvekkilKasaSaasProvisionFailure = {
  success: false
  status?: number
  error: string
  code?: string
}

export type MuvekkilKasaSaasProvisionResult =
  | { success: true; data: MuvekkilKasaSaasProvisionResponse }
  | MuvekkilKasaSaasProvisionFailure

function parseProvisionErrorPayload(parsed: unknown, fallbackText: string): { error: string; code?: string } {
  if (!parsed || typeof parsed !== 'object' || parsed === null) {
    return { error: fallbackText || 'Müvekkil Kasa SaaS isteği başarısız.' }
  }
  const row = parsed as Record<string, unknown>
  const message =
    typeof row.message === 'string' && row.message.trim()
      ? row.message.trim()
      : typeof row.error === 'string' && row.error.trim()
        ? row.error.trim()
        : fallbackText || 'Müvekkil Kasa SaaS isteği başarısız.'
  const code =
    typeof row.code === 'string' && row.code.trim()
      ? row.code.trim()
      : typeof row.error === 'string' && row.error.trim() && row.error !== message
        ? row.error.trim()
        : undefined
  return { error: message, code }
}

function isProvisionSuccessPayload(parsed: unknown): parsed is MuvekkilKasaSaasProvisionResponse {
  if (!parsed || typeof parsed !== 'object' || parsed === null) return false
  const row = parsed as Record<string, unknown>
  return row.ok === true && typeof row.tenantId === 'string' && row.tenantId.trim().length > 0
}

const HEADER_NAME = 'x-woontegra-website-provision-secret'

function apiBase(): string | null {
  const raw = process.env.MUVEKKIL_KASA_SAAS_API_URL?.trim()
  if (!raw) return null
  return raw.replace(/\/$/, '')
}

function provisionSecret(): string | null {
  const s = process.env.MUVEKKIL_KASA_SAAS_PROVISION_SECRET?.trim()
  return s || null
}

export function isMuvekkilKasaSaasProvisionConfigured(): boolean {
  return Boolean(apiBase() && provisionSecret())
}

export async function requestMuvekkilKasaSaasProvision(
  body: MuvekkilKasaSaasProvisionRequest,
): Promise<MuvekkilKasaSaasProvisionResult> {
  const base = apiBase()
  const secret = provisionSecret()
  if (!base || !secret) {
    return { success: false, error: 'Müvekkil Kasa SaaS entegrasyonu yapılandırılmamış (API URL veya secret eksik).' }
  }

  const url = `${base}/api/v1/integrations/woontegra-website/tenants/provision`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        [HEADER_NAME]: secret,
        'x-idempotency-key': body.externalOrderId,
      },
      body: JSON.stringify(body),
    })

    const text = await res.text()
    let parsed: unknown = null
    if (text) {
      try {
        parsed = JSON.parse(text) as unknown
      } catch {
        parsed = null
      }
    }

    if (isProvisionSuccessPayload(parsed)) {
      return { success: true, data: parsed }
    }

    if (!res.ok) {
      const { error, code } = parseProvisionErrorPayload(parsed, text || `HTTP ${res.status}`)
      return { success: false, status: res.status, error, code }
    }

    if (!parsed || typeof parsed !== 'object' || parsed === null || !('ok' in parsed)) {
      return { success: false, status: res.status, error: 'Müvekkil Kasa SaaS yanıtı geçersiz.' }
    }

    return { success: true, data: parsed as MuvekkilKasaSaasProvisionResponse }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[mk-saas-provision] unreachable', { externalOrderId: body.externalOrderId, error: msg })
    return { success: false, error: msg }
  }
}
