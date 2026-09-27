import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOrderDeliveryView } from './orders.service'

const preparing =
  'Erişim bilgileriniz hazırlanıyor. Tamamlandığında e-posta adresinize gönderilecektir.'
const sent = 'Web tabanlı ürün erişim bilgileriniz e-posta ile gönderildi.'

const bhItem = {
  productName: 'Bilirkişi Hesap',
  licenseServerLastError: null,
  downloadUrl: 'saas:bilirkisi-hesap',
}

test('PAID ve Bilirkişi fulfillment APPLIED ise erişim maili gönderildi denir', () => {
  const view = buildOrderDeliveryView({
    status: 'PAID',
    downloadEmailSentAt: new Date('2026-09-27T21:11:56Z'),
    bhSaleRef: 'WTBH-SALE',
    bhFulfillmentStatus: 'APPLIED',
    items: [bhItem],
  })
  assert.equal(view.deliveryState, 'delivered')
  assert.equal(view.deliveryMessage, sent)
})

test('PAID ve fulfillment PENDING ise hazırlanıyor denir, mail gitmiş denmez', () => {
  const view = buildOrderDeliveryView({
    status: 'PAID',
    downloadEmailSentAt: new Date('2026-09-27T21:11:56Z'),
    bhSaleRef: 'WTBH-SALE',
    bhFulfillmentStatus: 'PENDING',
    items: [bhItem],
  })
  assert.equal(view.deliveryState, 'pending')
  assert.equal(view.deliveryMessage, preparing)
  assert.equal(view.deliveryMessage.includes('gönderildi'), false)
})

test('PAID ve fulfillment FAILED ise ödeme kalır, erişim maili gönderildi denmez', () => {
  const view = buildOrderDeliveryView({
    status: 'PAID',
    downloadEmailSentAt: new Date('2026-09-27T21:11:56Z'),
    bhSaleRef: 'WTBH1790543461341d089bdab',
    bhFulfillmentStatus: 'FAILED',
    items: [bhItem],
  })
  assert.equal(view.deliveryState, 'pending')
  assert.equal(view.deliveryMessage, preparing)
  assert.equal(view.deliveryMessage.includes('gönderildi'), false)
})
