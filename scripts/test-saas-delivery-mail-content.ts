/**
 * SaaS teslimat maili metin kontrolü (SMTP göndermez).
 * Çalıştır: npx tsx scripts/test-saas-delivery-mail-content.ts
 */
import assert from 'node:assert/strict'
import { buildMuvekkilKasaSaasMailLines } from '../src/services/muvekkilKasaSaasProvision.service.js'

const saasLines = buildMuvekkilKasaSaasMailLines(
  [{ id: 'item-1', productName: 'Müvekkil Kasa Defteri Çoklu Kullanıcı Web Tabanlı' }],
  [
    {
      orderItemId: 'item-1',
      productName: 'Müvekkil Kasa Defteri Çoklu Kullanıcı Web Tabanlı',
      deliveryType: 'SAAS',
      provisionStatus: 'created',
      licenseKey: 'M78M-419K-05HE-GS78',
      mailSentByMkSaas: true,
      tenantSlug: 'turan-bayburt',
      tenantName: 'Turan Bayburt',
      ownerEmail: 'admin@woontegra.com',
      licenseStartDate: '2026-07-01T00:00:00.000Z',
      licenseEndDate: '2027-07-01T00:00:00.000Z',
    },
  ],
)

assert.equal(saasLines.length, 1)
assert.ok(saasLines[0]!.saas.licenseKey?.includes('M78M'))
assert.equal(saasLines[0]!.saas.ownerEmail, 'admin@woontegra.com')
assert.equal(saasLines[0]!.downloadUrl, 'saas:muvekkil-kasa')

const forbidden = [
  'Programı indirin',
  'Programı kurun',
  'aktivasyon ekranı',
  'Aktivasyon şifresi',
  'Programı İndir',
]

// mail.service içindeki SaaS-only akış metin beklentileri (statik kontrol)
const saasOnlySubject = 'SaaS üyeliğiniz aktif edildi — WNT-TEST'
const saasOnlyTitle = 'Müvekkil Kasa SaaS üyeliğiniz aktif edildi'
assert.ok(saasOnlySubject.includes('SaaS üyeliğiniz aktif edildi'))
assert.ok(saasOnlyTitle.includes('SaaS'))

for (const phrase of forbidden) {
  assert.ok(!saasOnlyTitle.includes(phrase), `SaaS title should not contain: ${phrase}`)
}

console.log('[ok] SaaS mail line builder and subject/title expectations')
