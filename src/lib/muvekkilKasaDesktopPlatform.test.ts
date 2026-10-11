import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MUVEKKIL_KASA_DESKTOP_MACOS_SLUG,
  MUVEKKIL_KASA_DESKTOP_WINDOWS_SLUG,
  isDesktopRenewalOrderPlatformAllowed,
  muvekkilKasaDesktopOrderLicenseExtras,
  muvekkilKasaDesktopPlatformForSlug,
  selectDesktopRenewalCatalogProduct,
} from './muvekkilKasaDesktopPlatform'
import {
  isMuvekkilKasaDesktopCentralLicenseProduct,
  isPublicMacosSetupInstallerUrl,
  publicMuvekkilKasaDesktopInstallerFiles,
} from './muvekkilKasaDesktopProduct'
import { resolveOrderItemDeliveryRawUrl, resolveProductDeliveryRawUrl } from './productDeliveryUrl'
import { resolveMailDownloadHref } from './mailDeliveryUrl'
import { buildResendDeliveryMailLines } from './resendDeliveryEmail'

const exeUrl = 'https://download.example.test/muvekkil-kasa/Woontegra-Muvekkil-Kasa-Defteri-Setup-0.1.14.exe'
const dmgUrl = 'https://download.example.test/muvekkil-kasa/Woontegra-Muvekkil-Kasa-Defteri-0.1.14-arm64.dmg'

function setupFiles(...urls: string[]) {
  return {
    files: urls.map((url, index) => ({ label: `Kurulum ${index + 1}`, url, type: 'setup' })),
  }
}

test('MK Desktop slug platform eşlemesi', () => {
  assert.equal(muvekkilKasaDesktopPlatformForSlug(MUVEKKIL_KASA_DESKTOP_WINDOWS_SLUG), 'WINDOWS')
  assert.equal(muvekkilKasaDesktopPlatformForSlug('muvekkil-kasa-defteri-desktop'), 'WINDOWS')
  assert.equal(muvekkilKasaDesktopPlatformForSlug(MUVEKKIL_KASA_DESKTOP_MACOS_SLUG), 'MACOS')
  assert.equal(muvekkilKasaDesktopPlatformForSlug('  Muvekkil-Kasa-Defteri-MacOS '), 'MACOS')
  assert.equal(muvekkilKasaDesktopPlatformForSlug('muvekkil-kasa-defteri-web-tabanli'), null)
  assert.equal(muvekkilKasaDesktopPlatformForSlug(null), null)
})

test('MK Desktop sipariş lisansı platformu ürün slug’ından gelir; eski sipariş Windows kalır', () => {
  const extras = (productSlug: string | null) =>
    muvekkilKasaDesktopOrderLicenseExtras({ appCode: 'MUVEKKIL_KASA_DESKTOP', productSlug })
  assert.deepEqual(extras(MUVEKKIL_KASA_DESKTOP_WINDOWS_SLUG), { platform: 'WINDOWS' })
  assert.deepEqual(extras(MUVEKKIL_KASA_DESKTOP_MACOS_SLUG), { platform: 'MACOS' })
  assert.deepEqual(extras('muvekkil-kasa-defteri-desktop'), { platform: 'WINDOWS' })
  assert.deepEqual(extras(null), { platform: 'WINDOWS' })
  assert.deepEqual(extras('eski-bilinmeyen-slug'), { platform: 'WINDOWS' })
})

