import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveOrderItemDeliveryRawUrl, resolveProductDeliveryRawUrl } from './productDeliveryUrl'
import {
  DOWNLOAD_FILE_UNAVAILABLE_TR,
  resolveCustomerFacingDownload,
  resolveLiveProductMailDownloadHref,
} from './liveProductDownload'
import { buildOrderDownloadMailHref } from './mailDownloadLink'

const R2_V018 =
  'https://pub-52796df7e74b467a8f38ec503fb5137f.r2.dev/Woontegra-Muvekkil-Kasa-Defteri-Setup-0.1.8.exe'
const R2_V010 =
  'https://pub-52796df7e74b467a8f38ec503fb5137f.r2.dev/Woontegra-Muvekkil-Kasa-Defteri-Setup-0.1.0.exe'
const R2_V020 =
  'https://pub-52796df7e74b467a8f38ec503fb5137f.r2.dev/Woontegra-Muvekkil-Kasa-Defteri-Setup-0.2.0.exe'

describe('live product downloadFiles source', () => {
  it('prefers downloadFiles.setup over stale snapshot for any downloadable product', () => {
    const product = {
      downloadUrl: R2_V010,
      downloadMedia: { url: '/uploads/catalog/old.zip' },
      downloadFiles: {
        files: [{ type: 'setup', label: 'Kurulum', url: R2_V018, buttonLabel: 'İndir' }],
      },
    }
    assert.equal(resolveProductDeliveryRawUrl(product), R2_V018)
    assert.equal(resolveOrderItemDeliveryRawUrl({ downloadUrl: R2_V010, product }), R2_V018)
    const facing = resolveCustomerFacingDownload({ downloadUrl: R2_V010, product })
    assert.equal(facing.href, R2_V018)
    assert.equal(facing.unavailableMessage, null)
  })

  it('tracks a newer upload without code change', () => {
    const product = {
      downloadUrl: R2_V018,
      downloadFiles: {
        files: [{ type: 'setup', label: 'Kurulum', url: R2_V020 }],
      },
    }
    assert.equal(resolveLiveProductMailDownloadHref(resolveProductDeliveryRawUrl(product)), R2_V020)
  })

  it('returns Turkish warning when no deliverable file', () => {
    const facing = resolveCustomerFacingDownload({
      downloadUrl: null,
      product: { downloadUrl: null, downloadFiles: { files: [] } },
    })
    assert.equal(facing.href, null)
    assert.equal(facing.unavailableMessage, DOWNLOAD_FILE_UNAVAILABLE_TR)
  })

  it('mail href never uses signed /api/downloads/order proxy for live product URL', () => {
    const href = resolveLiveProductMailDownloadHref(R2_V018)
    assert.equal(href, R2_V018)
    assert.equal(href?.includes('/api/downloads/order/'), false)
  })

  it('signed proxy helper still exists but is unused for live product mail path', () => {
    const signed = buildOrderDownloadMailHref({ orderId: 'ord', orderItemId: 'item' })
    assert.match(signed, /\/api\/downloads\/order\//)
  })
})
