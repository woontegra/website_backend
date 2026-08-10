/**
 * Masaüstü lisans uzatma tarih kuralları — saf fonksiyon testi.
 * Çalıştır: npm run test:desktop-license-renewal
 */
import assert from 'node:assert/strict'
import {
  addDaysFromBase,
  computeDesktopExtensionBaseDate,
  estimateDesktopRenewalEndDate,
} from '../src/lib/desktopLicenseExtend.js'

function localDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0)
}

function localYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Aktif lisans: mevcut bitişten uzar
{
  const current = localDate('2027-06-21')
  const base = computeDesktopExtensionBaseDate(current, localDate('2026-08-10'))
  assert.equal(localYmd(base), '2027-06-21')
  const next = estimateDesktopRenewalEndDate({ currentExpiresAt: current, renewalDays: 365, ref: localDate('2026-08-10') })
  assert.equal(localYmd(next), '2028-06-20')
}

// Süresi geçmiş: bugünden uzar
{
  const current = localDate('2026-01-01')
  const ref = localDate('2026-08-10')
  const base = computeDesktopExtensionBaseDate(current, ref)
  assert.equal(localYmd(base), '2026-08-10')
  const next = addDaysFromBase(base, 30)
  assert.equal(localYmd(next), '2026-09-09')
}

// eslint-disable-next-line no-console
console.info('[test:desktop-license-renewal] all assertions passed')
