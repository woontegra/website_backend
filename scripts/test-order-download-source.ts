/**
 * Paid order download source + entitlement — saf fonksiyon testi.
 * Çalıştır: npm run test:order-download-source
 */
import assert from 'node:assert/strict'
import { ProductType } from '@prisma/client'
import {
  canonicalizeKoopPlusSalesInstallerUrl,
  KOOPPLUS_SALES_INSTALLER_FILENAME,
  KOOPPLUS_SALES_LEGACY_PUBLIC_HOST,
  KOOPPLUS_SALES_OBJECT_PREFIX,
  KOOPPLUS_SALES_PUBLIC_HOST,
  KOOPPLUS_SALES_PUBLIC_URL,
} from '../src/lib/koopplusSalesInstaller.js'
import {
  classifyDownloadStreamError,
  resolveDownloadSourceFromRawUrl,
} from '../src/lib/downloadStream.js'
import { signOrderDownloadToken, verifyOrderDownloadToken } from '../src/lib/orderDownloadToken.js'
import { isPublicFreeDownloadProduct } from '../src/lib/productDownloadFiles.js'
import { resolveOrderItemDeliveryRawUrl, resolveProductDeliveryRawUrl } from '../src/lib/productDeliveryUrl.js'
import { isAllowlistedRemoteDownloadHost, isBlockedDownloadHostname } from '../src/lib/remoteHttpsDownload.js'
import { decideOrderDownloadAccess } from '../src/services/orderProductDownload.service.js'

if (!String(process.env.JWT_SECRET ?? '').trim() && !String(process.env.DOWNLOAD_TOKEN_SECRET ?? '').trim()) {
  process.env.JWT_SECRET = 'woontegra-local-test-jwt-secret'
}

function salesUrl(filename: string): string {
  return `https://${KOOPPLUS_SALES_PUBLIC_HOST}/${KOOPPLUS_SALES_OBJECT_PREFIX}${filename}`
}

const SALES_V100 = `https://${KOOPPLUS_SALES_LEGACY_PUBLIC_HOST}/windows/KoopPlus-Setup-1.0.0.exe`
const SALES_V103 = salesUrl('KoopPlus-Setup-1.0.3.exe')
const SALES_V104 = salesUrl('KoopPlus-Setup-1.0.4.exe')
const SALES_V105 = salesUrl('KoopPlus-Setup-1.0.5.exe')
const LEGACY_V103 = `https://${KOOPPLUS_SALES_LEGACY_PUBLIC_HOST}/windows/${KOOPPLUS_SALES_INSTALLER_FILENAME}`
const UPDATE_EXE = 'https://updates.woontegra.com/updates/koopplus-aidat-takip/KoopPlus-Setup-1.0.3.exe'
const UPDATE_YML = 'https://updates.woontegra.com/updates/koopplus-aidat-takip/latest.yml'
const UPDATE_BLOCKMAP = 'https://updates.woontegra.com/updates/koopplus-aidat-takip/KoopPlus-Setup-1.0.3.exe.blockmap'
const MK_SETUP = 'https://pub-52796df7e74b467a8f38ec503fb5137f.r2.dev/Woontegra-Muvekkil-Kasa-Defteri-Setup-0.1.11.exe'
const MANAGED_BASE = 'https://downloads.example.test/files'
const MANAGED_SETUP = `${MANAGED_BASE}/woontegra-sifre-kasasi-setup-1.0.0.exe`

function setupFiles(url: string) {
  return {
    publicFreeDownload: false,
    files: [{ type: 'setup' as const, label: 'Kurulum', url }],
  }
}

{
  assert.equal(SALES_V103, KOOPPLUS_SALES_PUBLIC_URL)
  assert.equal(
    resolveProductDeliveryRawUrl({ downloadUrl: null, downloadMedia: null, downloadFiles: setupFiles(SALES_V103) }),
    SALES_V103,
    'TEST 1 admin 1.0.3 stays 1.0.3',
  )
  assert.equal(canonicalizeKoopPlusSalesInstallerUrl(SALES_V103), SALES_V103)
}

