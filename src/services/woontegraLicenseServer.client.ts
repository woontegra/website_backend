export type WebsiteOrderLicenseRequest = {
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  appCode: string
  orderNo: string
  downloadUrl?: string | null
  licenseDays?: number
  maxDevices?: number
}

export type WebsiteOrderLicenseResponse = {
  success: boolean
  orderNo?: string
  licenseKey?: string
  activationPassword?: string
  programName?: string
  expiresAt?: string
  mailSent?: boolean
  mailError?: string
  error?: string
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
      }),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Bağlantı hatası'
    console.error('[license-server] unreachable', { orderNo: input.orderNo, appCode: input.appCode, msg })
    return { success: false, error: `Lisans sunucusuna ulaşılamadı: ${msg}` }
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
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
