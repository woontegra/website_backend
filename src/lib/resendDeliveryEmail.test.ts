import test from 'node:test'
import assert from 'node:assert/strict'
import { buildResendDeliveryMailLines, deliveryResendBlockReason, type ResendOrderInput } from './resendDeliveryEmail'

const windowsUrl = 'https://download.example.test/downloads/bilirkisi-hesap/windows/Bilirkisi-Hesap-Setup-3.6.2.exe'
const macosUrl = 'https://download.example.test/downloads/bilirkisi-hesap/macos/Bilirkisi-Hesap-3.6.2.dmg'

function desktopOrder(overrides: Partial<ResendOrderInput> = {}): ResendOrderInput {
  return {
    status: 'PAID',
    orderNo: 'WTBD-TEST',
    customerEmail: 'musteri@example.test',
    desktopPurchasePlatform: 'WINDOWS',
    desktopLicenseNewEndDate: null,
    paymentConfirmedAt: new Date('2026-10-07T07:26:07.345Z'),
    hasSuccessfulPayment: true,
    items: [
      {
        id: 'item-1',
        productName: 'Bilirkişi Hesap',
        productId: 'product-1',
        downloadUrl: 'license:BILIRKISI_DESKTOP',
        productType: 'DOWNLOAD',
        productSlug: 'bilirkisi-hesap',
        licenseServerLicenseKey: 'WTG-TEST-KEY',
        licenseServerActivationPasswordPending: null,
        saasMembershipId: null,
      },
    ],
    memberships: [],
    licenses: [],
    ...overrides,
  }
}

test('bekleyen ve başarısız ödemede yeniden gönderim kapalıdır', () => {
  assert.match(deliveryResendBlockReason({ status: 'PENDING', paymentConfirmedAt: null, hasSuccessfulPayment: false }) ?? '', /onaylanmadığı/)
  assert.match(deliveryResendBlockReason({ status: 'FAILED', paymentConfirmedAt: null, hasSuccessfulPayment: false }) ?? '', /Başarısız/)
  assert.equal(deliveryResendBlockReason({ status: 'PAID', paymentConfirmedAt: null, hasSuccessfulPayment: true }), null)
  assert.equal(
    deliveryResendBlockReason({
      status: 'PROCESSING',
      paymentConfirmedAt: null,
      hasSuccessfulPayment: false,
    }),
    'Yalnız ödenmiş ve teslim edilebilir siparişlerde e-posta yeniden gönderilir.',
  )
})

test('Bilirkişi Desktop yeniden gönderimi mevcut anahtar, platform, süre ve güncel Windows bağlantısını kullanır', () => {
  const built = buildResendDeliveryMailLines(desktopOrder(), { windows: windowsUrl, macos: null })
  assert.equal(built.ok, true)
  if (!built.ok) return
  const line = built.lines[0]!
  assert.equal(line.licenses?.[0]?.licenseKey, 'WTG-TEST-KEY')
  assert.equal(line.licenses?.[0]?.activationPassword, undefined)
  assert.equal(line.windowsInstallerUrl, windowsUrl)
  assert.equal(line.purchaseInstaller, undefined)
  assert.equal(line.saas, undefined)
  assert.deepEqual(
    line.deliveryFacts?.map((fact) => fact.label),
    ['Platform', 'Lisans süresi', 'Aktivasyon bilgisi'],
  )
  assert.equal(line.deliveryFacts?.[0]?.value, 'Windows')
  assert.equal(line.deliveryFacts?.[1]?.value, '365 gün')
})

test('kayıtlı aktivasyon şifresi varsa yeni şifre üretilmeden eklenir', () => {
  const order = desktopOrder()
  order.items[0]!.licenseServerActivationPasswordPending = 'saklanan-sifre'
  const built = buildResendDeliveryMailLines(order, { windows: windowsUrl, macos: null })
  assert.equal(built.ok, true)
  if (!built.ok) return
  assert.equal(built.lines[0]?.licenses?.[0]?.activationPassword, 'saklanan-sifre')
  assert.equal(built.lines[0]?.deliveryFacts?.some((fact) => fact.label === 'Aktivasyon bilgisi'), false)
})

