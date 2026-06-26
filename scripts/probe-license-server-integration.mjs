/**
 * Production lisans server entegrasyon probe (secret değerleri loglanmaz).
 */
import 'dotenv/config'

const base = (process.env.LICENSE_SERVER_URL ?? '').replace(/\/$/, '')
const secret = process.env.LICENSE_SERVER_INTEGRATION_SECRET?.trim()

if (!base || !secret) {
  console.log(JSON.stringify({ ok: false, reason: 'LICENSE_SERVER_URL or LICENSE_SERVER_INTEGRATION_SECRET missing' }))
  process.exit(0)
}

const endpoint = `${base}/api/integrations/website/order-license`

async function post(body) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-integration-secret': secret,
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return {
    status: res.status,
    hasSuccess: data.success === true,
    alreadyExists: data.alreadyExists === true,
    hasLicenseKey: typeof data.licenseKey === 'string',
    hasActivationPassword: typeof data.activationPassword === 'string',
    hasError: typeof data.error === 'string',
  }
}

const existingOrderNo = process.argv[2]?.trim() || 'WNT-20260626-000003:1ec1fb31-1cd6-449b-bb3f-0d9265f6d02c:0'

const resendProbe = await post({
  customerName: 'Probe',
  customerEmail: 'info@optimoon.com',
  appCode: 'MUVEKKIL_KASA_DESKTOP',
  orderNo: existingOrderNo,
  resendCredentials: true,
})

console.log(
  JSON.stringify(
    {
      licenseServerUrl: base,
      localSecretConfigured: true,
      localSecretIsPlaceholder: secret === 'change-me-integration-secret',
      resendProbe,
    },
    null,
    2,
  ),
)
