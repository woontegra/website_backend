/**
 * Local unit tests: PayTR callback recovery + get-token cleanup markers.
 * Run: node --import tsx --test src/lib/paytrCallbackRecovery.test.ts
 *   or: npx tsx --test src/lib/paytrCallbackRecovery.test.ts
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildGetTokenApiFailurePayload,
  decidePaytrSuccessTxTransition,
  isRecoverableInternalCleanupPayload,
} from './paytrCallbackRecovery'

test('TEST1/ marker: get-token API failure payload is recoverable internal cleanup', () => {
  const p = buildGetTokenApiFailurePayload('Basic API only')
  assert.equal(p.failStage, 'get-token')
  assert.equal(p.failReason, 'paytr_get_token_api_failure')
  assert.equal(isRecoverableInternalCleanupPayload(p), true)
  assert.equal(decidePaytrSuccessTxTransition({ txStatus: 'FAILED', providerRawPayload: p }).kind, 'recover_internal_cleanup')
})

test('TEST2 / in-flight: PENDING + success → promote (cleanup must not apply)', () => {
  assert.equal(
    decidePaytrSuccessTxTransition({ txStatus: 'PENDING', providerRawPayload: null }).kind,
    'promote_pending',
  )
  // Age alone / empty FAILED is NOT recoverable — protects in-flight mis-marked only if marker absent
  assert.equal(
    decidePaytrSuccessTxTransition({ txStatus: 'FAILED', providerRawPayload: null }).kind,
    'conflict_non_recoverable_failed',
  )
})

test('TEST3 / normal success path decision', () => {
  assert.equal(
    decidePaytrSuccessTxTransition({ txStatus: 'PENDING', providerRawPayload: {} }).kind,
    'promote_pending',
  )
})

test('TEST4 / duplicate SUCCESS → already_success (fulfillment gated by firstCompletion)', () => {
  assert.equal(
    decidePaytrSuccessTxTransition({ txStatus: 'SUCCESS', providerRawPayload: { status: 'success' } })
      .kind,
    'already_success',
  )
})

test('TEST5 / internal-cleanup FAILED + verified success → recover', () => {
  const stale = {
    failReason: 'stale_reservation_cleanup_after_get_token_failure',
    cleanedAt: '2026-09-17T20:19:04.554Z',
  }
  const d = decidePaytrSuccessTxTransition({ txStatus: 'FAILED', providerRawPayload: stale })
  assert.equal(d.kind, 'recover_internal_cleanup')
  if (d.kind === 'recover_internal_cleanup') {
    assert.equal(d.failReason, 'stale_reservation_cleanup_after_get_token_failure')
  }
})

test('TEST6 / provider FAILED payload must NOT recover', () => {
  const providerFailed = {
    status: 'failed',
    merchant_oid: 'WTBHMU5YWEZL6I4PXC',
    failed_reason_code: '1',
    failed_reason_msg: 'kart reddedildi',
  }
  assert.equal(isRecoverableInternalCleanupPayload(providerFailed), false)
  assert.equal(
    decidePaytrSuccessTxTransition({ txStatus: 'FAILED', providerRawPayload: providerFailed }).kind,
    'conflict_non_recoverable_failed',
  )
})

test('TEST6b / unknown FAILED without marker → no recover', () => {
  assert.equal(
    decidePaytrSuccessTxTransition({
      txStatus: 'FAILED',
      providerRawPayload: { foo: 'bar' },
    }).kind,
    'conflict_non_recoverable_failed',
  )
})

test('TEST7 / amount mismatch is rejected by caller (decision does not bypass)', () => {
  // Decision helper assumes amount already matched; recovery still requires marker.
  const d = decidePaytrSuccessTxTransition({
    txStatus: 'FAILED',
    providerRawPayload: {
      failReason: 'stale_reservation_cleanup_after_get_token_failure',
    },
  })
  assert.equal(d.kind, 'recover_internal_cleanup')
})

test('TEST8 / hash invalid is caller-side reject — recovery helpers do not soften FAILED provider', () => {
  assert.equal(
    isRecoverableInternalCleanupPayload({
      status: 'failed',
      failReason: 'stale_reservation_cleanup_after_get_token_failure',
    }),
    false,
  )
})