{
  assert.equal(
    resolveProductDeliveryRawUrl({ downloadUrl: null, downloadMedia: null, downloadFiles: setupFiles(SALES_V104) }),
    SALES_V104,
    'TEST 2 admin 1.0.4 stays 1.0.4',
  )
  assert.equal(canonicalizeKoopPlusSalesInstallerUrl(SALES_V104), SALES_V104)
  const source = resolveDownloadSourceFromRawUrl(SALES_V104)
  assert.equal(source?.kind, 'remote')
  assert.equal(source?.filename, 'KoopPlus-Setup-1.0.4.exe')
  assert.equal(source?.remoteUrl, SALES_V104)
}

{
  assert.equal(
    resolveProductDeliveryRawUrl({ downloadUrl: null, downloadMedia: null, downloadFiles: setupFiles(SALES_V105) }),
    SALES_V105,
    'TEST 3 admin 1.0.5 stays 1.0.5',
  )
  assert.equal(canonicalizeKoopPlusSalesInstallerUrl(SALES_V105), SALES_V105)
}

{
  const fromUpdatedProduct = resolveOrderItemDeliveryRawUrl({
    downloadUrl: SALES_V103,
    product: { downloadUrl: null, downloadMedia: null, downloadFiles: setupFiles(SALES_V104) },
  })
  assert.equal(fromUpdatedProduct, SALES_V104, 'TEST 4 current Product.downloadFiles wins over order snapshot')
}

{
  const snapshotOnly = resolveOrderItemDeliveryRawUrl({
    downloadUrl: SALES_V103,
    product: { downloadUrl: null, downloadMedia: null, downloadFiles: { files: [] } },
  })
  assert.equal(snapshotOnly, SALES_V103, 'TEST 5 empty product files fall back to OrderItem snapshot')
  const noProduct = resolveOrderItemDeliveryRawUrl({
    downloadUrl: SALES_V104,
    product: null,
  })
  assert.equal(noProduct, SALES_V104, 'TEST 5 missing product uses snapshot as-is')
}

{
  const resolved = resolveProductDeliveryRawUrl({
    downloadUrl: null,
    downloadMedia: null,
    downloadFiles: setupFiles(SALES_V100),
  })
  assert.equal(resolved, SALES_V103, 'TEST 6 legacy r2.dev 1.0.0 remaps to production fallback')
  assert.equal(canonicalizeKoopPlusSalesInstallerUrl(SALES_V100), SALES_V103)
  assert.equal(
    canonicalizeKoopPlusSalesInstallerUrl(LEGACY_V103),
    SALES_V103,
    'TEST 6 legacy r2.dev 1.0.3 remaps to custom domain fallback',
  )
}

{
  assert.equal(canonicalizeKoopPlusSalesInstallerUrl(UPDATE_EXE), UPDATE_EXE, 'TEST 7 updater EXE is not rewritten')
  assert.equal(resolveDownloadSourceFromRawUrl(UPDATE_EXE), null, 'TEST 7 updater EXE is not a sales source')
}

{
  assert.equal(resolveDownloadSourceFromRawUrl(UPDATE_YML), null, 'TEST 8 latest.yml rejected')
  assert.equal(resolveDownloadSourceFromRawUrl(UPDATE_BLOCKMAP), null, 'TEST 8 blockmap rejected')
}

{
  assert.equal(isBlockedDownloadHostname('127.0.0.1'), true, 'TEST 9 localhost blocked')
  assert.equal(isAllowlistedRemoteDownloadHost('127.0.0.1'), false)
  assert.equal(
    resolveDownloadSourceFromRawUrl(
      'http://download.woontegra.com/downloads/koopplus/windows/KoopPlus-Setup-1.0.4.exe',
    ),
    null,
    'TEST 9 HTTP rejected',
  )
  assert.equal(resolveDownloadSourceFromRawUrl('http://127.0.0.1/secret'), null)
  assert.equal(resolveDownloadSourceFromRawUrl('javascript:alert(1)'), null)
}

