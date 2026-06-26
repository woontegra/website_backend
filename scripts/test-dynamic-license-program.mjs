/**
 * Dinamik lisans program API probe (secret loglanmaz).
 */
import 'dotenv/config'
import {
  createLicenseServerProgram,
  fetchLicenseServerProgram,
  fetchLicenseServerPrograms,
  isLicenseServerConfigured,
} from '../src/services/woontegraLicenseServer.client.ts'

const TEST_CODE = 'TEST_DYNAMIC_DESKTOP'

async function main() {
  if (!isLicenseServerConfigured()) {
    console.log(JSON.stringify({ ok: false, reason: 'license_server_not_configured' }))
    return
  }

  const existing = await fetchLicenseServerProgram(TEST_CODE)
  let created = false
  if (!existing.program) {
    const result = await createLicenseServerProgram({
      appCode: TEST_CODE,
      name: 'Test Dynamic Desktop',
      defaultLicenseDays: 365,
      defaultMaxDevices: 1,
      isActive: true,
    })
    created = result.status === 201
    if (!result.program && result.error) {
      console.log(JSON.stringify({ ok: false, step: 'create', error: result.error, status: result.status }))
      return
    }
  }

  const check = await fetchLicenseServerProgram(TEST_CODE)
  const list = await fetchLicenseServerPrograms(true)
  const inList = list.programs.some((p) => p.appCode === TEST_CODE)

  console.log(
    JSON.stringify({
      ok: Boolean(check.program?.isActive),
      configured: true,
      created,
      programActive: check.program?.isActive === true,
      inActiveList: inList,
      hardcodedWhitelistRequired: false,
    }),
  )
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }))
  process.exit(1)
})
