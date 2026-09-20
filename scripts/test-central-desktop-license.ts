/**
 * Generic desktop renewal eligibility — saf fonksiyon testi.
 * Çalıştır: npm run test:central-desktop-license
 */
import assert from 'node:assert/strict'
import {
  buildDesktopWebsiteRenewLicensePayload,
  desktopRenewalPurchasePath,
  isCentralDesktopLicenseProduct,
  isDesktopRenewalOpenSuccessful,
  isKnownSaasLicenseAppCode,
} from '../src/lib/centralDesktopLicenseProduct.js'
import { isMuvekkilKasaDesktopCentralLicenseProduct } from '../src/lib/muvekkilKasaDesktopProduct.js'

function eligible(partial: Parameters<typeof isCentralDesktopLicenseProduct>[0]) {
  return isCentralDesktopLicenseProduct(partial)
}

{
  assert.equal(
    eligible({
      slug: 'muvekkil-kasa-defteri-yazilimi',
      licenseAppCode: 'MUVEKKIL_KASA_DESKTOP',
      licenseRequired: true,
      productType: 'DOWNLOAD',
      isActive: true,
    }),
    true,
    'MK desktop renewal still eligible',
  )
}

{
  assert.equal(
    eligible({
      slug: 'koopplus',
      licenseAppCode: 'KOOPPLUS_DESKTOP',
      licenseRequired: true,
      productType: 'DOWNLOAD',
      isActive: true,
    }),
    true,
    'KOOPPLUS_DESKTOP renewal eligible',
  )
}

{
  assert.equal(
    eligible({
      slug: 'muvekkil-kasa-defteri-web-tabanli',
      licenseAppCode: 'MUVEKKIL_KASA_SAAS',
      licenseRequired: true,
      productType: 'SAAS',
    }),
    false,
    'SaaS product cannot enter desktop renewal',
  )
  assert.equal(isKnownSaasLicenseAppCode('MUVEKKIL_KASA_SAAS'), true)
}

{
  assert.equal(
    eligible({
      slug: 'sifre-kasasi',
      licenseAppCode: 'SIFRE_KASASI_DESKTOP',
      licenseRequired: false,
      productType: 'DOWNLOAD',
    }),
    false,
    'licenseRequired=false cannot renew',
  )
}

{
  assert.equal(
    eligible({
      slug: 'koopplus',
      licenseAppCode: '',
      licenseRequired: true,
      productType: 'DOWNLOAD',
    }),
    false,
    'empty appCode rejected for non-MK products',
  )
  assert.equal(
    eligible({
      slug: 'koopplus',
      licenseAppCode: 'bad-code',
      licenseRequired: true,
      productType: 'DOWNLOAD',
    }),
    false,
    'invalid appCode rejected',
  )
}

{
  assert.equal(
    isMuvekkilKasaDesktopCentralLicenseProduct({
      slug: 'muvekkil-kasa-defteri-yazilimi',
      licenseRequired: true,
      productType: 'DOWNLOAD',
    }),
    true,
    'MK slug fallback still works',
  )
}

{
  const key = 'EXISTING-LICENSE-KEY-1'
  const payload = buildDesktopWebsiteRenewLicensePayload({
    orderNo: 'W-100',
    licenseKey: key,
    licenseId: 'lic-1',
    appCode: 'KOOPPLUS_DESKTOP',
    licenseDays: 365,
  })
  assert.equal(payload.licenseKey, key, 'renewal keeps the same licenseKey')
  assert.equal(payload.licenseDays, 365)
  assert.equal(payload.appCode, 'KOOPPLUS_DESKTOP')
  assert.notEqual(payload.licenseKey, 'NEW-KEY')
}

{
  assert.equal(isDesktopRenewalOpenSuccessful({ licenseId: 'lic-1' }), true)
  assert.equal(isDesktopRenewalOpenSuccessful({}), false, 'trial/system open failure is not eligible')
}

{
  assert.equal(desktopRenewalPurchasePath('koopplus'), '/yazilimlar/koopplus')
  assert.equal(
    desktopRenewalPurchasePath('muvekkil-kasa-defteri-yazilimi'),
    '/yazilimlar/muvekkil-kasa-defteri-yazilimi',
  )
}

// eslint-disable-next-line no-console
console.info('[test:central-desktop-license] all assertions passed')
