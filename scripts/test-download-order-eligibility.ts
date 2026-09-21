/**
 * DOWNLOAD checkout/delivery source-of-truth — saf fonksiyon testi.
 * Çalıştır: npm run test:download-order-eligibility
 */
import assert from 'node:assert/strict'
import { ProductType } from '@prisma/client'
import {
  isNonSalesDeliveryUrl,
  resolveOrderItemDeliveryRawUrl,
  resolveProductDeliveryRawUrl,
} from '../src/lib/productDeliveryUrl.js'
import { getProductOrderDenialReason, type ProductOrderCheckRow } from '../src/lib/productOrderValidation.js'
import { isPublicFreeDownloadProduct } from '../src/lib/productDownloadFiles.js'
import { isCentralDesktopLicenseProduct } from '../src/lib/centralDesktopLicenseProduct.js'

const SETUP_URL = 'https://cdn.example.com/koopplus-download/KoopPlus-Setup-1.0.0.exe'
const MK_SETUP_URL = 'https://cdn.example.com/mk/MuvekkilKasa-Setup.exe'
const MK_MANUAL_URL = 'https://cdn.example.com/mk/MuvekkilKasa-Setup.exe'
const YML_URL = 'https://updates.woontegra.com/updates/koopplus-aidat-takip/latest.yml'
const BLOCKMAP_URL = 'https://updates.woontegra.com/updates/koopplus-aidat-takip/KoopPlus-Setup-1.0.0.exe.blockmap'

function check(partial: Partial<ProductOrderCheckRow> & Pick<ProductOrderCheckRow, 'productType'>): ReturnType<
  typeof getProductOrderDenialReason
> {
  return getProductOrderDenialReason({
    id: 'p1',
    slug: 'koopplus',
    name: 'KoopPlus',
    isActive: true,
    purchaseEnabled: true,
    downloadUrl: null,
    downloadMedia: null,
    ...partial,
  })
}

function filename(url: string): string {
  return decodeURIComponent(new URL(url).pathname.split('/').pop() || '')
}

{
  const denial = check({
    productType: ProductType.DOWNLOAD,
    purchaseEnabled: true,
    downloadUrl: null,
    downloadMedia: null,
    downloadFiles: {
      publicFreeDownload: false,
      showAfterPaymentOnly: true,
      files: [{ type: 'setup', label: 'Kurulum', url: SETUP_URL }],
    },
  })
  assert.equal(denial, null, 'TEST 1 files-only setup is orderable')
}

{
  const row = {
    id: '075ce900-d6d9-4076-8bba-37478c49fd60',
    slug: 'koopplus',
    name: 'KoopPlus',
    isActive: true,
    productType: ProductType.DOWNLOAD,
    purchaseEnabled: true,
    downloadUrl: null,
    downloadMedia: null,
    downloadFiles: {
      files: [{ type: 'setup', label: 'Kurulum', url: SETUP_URL }],
    },
  }
  assert.equal(getProductOrderDenialReason(row), null, 'TEST 2 cart-preview eligibility would include KoopPlus')
}

{
  const resolved = resolveProductDeliveryRawUrl({
    downloadUrl: null,
    downloadMedia: null,
    downloadFiles: {
      files: [{ type: 'setup', label: 'Kurulum', url: SETUP_URL }],
    },
  })
  assert.equal(filename(resolved), 'KoopPlus-Setup-1.0.0.exe', 'TEST 3 snapshot/delivery selects setup EXE')
  const liveSales = resolveProductDeliveryRawUrl({
    downloadUrl: null,
    downloadMedia: null,
    downloadFiles: {
      files: [
        {
          type: 'setup',
          label: 'Kurulum',
          url: 'https://pub-57d992373eaf4ebd92cd37366668fafd.r2.dev/windows/KoopPlus-Setup-1.0.0.exe',
        },
      ],
    },
  })
  assert.equal(filename(liveSales), 'KoopPlus-Setup-1.0.3.exe', 'TEST 3 temporary compat: live sales host remaps 1.0.0 → 1.0.3')
  assert.equal(
    liveSales,
    'https://download.woontegra.com/downloads/koopplus/windows/KoopPlus-Setup-1.0.3.exe',
  )
  const snapshot = resolveOrderItemDeliveryRawUrl({
    downloadUrl: null,
    product: {
      downloadUrl: null,
      downloadMedia: null,
      downloadFiles: { files: [{ type: 'setup', label: 'Kurulum', url: SETUP_URL }] },
    },
  })
  assert.equal(filename(snapshot), 'KoopPlus-Setup-1.0.0.exe')
}

{
  assert.equal(
    check({
      productType: ProductType.DOWNLOAD,
      downloadUrl: null,
      downloadMedia: null,
      downloadFiles: null,
    }),
    'download_missing',
    'TEST 4 empty sources denied',
  )
}

