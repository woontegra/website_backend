import assert from 'node:assert/strict'
import test from 'node:test'
import {
  desktopPurchaseMayCreateLicense,
  publicDesktopPurchaseQuote,
} from './bhDesktopPurchaseQuote'
import { selectDesktopYearlyOffer } from './bhDesktopYearlyOffer'

test('macOS yıllık teklif 15.000 TL, 1 yıl ve 1 cihazdır', () => {
  const offer = selectDesktopYearlyOffer({ data: { price: 2_000_000, priceMonthly: 200_000 } }, 'MACOS')
  assert.deepEqual(offer, {
    platform: 'MACOS',
    priceKurus: 1_500_000,
    licenseDays: 365,
    maxDevices: 1,
  })
})

test('masaüstü teklif SaaS 20.000 / 2.000 fiyatını kullanmaz', () => {
  const offer = selectDesktopYearlyOffer(
    {
      data: {
        price: 2_000_000,
        priceMonthly: 200_000,
        windowsPriceYearly: 1_500_000,
        windowsLicenseDays: 365,
        windowsDeviceLimit: 1,
      },
    },
    'WINDOWS',
  )
  assert.deepEqual(offer, {
    platform: 'WINDOWS',
    priceKurus: 1_500_000,
    licenseDays: 365,
    maxDevices: 1,
  })
})

test('doğrulanmış token çıktısında e-posta ve deviceHash yoktur', () => {
  const quote = publicDesktopPurchaseQuote(
    {
      success: true,
      appCode: 'BILIRKISI_DESKTOP',
      platform: 'WINDOWS',
      purpose: 'FIRST_PURCHASE',
      emailNormalized: 'secret@example.com',
      deviceHash: 'ab'.repeat(32),
    },
    { platform: 'WINDOWS', priceKurus: 1_500_000, licenseDays: 365, maxDevices: 1 },
  )
  assert.equal(quote?.priceKurus, 1_500_000)
  assert.equal(JSON.stringify(quote).includes('secret@example.com'), false)
  assert.equal(JSON.stringify(quote).includes('ab'.repeat(32)), false)
})

test('başka ürün veya platform tokenı teklife dönmez', () => {
  const offer = { platform: 'WINDOWS' as const, priceKurus: 1_500_000, licenseDays: 365, maxDevices: 1 }
  assert.equal(
    publicDesktopPurchaseQuote({ success: true, appCode: 'MUVEKKIL_KASA_DESKTOP', platform: 'WINDOWS', purpose: 'FIRST_PURCHASE' }, offer),
    null,
  )
  assert.equal(
    publicDesktopPurchaseQuote({ success: true, appCode: 'BILIRKISI_DESKTOP', platform: 'MACOS', purpose: 'FIRST_PURCHASE' }, offer),
    null,
  )
})

test('ödeme onaylanmadan lisans oluşturulmaz', () => {
  assert.equal(desktopPurchaseMayCreateLicense('PENDING'), false)
  assert.equal(desktopPurchaseMayCreateLicense('FAILED'), false)
  assert.equal(desktopPurchaseMayCreateLicense('PAID'), true)
})