test('MK yenileme bağlantısı lisans platformunun ürününe gider', () => {
  // updatedAt desc: macOS ürünü en son güncellenmiş olsa da Windows lisansı Windows ürününe gider.
  const products = [{ slug: MUVEKKIL_KASA_DESKTOP_MACOS_SLUG }, { slug: MUVEKKIL_KASA_DESKTOP_WINDOWS_SLUG }]
  const pick = (platform: 'WINDOWS' | 'MACOS' | null, list = products, appCode = 'MUVEKKIL_KASA_DESKTOP') =>
    selectDesktopRenewalCatalogProduct({ appCode, platform, products: list })?.slug ?? null
  assert.equal(pick('WINDOWS'), MUVEKKIL_KASA_DESKTOP_WINDOWS_SLUG)
  assert.equal(pick('MACOS'), MUVEKKIL_KASA_DESKTOP_MACOS_SLUG)
  assert.equal(pick('WINDOWS', [...products].reverse()), MUVEKKIL_KASA_DESKTOP_WINDOWS_SLUG)
  assert.equal(pick('MACOS', [...products].reverse()), MUVEKKIL_KASA_DESKTOP_MACOS_SLUG)
  assert.equal(pick('MACOS', [{ slug: MUVEKKIL_KASA_DESKTOP_WINDOWS_SLUG }]), null, 'macOS ürünü yoksa Windows ürününe düşmez')
  assert.equal(pick('WINDOWS', [{ slug: 'muvekkil-kasa-defteri-desktop' }]), 'muvekkil-kasa-defteri-desktop')
  assert.equal(pick(null), MUVEKKIL_KASA_DESKTOP_MACOS_SLUG, 'platform bilinmiyorsa önceki davranış korunur')
  assert.equal(pick('WINDOWS', [{ slug: 'aktuerya-hesaplama' }], 'AKTUERYA_DESKTOP'), 'aktuerya-hesaplama')
  assert.equal(pick(null, []), null)
})

test('MK yenileme siparişi yalnız lisans platformunun ürünüyle bağlanır', () => {
  const allowed = (sessionPlatform: string | null, productSlugs: (string | null)[], appCode = 'MUVEKKIL_KASA_DESKTOP') =>
    isDesktopRenewalOrderPlatformAllowed({ appCode, sessionPlatform, productSlugs })
  assert.equal(allowed('WINDOWS', [MUVEKKIL_KASA_DESKTOP_WINDOWS_SLUG]), true)
  assert.equal(allowed('WINDOWS', ['muvekkil-kasa-defteri-desktop']), true)
  assert.equal(allowed('WINDOWS', [MUVEKKIL_KASA_DESKTOP_MACOS_SLUG]), false)
  assert.equal(allowed('MACOS', [MUVEKKIL_KASA_DESKTOP_MACOS_SLUG]), true)
  assert.equal(allowed('MACOS', [MUVEKKIL_KASA_DESKTOP_WINDOWS_SLUG]), false)
  assert.equal(allowed('MACOS', [null]), false, 'slug bilinmeyen kalem platformu karşılamaz')
  assert.equal(allowed('WINDOWS', []), false)
  assert.equal(allowed(null, [MUVEKKIL_KASA_DESKTOP_MACOS_SLUG]), true, 'eski oturumda platform varsayılmaz')
  assert.equal(allowed(null, [MUVEKKIL_KASA_DESKTOP_WINDOWS_SLUG]), true)
  assert.equal(allowed('WINDOWS', ['bilirkisi-hesap'], 'BILIRKISI_DESKTOP'), true, 'MK dışı ürünler etkilenmez')
})

test('MK dışındaki ürünlere platform eklenmez', () => {
  for (const appCode of ['BILIRKISI_DESKTOP', 'AKTUERYA_DESKTOP', 'AKTUERYA_SAAS', 'MUVEKKIL_KASA_SAAS', 'KOOPPLUS_DESKTOP']) {
    assert.deepEqual(
      muvekkilKasaDesktopOrderLicenseExtras({ appCode, productSlug: MUVEKKIL_KASA_DESKTOP_MACOS_SLUG }),
      {},
      appCode,
    )
  }
})

test('macOS ürünü yalnızca public https .dmg kurulumunu yayınlar', () => {
  assert.equal(isPublicMacosSetupInstallerUrl(dmgUrl), true)
  assert.equal(isPublicMacosSetupInstallerUrl(exeUrl), false)
  assert.equal(isPublicMacosSetupInstallerUrl(dmgUrl.replace('https:', 'http:')), false)
  assert.equal(isPublicMacosSetupInstallerUrl('https://download.example.test/updates/latest-mac.yml'), false)

  const mac = publicMuvekkilKasaDesktopInstallerFiles({
    slug: MUVEKKIL_KASA_DESKTOP_MACOS_SLUG,
    licenseAppCode: 'MUVEKKIL_KASA_DESKTOP',
    downloadFiles: setupFiles(exeUrl, dmgUrl),
  })
  assert.equal(mac.length, 1)
  assert.equal(mac[0]!.downloadPath, dmgUrl)
  assert.match(mac[0]!.filename, /\.dmg$/)

  const macWithoutDmg = publicMuvekkilKasaDesktopInstallerFiles({
    slug: MUVEKKIL_KASA_DESKTOP_MACOS_SLUG,
    licenseAppCode: 'MUVEKKIL_KASA_DESKTOP',
    downloadFiles: setupFiles(exeUrl),
  })
  assert.deepEqual(macWithoutDmg, [])
})

