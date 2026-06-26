export type WebsiteOrderLicenseRequest = {
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  appCode: string
  orderNo: string
  downloadUrl?: string | null
  licenseDays?: number
  maxDevices?: number
  /** Mevcut lisans için mail yeniden denemesinde aktivasyon şifresi üretir */
  resendCredentials?: boolean
}

export type WebsiteOrderLicenseResponse = {
  success: boolean
  alreadyExists?: boolean
  orderNo?: string
  licenseKey?: string
  activationPassword?: string
  programName?: string
  expiresAt?: string
  mailSent?: boolean
  mailError?: string
  error?: string
}

export type LicenseServerProgram = {
  appCode: string
  name: string
  isActive: boolean
  defaultLicenseDays: number
  defaultMaxDevices: number
  description?: string | null
}

export type LicenseServerProgramCreateInput = {
  appCode: string
  name: string
  description?: string | null
  defaultLicenseDays?: number
  defaultMaxDevices?: number
  isActive?: boolean
}

function baseUrl(): string | null {
  const url = (process.env.LICENSE_SERVER_URL ?? 'http://localhost:4001').replace(/\/$/, '')
  return url || null
}

function integrationSecret(): string | null {
  const s = process.env.LICENSE_SERVER_INTEGRATION_SECRET?.trim()
  return s || null
}

export function isLicenseServerConfigured(): boolean {
  return !!(baseUrl() && integrationSecret())
}

