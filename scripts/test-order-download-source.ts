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
  KOOPPLUS_SALES_PUBLIC_HOST,
  KOOPPLUS_SALES_PUBLIC_URL,
} from '../src/lib/koopplusSalesInstaller.js'
import {
  classifyDownloadStreamError,
  resolveDownloadSourceFromRawUrl,
} from '../src/lib/downloadStream.js'
import { signOrderDownloadToken, verifyOrderDownloadToken } from '../src/lib/orderDownloadToken.js'
import { isPublicFreeDownloadProduct } from '../src/lib/productDownloadFiles.js'
import { resolveProductDeliveryRawUrl } from '../src/lib/productDeliveryUrl.js'
import { isAllowlistedRemoteDownloadHost, isBlockedDownloadHostname } from '../src/lib/remoteHttpsDownload.js'
import { decideOrderDownloadAccess } from '../src/services/orderProductDownload.service.js'

const SALES_V100 = `https://${KOOPPLUS_SALES_LEGACY_PUBLIC_HOST}/windows/KoopPlus-Setup-1.0.0.exe`
const SALES_V103 = KOOPPLUS_SALES_PUBLIC_URL
const LEGACY_V103 = `https://${KOOPPLUS_SALES_LEGACY_PUBLIC_HOST}/windows/${KOOPPLUS_SALES_INSTALLER_FILENAME}`
const UPDATE_EXE = 'https://updates.woontegra.com/updates/koopplus-aidat-takip/KoopPlus-Setup-1.0.3.exe'
const UPDATE_YML = 'https://updates.woontegra.com/updates/koopplus-aidat-takip/latest.yml'
const MANAGED_BASE = 'https://downloads.example.test/files'
const MANAGED_SETUP = `${MANAGED_BASE}/woontegra-sifre-kasasi-setup-1.0.0.exe`

{
  const resolved = resolveProductDeliveryRawUrl({
    downloadUrl: null,
    downloadMedia: null,
    downloadFiles: {
      publicFreeDownload: false,
      files: [{ type: 'setup', label: 'Kurulum', url: SALES_V100 }],
    },
  })
  assert.equal(resolved, SALES_V103, 'G temporary compat: legacy sales 1.0.0 remaps to production 1.0.3')
  assert.equal(canonicalizeKoopPlusSalesInstallerUrl(SALES_V100), SALES_V103)
  assert.equal(canonicalizeKoopPlusSalesInstallerUrl(LEGACY_V103), SALES_V103, 'legacy r2.dev 1.0.3 remaps to custom domain')
  assert.equal(canonicalizeKoopPlusSalesInstallerUrl(SALES_V103), SALES_V103)
  assert.equal(canonicalizeKoopPlusSalesInstallerUrl(UPDATE_EXE), UPDATE_EXE, 'G update URL is not rewritten')
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