test('Windows ürünü önceki gibi yalnızca .exe kurulumunu yayınlar', () => {
  const win = publicMuvekkilKasaDesktopInstallerFiles({
    slug: MUVEKKIL_KASA_DESKTOP_WINDOWS_SLUG,
    licenseAppCode: 'MUVEKKIL_KASA_DESKTOP',
    downloadFiles: setupFiles(dmgUrl, exeUrl),
  })
  assert.equal(win.length, 1)
  assert.equal(win[0]!.downloadPath, exeUrl)

  const winDmgOnly = publicMuvekkilKasaDesktopInstallerFiles({
    slug: MUVEKKIL_KASA_DESKTOP_WINDOWS_SLUG,
    licenseAppCode: 'MUVEKKIL_KASA_DESKTOP',
    downloadFiles: setupFiles(dmgUrl),
  })
  assert.deepEqual(winDmgOnly, [])
})

test('macOS ürünü merkezi MK Desktop lisans ürünü olarak tanınır', () => {
  assert.equal(
    isMuvekkilKasaDesktopCentralLicenseProduct({
      slug: MUVEKKIL_KASA_DESKTOP_MACOS_SLUG,
      licenseAppCode: 'MUVEKKIL_KASA_DESKTOP',
      licenseRequired: true,
      productType: 'DOWNLOAD',
    }),
    true,
  )
  assert.equal(
    isMuvekkilKasaDesktopCentralLicenseProduct({
      slug: MUVEKKIL_KASA_DESKTOP_MACOS_SLUG,
      licenseAppCode: null,
      licenseRequired: true,
      productType: 'DOWNLOAD',
    }),
    true,
  )
})

test('sipariş teslimatı ve e-posta bağlantısı .dmg adresini korur', () => {
  const product = { downloadUrl: null, downloadMedia: null, downloadFiles: setupFiles(dmgUrl) }
  assert.equal(resolveProductDeliveryRawUrl(product), dmgUrl)
  assert.equal(resolveOrderItemDeliveryRawUrl({ downloadUrl: dmgUrl, product }), dmgUrl)
  assert.equal(resolveOrderItemDeliveryRawUrl({ downloadUrl: dmgUrl, product: null }), dmgUrl)
  assert.equal(resolveMailDownloadHref(dmgUrl), dmgUrl)
})

test('yeniden gönderilen e-posta MK macOS .dmg bağlantısını ve mevcut lisansı korur', () => {
  const built = buildResendDeliveryMailLines(
    {
      status: 'PAID',
      orderNo: 'WT-MK-MAC',
      customerEmail: 'musteri@example.test',
      desktopPurchasePlatform: null,
      desktopLicenseNewEndDate: null,
      paymentConfirmedAt: new Date('2026-10-10T20:00:00.000Z'),
      hasSuccessfulPayment: true,
      items: [
        {
          id: 'item-mac',
          productName: 'Müvekkil Kasa Defteri macOS',
          productId: 'product-mac',
          downloadUrl: dmgUrl,
          productType: 'DOWNLOAD',
          productSlug: MUVEKKIL_KASA_DESKTOP_MACOS_SLUG,
          licenseServerLicenseKey: 'WTG-MK-MAC',
          licenseServerActivationPasswordPending: null,
          saasMembershipId: null,
        },
      ],
      memberships: [],
      licenses: [],
    },
    { windows: null, macos: null },
  )
  assert.equal(built.ok, true)
  if (!built.ok) return
  assert.equal(built.lines.length, 1)
  assert.equal(built.lines[0]!.downloadUrl, dmgUrl)
  assert.equal(built.lines[0]!.licenses?.[0]?.licenseKey, 'WTG-MK-MAC')
  assert.equal(built.lines[0]!.saas, undefined)
})
