import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isCheckoutIdempotencyUniqueTarget,
  normalizeCheckoutIdempotencyKey,
} from '../lib/orderCheckoutIdempotency'
import { formatDigitalDeliveryLicenseError } from '../lib/digitalDeliveryErrorLabel'
import { Prisma } from '@prisma/client'

describe('order checkout idempotency key', () => {
  it('accepts opaque keys and rejects short/invalid', () => {
    assert.equal(normalizeCheckoutIdempotencyKey('abcdefghijklmnop'), 'abcdefghijklmnop')
    assert.equal(normalizeCheckoutIdempotencyKey('  a1b2c3d4e5f6g7h8  '), 'a1b2c3d4e5f6g7h8')
    assert.equal(normalizeCheckoutIdempotencyKey('short'), null)
    assert.equal(normalizeCheckoutIdempotencyKey('bad key!!'), null)
    assert.equal(normalizeCheckoutIdempotencyKey(null), null)
    assert.equal(normalizeCheckoutIdempotencyKey(12), null)
  })

  it('detects P2002 on checkoutIdempotencyKey target', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Unique', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['checkoutIdempotencyKey'] },
    })
    assert.equal(isCheckoutIdempotencyUniqueTarget(err), true)
    const other = new Prisma.PrismaClientKnownRequestError('Unique', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['orderNo'] },
    })
    assert.equal(isCheckoutIdempotencyUniqueTarget(other), false)
  })
})

describe('digital delivery license error label', () => {
  it('prefixes payment-received license failure', () => {
    const msg = formatDigitalDeliveryLicenseError(null, 'Geçersiz entegrasyon anahtarı')
    assert.match(msg, /^Ödeme alındı, lisans oluşturulamadı:/)
    assert.match(msg, /Geçersiz entegrasyon anahtarı/)
  })
})

describe('bank confirm idempotency contract (fake state machine)', () => {
  it('PENDING→PAID claim is single-winner; second is alreadyPaid', () => {
    type Row = { status: string; paymentConfirmedAt: Date | null; approvalMails: number; fulfills: number }
    const row: Row = { status: 'PENDING', paymentConfirmedAt: null, approvalMails: 0, fulfills: 0 }

    function claimConfirm() {
      if (row.status === 'PAID' || row.status === 'PROCESSING') {
        row.fulfills += 1
        return { alreadyPaid: true as const }
      }
      if (row.status !== 'PENDING') throw new Error('bad status')
      // updateMany WHERE PENDING
      if (row.status === 'PENDING') {
        row.status = 'PAID'
        row.paymentConfirmedAt = new Date()
        row.approvalMails += 1
        row.fulfills += 1
        return { alreadyPaid: false as const }
      }
      row.fulfills += 1
      return { alreadyPaid: true as const }
    }

    const first = claimConfirm()
    const second = claimConfirm()
    assert.equal(first.alreadyPaid, false)
    assert.equal(second.alreadyPaid, true)
    assert.equal(row.approvalMails, 1)
    assert.equal(row.fulfills, 2)
    assert.ok(row.paymentConfirmedAt)
  })

  it('concurrent fake claims: only one sends approval mail', () => {
    let status = 'PENDING'
    let mails = 0
    function tryClaim() {
      if (status !== 'PENDING') {
        return { alreadyPaid: true, mailed: false }
      }
      status = 'PAID'
      mails += 1
      return { alreadyPaid: false, mailed: true }
    }
    const a = tryClaim()
    const b = tryClaim()
    assert.equal(a.mailed, true)
    assert.equal(b.mailed, false)
    assert.equal(mails, 1)
  })
})

describe('affiliate commission once per order (contract)', () => {
  it('second create skipped when orderId already has commission', () => {
    const byOrder = new Map<string, string>()
    function createCommission(orderId: string) {
      const existing = byOrder.get(orderId)
      if (existing) return { created: false, skipped: true, reason: 'already_exists' as const }
      byOrder.set(orderId, 'c1')
      return { created: true, skipped: false }
    }
    assert.equal(createCommission('ord-1').created, true)
    assert.equal(createCommission('ord-1').skipped, true)
    assert.equal(createCommission('ord-1').reason, 'already_exists')
    assert.equal(byOrder.size, 1)
  })
})
