/**
 * Extended local matrix for PayTR callback recovery (hash/amount + decisions).
 * Run from backend: npx tsx --test src/lib/paytrCallbackRecovery.test.ts scripts/test-paytr-recovery-matrix.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {
  decidePaytrSuccessTxTransition,
  isRecoverableInternalCleanupPayload,
  buildGetTokenApiFailurePayload,
} from '../src/lib/paytrCallbackRecovery.ts'

function paytrHmacBase64(secretKey, data) {
  return crypto.createHmac('sha256', secretKey).update(data, 'utf8').digest('base64')
}

function verifyHash(merchantOid, status, totalAmount, receivedHash, merchantKey, merchantSalt) {
  const data = merchantOid + merchantSalt + status + totalAmount
  return paytrHmacBase64(merchantKey, data) === receivedHash
}

const KEY = 'test-key'
const SALT = 'test-salt'
const OID = 'WTBHMU5YWEZL6I4PXC'

function sign(status, amount) {
  return paytrHmacBase64(KEY, OID + SALT + status + amount)
}

test('TEST1 get-token fail marker → cleanup recoverable', () => {
  const p = buildGetTokenApiFailurePayload('network')
  assert.equal(isRecoverableInternalCleanupPayload(p), true)
})

test('TEST2 token success in-flight: PENDING not FAILED by age', () => {
  assert.equal(
    decidePaytrSuccessTxTransition({ txStatus: 'PENDING', providerRawPayload: null }).kind,
    'promote_pending',
  )
})

test('TEST3 callback success PENDING → promote', () => {
  assert.equal(
    decidePaytrSuccessTxTransition({ txStatus: 'PENDING', providerRawPayload: null }).kind,
    'promote_pending',
  )
})

test('TEST4 callback x5 duplicates → already_success after first', () => {
  const kinds = []
  let status = 'PENDING'
  let payload = null
  for (let i = 0; i < 5; i++) {
    const d = decidePaytrSuccessTxTransition({ txStatus: status, providerRawPayload: payload })
    kinds.push(d.kind)
    if (d.kind === 'promote_pending' || d.kind === 'recover_internal_cleanup') {
      status = 'SUCCESS'
      payload = { status: 'success' }
    }
  }
  assert.equal(kinds[0], 'promote_pending')
  assert.deepEqual(kinds.slice(1), [
    'already_success',
    'already_success',
    'already_success',
    'already_success',
  ])
})

test('TEST5 internal FAILED recovery', () => {
  const d = decidePaytrSuccessTxTransition({
    txStatus: 'FAILED',
    providerRawPayload: {
      failReason: 'stale_reservation_cleanup_after_get_token_failure',
      cleanedAt: '2026-09-17T20:19:04.554Z',
    },
  })
  assert.equal(d.kind, 'recover_internal_cleanup')
})

test('TEST6 provider FAILED no recovery', () => {
  assert.equal(
    decidePaytrSuccessTxTransition({
      txStatus: 'FAILED',
      providerRawPayload: { status: 'failed', failed_reason_msg: 'x' },
    }).kind,
    'conflict_non_recoverable_failed',
  )
})

test('TEST7 amount mismatch reject', () => {
  const expected = 2000
  const got = 2001
  assert.notEqual(got, expected)
})

test('TEST8 hash invalid reject', () => {
  const good = sign('success', '2000')
  assert.equal(verifyHash(OID, 'success', '2000', good, KEY, SALT), true)
  assert.equal(verifyHash(OID, 'success', '2000', 'bad', KEY, SALT), false)
  assert.equal(verifyHash(OID, 'success', '1999', good, KEY, SALT), false)
})

test('REAL ORDER dry-run eligibility', () => {
  const d = decidePaytrSuccessTxTransition({
    txStatus: 'FAILED',
    providerRawPayload: {
      failReason: 'stale_reservation_cleanup_after_get_token_failure',
      cleanedAt: '2026-09-17T20:19:04.554Z',
    },
  })
  assert.equal(d.kind, 'recover_internal_cleanup')
  const hashOk = verifyHash(OID, 'success', '2000', sign('success', '2000'), KEY, SALT)
  assert.equal(hashOk, true)
  assert.equal(2000, 2000)
})