async function licenseServerFetch(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const url = baseUrl()
  const secret = integrationSecret()
  if (!url || !secret) {
    return {
      ok: false,
      status: 503,
      data: { error: 'Lisans sunucusu yapılandırılmamış (LICENSE_SERVER_URL / LICENSE_SERVER_INTEGRATION_SECRET).' },
    }
  }

  let res: Response
  try {
    res = await fetch(`${url}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'x-integration-secret': secret,
        ...(init?.headers ?? {}),
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Bağlantı hatası'
    return { ok: false, status: 503, data: { error: `Lisans sunucusuna ulaşılamadı: ${msg}` } }
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { ok: res.ok, status: res.status, data }
}

function mapProgram(row: Record<string, unknown>): LicenseServerProgram | null {
  if (typeof row.appCode !== 'string' || typeof row.name !== 'string') return null
  return {
    appCode: row.appCode,
    name: row.name,
    isActive: row.isActive === true,
    defaultLicenseDays:
      typeof row.defaultLicenseDays === 'number' && row.defaultLicenseDays > 0 ? row.defaultLicenseDays : 365,
    defaultMaxDevices:
      typeof row.defaultMaxDevices === 'number' && row.defaultMaxDevices > 0 ? row.defaultMaxDevices : 1,
    description: typeof row.description === 'string' ? row.description : null,
  }
}

export async function fetchLicenseServerPrograms(activeOnly = false): Promise<{
  programs: LicenseServerProgram[]
  error?: string
}> {
  const q = activeOnly ? '?activeOnly=true' : ''
  const result = await licenseServerFetch(`/api/integrations/website/programs${q}`)
  if (!result.ok) {
    const err = typeof result.data.error === 'string' ? result.data.error : `HTTP ${result.status}`
    return { programs: [], error: err }
  }
  if (!Array.isArray(result.data)) {
    return { programs: [], error: 'Lisans sunucusu program listesi geçersiz yanıt döndü.' }
  }
  const programs = result.data
    .map((row) => mapProgram(row as Record<string, unknown>))
    .filter((p): p is LicenseServerProgram => p !== null)
  return { programs }
}

export async function fetchLicenseServerProgram(appCode: string): Promise<{
  program: LicenseServerProgram | null
  error?: string
}> {
  const code = appCode.trim()
  if (!code) return { program: null, error: 'appCode zorunludur' }
  const result = await licenseServerFetch(
    `/api/integrations/website/programs/${encodeURIComponent(code)}`,
  )
  if (result.status === 404) return { program: null }
  if (!result.ok) {
    const err = typeof result.data.error === 'string' ? result.data.error : `HTTP ${result.status}`
    return { program: null, error: err }
  }
  const program = mapProgram(result.data)
  return program ? { program } : { program: null, error: 'Program yanıtı geçersiz' }
}

export async function createLicenseServerProgram(
  input: LicenseServerProgramCreateInput,
): Promise<{ program?: LicenseServerProgram; error?: string; status: number }> {
  const result = await licenseServerFetch('/api/integrations/website/programs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appCode: input.appCode.trim().toUpperCase(),
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      defaultLicenseDays: input.defaultLicenseDays,
      defaultMaxDevices: input.defaultMaxDevices,
      isActive: input.isActive !== false,
    }),
  })
  if (result.status === 409 && result.data.program) {
    const program = mapProgram(result.data.program as Record<string, unknown>)
    if (program) return { program, error: 'Bu appCode zaten kayıtlı', status: 409 }
  }
  if (!result.ok) {
    const err = typeof result.data.error === 'string' ? result.data.error : `HTTP ${result.status}`
    return { error: err, status: result.status }
  }
  const program = mapProgram(result.data)
  if (!program) return { error: 'Program oluşturuldu ancak yanıt geçersiz', status: result.status }
  return { program, status: result.status }
}

/** Woontegra-Lisans-Server website entegrasyonu — secret yalnızca sunucu tarafında */
export async function requestWebsiteOrderLicense(
  input: WebsiteOrderLicenseRequest,
): Promise<WebsiteOrderLicenseResponse> {
  const url = baseUrl()
  const secret = integrationSecret()
  if (!url || !secret) {
    return {
      success: false,
      error: 'Lisans sunucusu yapılandırılmamış (LICENSE_SERVER_URL / LICENSE_SERVER_INTEGRATION_SECRET).',
    }
  }

  const endpoint = `${url}/api/integrations/website/order-license`
  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-integration-secret': secret,
      },
      body: JSON.stringify({
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone ?? undefined,
        appCode: input.appCode,
        orderNo: input.orderNo,
        downloadUrl: input.downloadUrl ?? undefined,
        licenseDays: input.licenseDays,
        maxDevices: input.maxDevices,
        resendCredentials: input.resendCredentials === true ? true : undefined,
      }),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Bağlantı hatası'
    console.error('[license-server] unreachable', { orderNo: input.orderNo, appCode: input.appCode, msg })
    return { success: false, error: `Lisans sunucusuna ulaşılamadı: ${msg}` }
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (res.status === 409 && data.alreadyExists === true) {
    const licenseKey = typeof data.licenseKey === 'string' ? data.licenseKey : undefined
    if (input.resendCredentials === true) {
      return {
        success: false,
        alreadyExists: true,
        orderNo: typeof data.orderNo === 'string' ? data.orderNo : input.orderNo,
        licenseKey,
        error:
          'Mevcut lisans bulundu ancak aktivasyon şifresi alınamadı. Lisans sunucusunda resendCredentials desteği deploy edilmeli.',
      }
    }
    return {
      success: false,
      alreadyExists: true,
      orderNo: typeof data.orderNo === 'string' ? data.orderNo : input.orderNo,
      licenseKey,
      error: typeof data.error === 'string' ? data.error : 'Lisans zaten oluşturulmuş',
    }
  }
  if (!res.ok) {
    let err = typeof data.error === 'string' ? data.error : `HTTP ${res.status}`
    if (res.status === 403 || err.toLowerCase().includes('entegrasyon')) {
      err =
        'Geçersiz entegrasyon anahtarı. Website backend LICENSE_SERVER_INTEGRATION_SECRET ile Lisans Server INTEGRATION_SECRET (Railway Variables) birebir aynı olmalı.'
    }
    console.error('[license-server] order-license failed', {
      orderNo: input.orderNo,
      appCode: input.appCode,
      status: res.status,
      err,
    })
    return { success: false, error: err }
  }

  return {
    success: data.success === true,
    orderNo: typeof data.orderNo === 'string' ? data.orderNo : input.orderNo,
    licenseKey: typeof data.licenseKey === 'string' ? data.licenseKey : undefined,
    activationPassword: typeof data.activationPassword === 'string' ? data.activationPassword : undefined,
    programName: typeof data.programName === 'string' ? data.programName : undefined,
    expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : undefined,
    mailSent: data.mailSent === true,
    mailError: typeof data.mailError === 'string' ? data.mailError : undefined,
  }
}