test('Windows bağlantısı yoksa mail satırı üretilmez', () => {
  const built = buildResendDeliveryMailLines(desktopOrder(), { windows: null, macos: macosUrl })
  assert.equal(built.ok, false)
  if (built.ok) return
  assert.match(built.message, /Windows kurulum/)
})

test('macOS siparişi Windows bağlantısı yerine güncel macOS bağlantısını kullanır', () => {
  const order = desktopOrder({ desktopPurchasePlatform: 'MACOS', desktopLicenseNewEndDate: new Date('2027-10-07T00:00:00.000Z') })
  const built = buildResendDeliveryMailLines(order, { windows: windowsUrl, macos: macosUrl })
  assert.equal(built.ok, true)
  if (!built.ok) return
  assert.equal(built.lines[0]?.windowsInstallerUrl, undefined)
  assert.equal(built.lines[0]?.purchaseInstaller?.url, macosUrl)
  assert.equal(built.lines[0]?.purchaseInstaller?.label, 'macOS Kurulumunu İndir')
  assert.match(built.lines[0]?.deliveryFacts?.[1]?.value ?? '', /2027/)
})

test('SaaS yeniden gönderimi masaüstü kurulum bilgisi eklemez', () => {
  const built = buildResendDeliveryMailLines(
    {
      status: 'PAID',
      orderNo: 'WT-SAAS',
      customerEmail: 'saas@example.test',
      desktopPurchasePlatform: null,
      desktopLicenseNewEndDate: null,
      paymentConfirmedAt: null,
      hasSuccessfulPayment: true,
      items: [
        {
          id: 'saas-item',
          productName: 'Müvekkil Kasa',
          productId: 'saas-product',
          downloadUrl: 'saas:muvekkil-kasa',
          productType: 'SAAS',
          productSlug: 'muvekkil-kasa-defteri-web-tabanli',
          licenseServerLicenseKey: null,
          licenseServerActivationPasswordPending: null,
          saasMembershipId: 'membership-1',
        },
      ],
      memberships: [
        {
          id: 'membership-1',
          firstOrderId: 'WT-SAAS:saas-item',
          licenseKey: 'MK-KEY',
          ownerEmail: 'saas@example.test',
          tenantSlug: 'buro',
          licenseStartDate: new Date('2026-10-07T00:00:00.000Z'),
          licenseEndDate: new Date('2027-10-07T00:00:00.000Z'),
        },
      ],
      licenses: [],
    },
    { windows: windowsUrl, macos: macosUrl },
  )
  assert.equal(built.ok, true)
  if (!built.ok) return
  const line = built.lines[0]!
  assert.equal(line.downloadUrl, 'saas:muvekkil-kasa')
  assert.equal(line.saas?.licenseKey, 'MK-KEY')
  assert.equal(line.saas?.temporaryPassword, null)
  assert.equal(line.windowsInstallerUrl, undefined)
  assert.equal(line.purchaseInstaller, undefined)
  assert.equal(line.deliveryFacts, undefined)
  assert.equal(line.licenses, undefined)
})

test('katalog ürün tipi SAAS olsa da Bilirkişi masaüstü satırı SaaS mailine dönüşmez', () => {
  const order = desktopOrder()
  order.items[0]!.productType = 'SAAS'
  order.items[0]!.productSlug = 'bilirkisi-hesap'
  const built = buildResendDeliveryMailLines(order, { windows: windowsUrl, macos: null })
  assert.equal(built.ok, true)
  if (!built.ok) return
  assert.equal(built.lines[0]?.downloadUrl, 'license:BILIRKISI_DESKTOP')
  assert.equal(built.lines[0]?.saas, undefined)
  assert.equal(built.lines[0]?.windowsInstallerUrl, windowsUrl)
})

test('lisans anahtarı yoksa yeni anahtar üretilmez', () => {
  const order = desktopOrder()
  order.items[0]!.licenseServerLicenseKey = null
  const built = buildResendDeliveryMailLines(order, { windows: windowsUrl, macos: null })
  assert.equal(built.ok, false)
  if (built.ok) return
  assert.match(built.message, /Yeni lisans oluşturulmaz/)
})
