import assert from 'node:assert/strict'
import test from 'node:test'
import {
  invoiceAddressFromBilling,
  invoiceAddressFromCheckoutBook,
  resolveOrderInvoiceAddress,
} from './orderInvoiceAddress'

const street = 'Cumhuriyet mah. İnönü cad. No 1'

test('checkout billing keeps city, district and street separately', () => {
  const address = invoiceAddressFromBilling({
    city: 'Kars',
    district: 'Merkez',
    openAddress: street,
    address: `${street} — Merkez / Kars`,
  })
  assert.deepEqual(address, {
    billingCity: 'Kars',
    billingDistrict: 'Merkez',
    billingAddress: street,
  })
})

test('empty order columns use the address saved at checkout', () => {
  const createdAt = new Date('2026-10-07T07:17:14.190Z')
  const fromBook = invoiceAddressFromCheckoutBook(createdAt, [
    {
      city: 'Kars',
      district: 'Merkez',
      addressLine: street,
      createdAt: new Date('2026-10-07T07:17:15.780Z'),
    },
    {
      city: 'Ankara',
      district: 'Çankaya',
      addressLine: 'Sonradan eklenen adres',
      createdAt: new Date('2026-11-01T10:00:00.000Z'),
    },
  ])
  assert.deepEqual(
    resolveOrderInvoiceAddress(
      { billingCity: null, billingDistrict: null, billingAddress: null },
      fromBook,
    ),
    {
      billingCity: 'Kars',
      billingDistrict: 'Merkez',
      billingAddress: street,
    },
  )
})

test('stored order address is not replaced by the address book', () => {
  const stored = {
    billingCity: 'İzmir',
    billingDistrict: 'Konak',
    billingAddress: 'Sipariş adresi',
  }
  assert.equal(
    resolveOrderInvoiceAddress(stored, {
      billingCity: 'Kars',
      billingDistrict: 'Merkez',
      billingAddress: street,
    }),
    stored,
  )
})
