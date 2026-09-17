/**
 * PayTR callback recovery: only internal premature-cleanup FAILED txs may be
 * promoted on a verified provider success callback. Provider-failed txs must not.
 */

export const INTERNAL_PREMATURE_CLEANUP_FAIL_REASONS = [
  'stale_reservation_cleanup_after_get_token_failure',
  'paytr_get_token_api_failure',
] as const

export type PaytrSuccessTxDecision =
  | { kind: 'promote_pending' }
  | { kind: 'already_success' }
  | { kind: 'recover_internal_cleanup'; failReason: string }
  | { kind: 'conflict_non_recoverable_failed'; reason: string }
  | { kind: 'missing_transaction' }

function asRecord(payload: unknown): Record<string, unknown> | null {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) return null
  return payload as Record<string, unknown>
}

/** True when FAILED was caused by our internal cleanup / get-token API fail marker — not PayTR provider failure. */
export function isRecoverableInternalCleanupPayload(payload: unknown): boolean {
  const o = asRecord(payload)
  if (!o) return false

  // Provider failure callbacks store PayTR fields (status=failed). Never recover those.
  const providerStatus = String(o.status ?? '').toLowerCase()
  if (providerStatus === 'failed') return false
  if (o.failed_reason_code != null && String(o.failed_reason_code).trim() !== '') return false
  if (o.failed_reason_msg != null && String(o.failed_reason_msg).trim() !== '') return false

  const failReason = String(o.failReason ?? '').trim()
  if (
    (INTERNAL_PREMATURE_CLEANUP_FAIL_REASONS as readonly string[]).includes(failReason)
  ) {
    return true
  }

  const failStage = String(o.failStage ?? '').trim()
  if (failStage === 'get-token') return true

  return false
}

export function extractInternalCleanupFailReason(payload: unknown): string {
  const o = asRecord(payload)
  if (!o) return 'unknown_internal_cleanup'
  const failReason = String(o.failReason ?? '').trim()
  if (failReason) return failReason
  const failStage = String(o.failStage ?? '').trim()
  if (failStage === 'get-token') return 'paytr_get_token_api_failure'
  return 'unknown_internal_cleanup'
}

/**
 * Decide how a verified PayTR success callback should treat the PaymentTransaction row.
 * Hash/amount/merchant matching must already be validated by the caller.
 */
export function decidePaytrSuccessTxTransition(input: {
  txStatus: string | null | undefined
  providerRawPayload: unknown
}): PaytrSuccessTxDecision {
  const status = String(input.txStatus ?? '').toUpperCase()
  if (!status) return { kind: 'missing_transaction' }
  if (status === 'PENDING') return { kind: 'promote_pending' }
  if (status === 'SUCCESS') return { kind: 'already_success' }
  if (status === 'FAILED') {
    if (isRecoverableInternalCleanupPayload(input.providerRawPayload)) {
      return {
        kind: 'recover_internal_cleanup',
        failReason: extractInternalCleanupFailReason(input.providerRawPayload),
      }
    }
    return {
      kind: 'conflict_non_recoverable_failed',
      reason: 'FAILED_WITHOUT_INTERNAL_CLEANUP_MARKER',
    }
  }
  return {
    kind: 'conflict_non_recoverable_failed',
    reason: `UNEXPECTED_TX_STATUS_${status}`,
  }
}

/** Marker written when get-token API failure cleanup runs (never for in-flight token success). */
export function buildGetTokenApiFailurePayload(reason: string): {
  failStage: 'get-token'
  failReason: 'paytr_get_token_api_failure'
  reason: string
  at: string
} {
  return {
    failStage: 'get-token',
    failReason: 'paytr_get_token_api_failure',
    reason: String(reason || '').slice(0, 1000),
    at: new Date().toISOString(),
  }
}