{
  const mkDelivery = resolveProductDeliveryRawUrl({
    downloadUrl: null,
    downloadMedia: null,
    downloadFiles: setupFiles(MK_SETUP),
  })
  assert.equal(mkDelivery, MK_SETUP, 'TEST 10 Müvekkil Kasa admin URL is not remapped')
  assert.equal(canonicalizeKoopPlusSalesInstallerUrl(MK_SETUP), MK_SETUP)
  const mkSource = resolveDownloadSourceFromRawUrl(MK_SETUP)
  assert.equal(mkSource?.kind, 'remote')
  assert.equal(mkSource?.remoteUrl, MK_SETUP)
}

{
  const prevDownloads = process.env.R2_DOWNLOADS_PUBLIC_BASE_URL
  delete process.env.R2_DOWNLOADS_PUBLIC_BASE_URL
  const source = resolveDownloadSourceFromRawUrl(SALES_V103)
  assert.ok(source, 'A sales installer resolves')
  assert.equal(source?.kind, 'remote', 'A sales host is remote, not woontegra-downloads')
  assert.equal(source?.filename, KOOPPLUS_SALES_INSTALLER_FILENAME)
  assert.equal(source?.bucket, undefined)
  assert.equal(resolveDownloadSourceFromRawUrl(UPDATE_EXE), null, 'update exe is not a sales source')
  assert.equal(resolveDownloadSourceFromRawUrl(UPDATE_YML), null, 'latest.yml is not a sales source')
  if (prevDownloads === undefined) delete process.env.R2_DOWNLOADS_PUBLIC_BASE_URL
  else process.env.R2_DOWNLOADS_PUBLIC_BASE_URL = prevDownloads
}

{
  const prevDownloads = process.env.R2_DOWNLOADS_PUBLIC_BASE_URL
  const prevKey = process.env.R2_ACCESS_KEY_ID
  const prevSecret = process.env.R2_SECRET_ACCESS_KEY
  const prevEndpoint = process.env.R2_ENDPOINT
  const prevPublicBucket = process.env.R2_PUBLIC_BUCKET_NAME
  const prevPublicBase = process.env.R2_PUBLIC_BASE_URL
  process.env.R2_DOWNLOADS_PUBLIC_BASE_URL = MANAGED_BASE
  process.env.R2_ACCESS_KEY_ID = 'test'
  process.env.R2_SECRET_ACCESS_KEY = 'test'
  process.env.R2_ENDPOINT = 'https://example.r2.cloudflarestorage.com'
  process.env.R2_PUBLIC_BUCKET_NAME = 'woontegra-media'
  process.env.R2_PUBLIC_BASE_URL = 'https://media.example.test'
  const managed = resolveDownloadSourceFromRawUrl(MANAGED_SETUP)
  assert.equal(managed?.kind, 'r2', 'managed downloads host stays private-bucket S3')
  assert.equal(managed?.objectKey, 'woontegra-sifre-kasasi-setup-1.0.0.exe')
  const sales = resolveDownloadSourceFromRawUrl(SALES_V103)
  assert.equal(sales?.kind, 'remote', 'KoopPlus sales host is not mapped to woontegra-downloads')
  process.env.R2_DOWNLOADS_PUBLIC_BASE_URL = `https://${KOOPPLUS_SALES_PUBLIC_HOST}`
  const salesEvenIfMisconfigured = resolveDownloadSourceFromRawUrl(SALES_V103)
  assert.equal(salesEvenIfMisconfigured?.kind, 'remote', 'sales host never maps to private bucket')
  if (prevDownloads === undefined) delete process.env.R2_DOWNLOADS_PUBLIC_BASE_URL
  else process.env.R2_DOWNLOADS_PUBLIC_BASE_URL = prevDownloads
  if (prevKey === undefined) delete process.env.R2_ACCESS_KEY_ID
  else process.env.R2_ACCESS_KEY_ID = prevKey
  if (prevSecret === undefined) delete process.env.R2_SECRET_ACCESS_KEY
  else process.env.R2_SECRET_ACCESS_KEY = prevSecret
  if (prevEndpoint === undefined) delete process.env.R2_ENDPOINT
  else process.env.R2_ENDPOINT = prevEndpoint
  if (prevPublicBucket === undefined) delete process.env.R2_PUBLIC_BUCKET_NAME
  else process.env.R2_PUBLIC_BUCKET_NAME = prevPublicBucket
  if (prevPublicBase === undefined) delete process.env.R2_PUBLIC_BASE_URL
  else process.env.R2_PUBLIC_BASE_URL = prevPublicBase
}

