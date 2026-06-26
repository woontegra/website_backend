/**
 * Dinamik lisans program akışı — format doğrulama (DB/API gerektirmez).
 */
import { isValidLicenseAppCodeFormat, normalizeLicenseAppCodeInput } from '../src/lib/licenseAppCode.ts'

const cases: Array<[string, boolean]> = [
  ['MUVEKKIL_KASA_DESKTOP', true],
  ['TEST_DYNAMIC_DESKTOP', true],
  ['WOONTEGRA_ISLETME_KASASI', true],
  ['invalid-code', false],
  ['lowercase', false],
  ['', false],
]

let ok = true
for (const [raw, expected] of cases) {
  const normalized = normalizeLicenseAppCodeInput(raw)
  const valid = isValidLicenseAppCodeFormat(normalized)
  if (valid !== expected) {
    ok = false
    console.error('FAIL', raw, 'expected', expected, 'got', valid)
  }
}

if (!ok) process.exit(1)
console.log(JSON.stringify({ ok: true, checked: cases.length }))
