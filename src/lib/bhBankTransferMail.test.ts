import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BH_BANK_TRANSFER_ACTIVATION_NOTE,
  bilirkisiPackageLabel,
  buildBankTransferReceivedMail,
  buildBilirkisiSubscriptionActivatedMail,
  formatBankTransferMailAmount,
  shouldSendBankTransferOrderReceivedMail,
  shouldSendBilirkisiSubscriptionActivatedMail,
} from './bhBankTransferMail'

const bank = {
  customerName: 'Bruce willis',
  orderNo: 'WTBH-MUVAUYMZFUK3MS',
  bankName: 'Örnek Bankası',
  accountHolder: 'Woontegra',
  iban: 'TR00 0000 0000 0000 0000 0000 00',
  productName: 'Bilirkişi Hesap',
  packageLabel: 'Yıllık',
  includeActivationNote: true,
}

test('normal bank transfer received mail uses the order total', () => {
  assert.equal(shouldSendBankTransferOrderReceivedMail({ paymentProvider: 'BANK_TRANSFER', createdNewOrder: true }), true)
  const mail = buildBankTransferReceivedMail({
    ...bank,
    amountFormatted: formatBankTransferMailAmount(20000),
  })
  assert.match(mail.subject, /Havale\/EFT Siparişiniz Alındı/)
  assert.match(mail.text, /Ödenecek tutar: .*20\.000/)
  assert.match(mail.text, /Ürün: Bilirkişi Hesap/)
  assert.match(mail.text, /Paket: Yıllık/)
  assert.match(mail.text, /Banka: Örnek Bankası/)
  assert.match(mail.text, /Hesap Sahibi: Woontegra/)
  assert.match(mail.text, /IBAN:/)
  assert.match(mail.text, /Ödeme Açıklaması \/ Sipariş No: WTBH-MUVAUYMZFUK3MS/)
  assert.match(mail.text, new RegExp(BH_BANK_TRANSFER_ACTIVATION_NOTE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.equal(mail.text.includes('BankName'), false)
  assert.equal(mail.text.includes('AccountHolder'), false)
  assert.equal(mail.text.includes('PaymentReference'), false)
})

test('40 percent campaign bank transfer mail shows 12000 not 20000', () => {
  const payable = formatBankTransferMailAmount(12000)
  const list = formatBankTransferMailAmount(20000)
  const mail = buildBankTransferReceivedMail({ ...bank, amountFormatted: payable })
  assert.match(mail.text, new RegExp(`Ödenecek tutar: ${payable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  assert.equal(mail.text.includes(list), false)
  assert.equal(mail.html.includes(list), false)
})

test('25 percent coupon bank transfer mail shows 15000 not 20000', () => {
  const payable = formatBankTransferMailAmount(15000)
  const list = formatBankTransferMailAmount(20000)
  const mail = buildBankTransferReceivedMail({ ...bank, amountFormatted: payable })
  assert.match(mail.text, new RegExp(`Ödenecek tutar: ${payable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  assert.equal(mail.text.includes(list), false)
})

test('idempotent replay does not send another received mail', () => {
  assert.equal(
    shouldSendBankTransferOrderReceivedMail({ paymentProvider: 'BANK_TRANSFER', createdNewOrder: false }),
    false,
  )
})

test('PayTR does not use the bank transfer received or activation mail', () => {
  assert.equal(shouldSendBankTransferOrderReceivedMail({ paymentProvider: 'PAYTR', createdNewOrder: true }), false)
  assert.equal(
    shouldSendBilirkisiSubscriptionActivatedMail({
      paymentProvider: 'PAYTR',
      bhSaleRef: 'WTBH1',
      fulfillmentStatusBefore: 'PENDING',
      fulfillmentStatusAfter: 'APPLIED',
    }),
    false,
  )
})

test('activation mail is sent only after a new successful Bilirkişi fulfillment', () => {
  assert.equal(
    shouldSendBilirkisiSubscriptionActivatedMail({
      paymentProvider: 'BANK_TRANSFER',
      bhSaleRef: 'WTBH1',
      fulfillmentStatusBefore: 'PENDING',
      fulfillmentStatusAfter: 'APPLIED',
    }),
    true,
  )
  const mail = buildBilirkisiSubscriptionActivatedMail({
    customerName: 'Bruce willis',
    orderNo: 'WTBH-MUVAUYMZFUK3MS',
    productName: 'Bilirkişi Hesap',
    packageLabel: bilirkisiPackageLabel('annual'),
    amountFormatted: formatBankTransferMailAmount(12000),
  })
  assert.match(mail.subject, /Ödemeniz Onaylandı/)
  assert.match(mail.subject, /Aboneliğiniz Aktif/)
  assert.match(mail.text, /aboneliğiniz aktif edildi/)
  assert.match(mail.text, /12\.000/)
  assert.equal(mail.text.includes('BankName'), false)
})

test('failed fulfillment does not send the activation mail', () => {
  assert.equal(
    shouldSendBilirkisiSubscriptionActivatedMail({
      paymentProvider: 'BANK_TRANSFER',
      bhSaleRef: 'WTBH1',
      fulfillmentStatusBefore: 'PENDING',
      fulfillmentStatusAfter: 'FAILED',
    }),
    false,
  )
})

test('repeating confirm after the activation mail does not send it again', () => {
  assert.equal(
    shouldSendBilirkisiSubscriptionActivatedMail({
      paymentProvider: 'BANK_TRANSFER',
      bhSaleRef: 'WTBH1',
      fulfillmentStatusBefore: 'APPLIED',
      fulfillmentStatusAfter: 'APPLIED',
    }),
    false,
  )
})

test('a later confirm that first applies fulfillment may send the activation mail once', () => {
  assert.equal(
    shouldSendBilirkisiSubscriptionActivatedMail({
      paymentProvider: 'BANK_TRANSFER',
      bhSaleRef: 'WTBH1',
      fulfillmentStatusBefore: 'FAILED',
      fulfillmentStatusAfter: 'APPLIED',
    }),
    true,
  )
})