{
  const token = signOrderDownloadToken({
    orderId: 'order-paid',
    orderItemId: 'item-koopplus',
    productId: '075ce900-d6d9-4076-8bba-37478c49fd60',
  })
  const payload = verifyOrderDownloadToken(token)
  assert.ok(payload)
  assert.equal(payload?.orderId, 'order-paid')
  const ok = decideOrderDownloadAccess({
    tokenValid: true,
    orderFound: true,
    orderStatus: 'PAID',
    itemFound: true,
    publicFreeDownload: false,
    source: resolveDownloadSourceFromRawUrl(SALES_V103),
  })
  assert.equal(ok.kind, 'ok', 'A paid KoopPlus + valid token + installer → allow')
}

{
  assert.equal(
    decideOrderDownloadAccess({
      tokenValid: false,
      orderFound: true,
      orderStatus: 'PAID',
      itemFound: true,
      publicFreeDownload: false,
      source: resolveDownloadSourceFromRawUrl(SALES_V103),
    }).kind,
    'not_found',
    'B invalid token deny',
  )
  assert.equal(verifyOrderDownloadToken('not-a-token'), null)
}

{
  assert.equal(
    decideOrderDownloadAccess({
      tokenValid: true,
      orderFound: true,
      orderStatus: 'PENDING',
      itemFound: true,
      publicFreeDownload: false,
      source: resolveDownloadSourceFromRawUrl(SALES_V103),
    }).kind,
    'forbidden',
    'C unpaid order deny',
  )
}

{
  assert.equal(
    decideOrderDownloadAccess({
      tokenValid: true,
      orderFound: true,
      orderStatus: 'PAID',
      itemFound: false,
      publicFreeDownload: false,
      source: resolveDownloadSourceFromRawUrl(SALES_V103),
    }).kind,
    'not_found',
    'D order/item mismatch deny',
  )
}

{
  assert.equal(
    decideOrderDownloadAccess({
      tokenValid: true,
      orderFound: true,
      orderStatus: 'PAID',
      itemFound: true,
      publicFreeDownload: false,
      source: null,
    }).kind,
    'not_found',
    'E installer asset missing → controlled not_found',
  )
}

{
  assert.equal(
    classifyDownloadStreamError({ name: 'NotFound', Code: 'NoSuchKey', $metadata: { httpStatusCode: 404 } }),
    'NOT_FOUND',
    'E missing object is NOT_FOUND',
  )
  assert.equal(
    classifyDownloadStreamError({ message: 'NOT_FOUND', httpStatus: 404 }),
    'NOT_FOUND',
  )
  assert.equal(
    classifyDownloadStreamError({ message: 'timeout', name: 'TimeoutError' }),
    'STORAGE_FAILURE',
    'F storage fetch failure is controlled STORAGE_FAILURE',
  )
}

{
  assert.equal(
    isPublicFreeDownloadProduct({
      productType: ProductType.DOWNLOAD,
      purchaseEnabled: true,
      price: 3000,
    }),
    false,
    'H paid KoopPlus publicFreeDownload stays false',
  )
}

{
  assert.equal(isAllowlistedRemoteDownloadHost(KOOPPLUS_SALES_PUBLIC_HOST), true)
  assert.equal(isAllowlistedRemoteDownloadHost(KOOPPLUS_SALES_LEGACY_PUBLIC_HOST), true)
  assert.equal(isAllowlistedRemoteDownloadHost('updates.woontegra.com'), false)
  assert.equal(isBlockedDownloadHostname('127.0.0.1'), true)
  assert.equal(isAllowlistedRemoteDownloadHost('127.0.0.1'), false)
  assert.equal(resolveDownloadSourceFromRawUrl('javascript:alert(1)'), null)
  assert.equal(resolveDownloadSourceFromRawUrl('http://127.0.0.1/secret'), null)
}

{
  const licenseStillResolves = resolveDownloadSourceFromRawUrl(SALES_V103)
  assert.ok(licenseStillResolves, 'I license provisioning source still resolves independently')
  assert.equal(licenseStillResolves?.kind, 'remote')
}

console.log('order-download-source tests: OK')
