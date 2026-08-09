import type {
  LicensePurchasePublicView,
  LicensePurchaseFulfillResponse,
  LicensePurchaseRenewalPreview,
} from './mkSaasLicensePurchase.types'

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

export function isMkSaasLicensePurchaseConfigured(): boolean {
  return Boolean(apiBase() && provisionSecret())
}

async function mkPost<T>(path: string, body: unknown, idempotencyKey?: string): Promise<
  { success: true; data: T } | { success: false; status?: number; error: string }
> {
  const base = apiBase()
  const secret = provisionSecret()
  if (!base || !secret) {
    return { success: false, error: 'Müvekkil Kasa SaaS entegrasyonu yapılandırılmamış.' }
  }

  const url = `${base}/api/v1/integrations/woontegra-website${path}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        [HEADER_NAME]: secret,
        ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {})
      },
      body: JSON.stringify(body)
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
    if (!parsed || typeof parsed !== 'object') {
      return { success: false, status: res.status, error: 'Müvekkil Kasa SaaS yanıtı geçersiz.' }
    }
    return { success: true, data: parsed as T }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function requestMkSaasLicensePurchaseResolve(renewalToken: string) {
  return mkPost<LicensePurchasePublicView & { ok: true }>('/license-purchase/resolve', {
    renewalToken
  })
}

export async function requestMkSaasLicensePurchasePreview(input: {
  renewalToken: string
  renewalDays: number
}) {
  return mkPost<LicensePurchaseRenewalPreview & { ok: true }>('/license-purchase/preview', input)
}

export async function requestMkSaasLicensePurchaseBind(input: {
  renewalToken: string
  externalOrderId: string
  checkoutEmail?: string | null
}) {
  return mkPost<LicensePurchasePublicView & { ok: true }>('/license-purchase/bind', input, input.externalOrderId)
}

export async function requestMkSaasLicensePurchaseFulfill(input: {
  externalOrderId: string
  renewalDays: number
  externalCustomerId?: string | null
  billing?: { amount?: number; currency: string; paidAt?: string }
  notes?: string
}) {
  return mkPost<LicensePurchaseFulfillResponse>('/license-purchase/fulfill', {
    externalOrderId: input.externalOrderId,
    productCode: 'MUVEKKIL_KASA_SAAS',
    renewalDays: input.renewalDays,
    externalCustomerId: input.externalCustomerId ?? undefined,
    billing: input.billing,
    notes: input.notes
  }, input.externalOrderId)
}
