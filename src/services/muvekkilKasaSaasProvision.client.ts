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
  demoMu: false
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
  licenseStartDate: string
  licenseEndDate: string
  licenseKey: string | null
  mailSent?: boolean
  mailError?: string
}

export type MuvekkilKasaSaasProvisionResult =
  | { success: true; data: MuvekkilKasaSaasProvisionResponse }
  | { success: false; status?: number; error: string }

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

    if (!res.ok) {
      const errMsg =
        parsed && typeof parsed === 'object' && parsed !== null && 'message' in parsed
          ? String((parsed as { message: unknown }).message)
          : text || `HTTP ${res.status}`
      return { success: false, status: res.status, error: errMsg }
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
