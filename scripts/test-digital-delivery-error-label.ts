import assert from 'node:assert/strict'
import { formatDigitalDeliveryLicenseError } from '../src/lib/digitalDeliveryErrorLabel.js'
import { isMuvekkilKasaSaasProduct } from '../src/lib/muvekkilKasaSaasProduct.js'

function testSaasErrorLabel() {
  const msg = formatDigitalDeliveryLicenseError(
    { slug: 'muvekkil-kasa-defteri-web-tabanli', licenseAppCode: 'MUVEKKIL_KASA_SAAS' },
    'test hata',
  )
  assert.match(msg, /Müvekkil Kasa SaaS üyeliği oluşturulamadı/)
  assert.doesNotMatch(msg, /Merkezi lisans/)
}

function testDesktopErrorLabel() {
  const msg = formatDigitalDeliveryLicenseError(
    { slug: 'muvekkil-kasa-defteri-yazilimi', licenseAppCode: 'MUVEKKIL_KASA' },
    'test hata',
  )
  assert.match(msg, /Merkezi lisans oluşturulamadı/)
}

function testMkSaasProductDetection() {
  assert.equal(
    isMuvekkilKasaSaasProduct({ slug: 'muvekkil-kasa-defteri-web-tabanli', licenseAppCode: null }),
    true,
  )
  assert.equal(
    isMuvekkilKasaSaasProduct({ slug: 'muvekkil-kasa-defteri-yazilimi', licenseAppCode: null }),
    false,
  )
}

function main() {
  testSaasErrorLabel()
  testDesktopErrorLabel()
  testMkSaasProductDetection()
  console.log('digitalDeliveryErrorLabel tests: OK')
}

main()
