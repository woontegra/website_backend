/**
 * Production deploy + dinamik lisans E2E probe (secret/token loglanmaz).
 */
import 'dotenv/config'

const LICENSE_SERVER_URL = (process.env.LICENSE_SERVER_URL ?? 'https://lisans-server-backend-production.up.railway.app').replace(/\/$/, '')
const WEBSITE_BACKEND_URL = (process.env.BACKEND_PUBLIC_URL ?? 'https://woontegra-commerce-backend-production.up.railway.app').replace(/\/$/, '')
const INTEGRATION_SECRET = process.env.LICENSE_SERVER_INTEGRATION_SECRET?.trim() ?? ''
const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim() ?? ''
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD?.trim() ?? ''

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

async function fetchJson(url, init) {
  const res = await fetch(url, init)
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

async function waitForProgramsEndpoint(maxAttempts = 12) {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetchJson(`${LICENSE_SERVER_URL}/api/integrations/website/programs`, {
      headers: { 'x-integration-secret': INTEGRATION_SECRET, Accept: 'application/json' },
    })
    if (res.status === 200 && Array.isArray(res.data)) {
      return { ok: true, programs: res.data, attempt: i + 1 }
    }
    await sleep(15000)
  }
  return { ok: false }
}

async function adminToken() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return null
  const res = await fetchJson(`${WEBSITE_BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  })
  const token = res.data?.token ?? res.data?.data?.token
  return typeof token === 'string' ? token : null
}

async function main() {
  const out = {
    licenseServerUrl: LICENSE_SERVER_URL,
    websiteBackendUrl: WEBSITE_BACKEND_URL,
    integrationSecretConfigured: Boolean(INTEGRATION_SECRET),
    integrationSecretIsPlaceholder: INTEGRATION_SECRET === 'change-me-integration-secret',
    adminCredentialsConfigured: Boolean(ADMIN_EMAIL && ADMIN_PASSWORD),
  }

  const health = await fetchJson(`${LICENSE_SERVER_URL}/api/health`).catch(() => ({ status: 0, data: {} }))
  out.licenseServerHealthStatus = health.status

  const programsWait = await waitForProgramsEndpoint(10)
  out.licenseServerProgramsEndpoint = programsWait.ok
    ? {
        status: 200,
        count: programsWait.programs.length,
        hasMuvekkil: programsWait.programs.some((p) => p?.appCode === 'MUVEKKIL_KASA_DESKTOP'),
        attempt: programsWait.attempt,
      }
    : { status: 'not_ready' }

  const token = await adminToken()
  out.adminLoginOk = Boolean(token)

  if (token) {
    const list = await fetchJson(`${WEBSITE_BACKEND_URL}/api/admin/license-programs`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    out.adminLicenseProgramsProxy = {
      status: list.status,
      count: Array.isArray(list.data?.data) ? list.data.data.length : Array.isArray(list.data) ? list.data.length : 0,
      hasMuvekkil: (Array.isArray(list.data?.data) ? list.data.data : Array.isArray(list.data) ? list.data : []).some(
        (p) => p?.appCode === 'MUVEKKIL_KASA_DESKTOP',
      ),
    }

    // Create TEST_DYNAMIC_DESKTOP if missing
    const create = await fetchJson(`${WEBSITE_BACKEND_URL}/api/admin/license-programs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        appCode: 'TEST_DYNAMIC_DESKTOP',
        name: 'Test Dinamik Desktop',
        defaultLicenseDays: 365,
        defaultMaxDevices: 1,
        isActive: true,
      }),
    })
    out.createTestProgram = {
      status: create.status,
      created: create.status === 201,
      alreadyExists: create.status === 409 || create.status === 200,
      appCode: create.data?.data?.appCode ?? null,
    }

    // Negative test: invalid appCode on product create attempt via PATCH simulation - use GET single
    const missing = await fetchJson(`${WEBSITE_BACKEND_URL}/api/admin/license-programs/DOES_NOT_EXIST_999`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    out.negativeMissingAppCodeStatus = missing.status
  }

  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }))
  process.exit(1)
})