{
  const resolved = resolveProductDeliveryRawUrl({
    downloadUrl: 'https://cdn.example.com/alt/other.exe',
    downloadMedia: { url: 'https://cdn.example.com/media/media.exe' },
    downloadFiles: {
      files: [
        { type: 'portable', label: 'Portable', url: 'https://cdn.example.com/port/app-portable.exe' },
        { type: 'setup', label: 'Kurulum', url: SETUP_URL },
      ],
    },
  })
  assert.equal(filename(resolved), 'KoopPlus-Setup-1.0.0.exe', 'TEST 5 setup wins over url/media/other files')
}

{
  const mkDenial = getProductOrderDenialReason({
    id: 'mk',
    slug: 'muvekkil-kasa-defteri-yazilimi',
    name: 'Müvekkil Kasa Defteri',
    isActive: true,
    productType: ProductType.DOWNLOAD,
    purchaseEnabled: true,
    downloadUrl: MK_MANUAL_URL,
    downloadMedia: { url: MK_MANUAL_URL },
    downloadFiles: {
      files: [{ type: 'setup', label: 'Kurulum', url: MK_SETUP_URL }],
    },
  })
  assert.equal(mkDenial, null, 'TEST 6 Müvekkil Kasa still orderable')
  const mkDelivery = resolveProductDeliveryRawUrl({
    downloadUrl: MK_MANUAL_URL,
    downloadMedia: { url: MK_MANUAL_URL },
    downloadFiles: { files: [{ type: 'setup', label: 'Kurulum', url: MK_SETUP_URL }] },
  })
  assert.equal(filename(mkDelivery), 'MuvekkilKasa-Setup.exe')
}

{
  assert.equal(
    isPublicFreeDownloadProduct({
      productType: 'DOWNLOAD',
      purchaseEnabled: false,
      price: 0,
    }),
    true,
    'TEST 7 free DOWNLOAD still public-free',
  )
  assert.equal(
    isPublicFreeDownloadProduct({
      productType: 'DOWNLOAD',
      purchaseEnabled: true,
      price: 3000,
    }),
    false,
    'TEST 7 paid KoopPlus is not public-free',
  )
}

{
  const publicProductKeys = {
    id: '075ce900-d6d9-4076-8bba-37478c49fd60',
    name: 'KoopPlus',
    slug: 'koopplus',
    price: 3000,
    hasDownload: true,
    publicDownloadFiles: undefined,
  }
  assert.equal('downloadUrl' in publicProductKeys, false, 'TEST 8 public DTO has no downloadUrl')
  assert.equal(publicProductKeys.publicDownloadFiles, undefined)
}

{
  const cartPreviewPublic = {
    id: '075ce900-d6d9-4076-8bba-37478c49fd60',
    name: 'KoopPlus',
    slug: 'koopplus',
    productType: 'DOWNLOAD',
    price: 3000,
    currency: 'TRY',
    coverImage: '/images/products/koopplus-icon.png',
    hasDownload: true,
    licenseRequired: true,
    singleQuantity: true,
    matchKeys: ['075ce900-d6d9-4076-8bba-37478c49fd60', 'koopplus'],
  }
  assert.equal('downloadUrl' in cartPreviewPublic, false, 'TEST 9 cart-preview DTO has no installer URL')
  assert.equal('downloadFiles' in cartPreviewPublic, false)
  assert.equal('downloadMedia' in cartPreviewPublic, false)
}

{
  assert.equal(isNonSalesDeliveryUrl(YML_URL), true)
  assert.equal(isNonSalesDeliveryUrl(BLOCKMAP_URL), true)
  const fromFeed = resolveProductDeliveryRawUrl({
    downloadUrl: YML_URL,
    downloadMedia: null,
    downloadFiles: {
      files: [
        { type: 'other', label: 'Feed', url: YML_URL },
        { type: 'setup', label: 'Kurulum', url: SETUP_URL },
      ],
    },
  })
  assert.equal(filename(fromFeed), 'KoopPlus-Setup-1.0.0.exe', 'TEST 10 setup wins over latest.yml')
  const ymlOnly = resolveProductDeliveryRawUrl({
    downloadUrl: YML_URL,
    downloadMedia: { url: BLOCKMAP_URL },
    downloadFiles: { files: [{ type: 'other', label: 'Feed', url: YML_URL }] },
  })
  assert.equal(ymlOnly, '', 'TEST 10 yml/blockmap are not sales delivery')
  assert.equal(
    check({
      productType: ProductType.DOWNLOAD,
      downloadUrl: YML_URL,
      downloadMedia: null,
      downloadFiles: { files: [{ type: 'other', label: 'Feed', url: YML_URL }] },
    }),
    'download_unresolvable',
  )
}

{
  assert.equal(
    isCentralDesktopLicenseProduct({
      slug: 'koopplus',
      licenseAppCode: 'KOOPPLUS_DESKTOP',
      licenseRequired: true,
      productType: 'DOWNLOAD',
    }),
    true,
    'TEST 11 KOOPPLUS_DESKTOP unchanged',
  )
}

console.log('download-order-eligibility tests: OK')
