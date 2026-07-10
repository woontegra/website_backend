import { isMuvekkilKasaSaasProvisionConfigured } from './muvekkilKasaSaasProvision.client'

const HEADER_NAME = 'x-woontegra-website-provision-secret'

export type MkSaasEmailLookupRecord = {
  userId: string
  kullaniciAdi: string
  ownerEmail: string
  role: string
  userActive: boolean
  tenant: {
    tenantId: string
    tenantSlug: string
    tenantName: string
    tenantActive: boolean
    licenseStatus: string
    licenseKey: string | null
    externalOrderId: string | null
    externalCustomerId: string | null
    licenseStartDate: string | null
    licenseEndDate: string | null
    createdAt: string
  } | null
}

export type MkSaasEmailLookupView = {
  configured: boolean
  reachable: boolean
  found: boolean
  email: string
  records: MkSaasEmailLookupRecord[]
  error: string | null
  manualCleanupHint: string | null
}

function apiBase(): string | null {
  const raw = process.env.MUVEKKIL_KASA_SAAS_API_URL?.trim()
  if (!raw) return null
  return raw.replace(/\/$/, '')
}

function provisionSecret(): string | null {
  const s = process.env.MUVEKKIL_KASA_SAAS_PROVISION_SECRET?.trim()
  return s || null
}

export function isMuvekkilKasaSaasLookupConfigured(): boolean {
  return isMuvekkilKasaSaasProvisionConfigured()
}

export async function lookupMuvekkilKasaSaasByEmail(email: string): Promise<MkSaasEmailLookupView> {
  const normalized = email.trim().toLowerCase()
  const base = apiBase()
  const secret = provisionSecret()

  if (!base || !secret) {
    return {
      configured: false,
      reachable: false,
      found: false,
      email: normalized,
      records: [],
      error: 'MK SaaS API yapılandırması eksik (MUVEKKIL_KASA_SAAS_API_URL / SECRET).',
      manualCleanupHint:
        'MK SaaS admin panelinden bu e-posta/tenant kaydını kontrol edin veya externalCustomerId ile eşleştirin.',
    }
  }

  const url = `${base}/api/v1/integrations/woontegra-website/tenants/lookup-by-email?email=${encodeURIComponent(normalized)}`

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        [HEADER_NAME]: secret,
      },
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
      const message =
        parsed && typeof parsed === 'object' && parsed !== null && 'message' in parsed
          ? String((parsed as { message: unknown }).message)
          : text || `HTTP ${res.status}`
      return {
        configured: true,
        reachable: true,
        found: false,
        email: normalized,
        records: [],
        error: message,
        manualCleanupHint:
          'MK SaaS admin panelinden bu e-posta/tenant kaydını silin veya externalCustomerId ile eşleştirin.',
      }
    }

    if (!parsed || typeof parsed !== 'object' || parsed === null || !('ok' in parsed)) {
      return {
        configured: true,
        reachable: true,
        found: false,
        email: normalized,
        records: [],
        error: 'MK SaaS lookup yanıtı geçersiz.',
        manualCleanupHint:
          'MK SaaS admin panelinden bu e-posta/tenant kaydını silin veya externalCustomerId ile eşleştirin.',
      }
    }

    const row = parsed as {
      found?: boolean
      records?: MkSaasEmailLookupRecord[]
    }
    const records = Array.isArray(row.records) ? row.records : []

    return {
      configured: true,
      reachable: true,
      found: row.found === true || records.length > 0,
      email: normalized,
      records,
      error: null,
      manualCleanupHint: records.length
        ? 'MK SaaS admin panelinden bu e-posta/tenant kaydını silin veya yeni Woontegra customerId ile externalCustomerId eşleştirin.'
        : null,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      configured: true,
      reachable: false,
      found: false,
      email: normalized,
      records: [],
      error: msg,
      manualCleanupHint:
        'MK SaaS API erişilemedi. MK SaaS admin panelinden bu e-posta/tenant kaydını manuel kontrol edin.',
    }
  }
}
