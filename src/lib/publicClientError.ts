export const INVALID_CUSTOMER_SESSION_MESSAGE = 'Oturumunuz geçersiz. Lütfen yeniden giriş yapın.'
export const INVALID_CUSTOMER_SESSION_CODE = 'CUSTOMER_SESSION_INVALID'
export const GENERIC_PUBLIC_FAILURE_MESSAGE = 'İşleminiz tamamlanamadı. Lütfen tekrar deneyin.'
export const UNAVAILABLE_CART_MESSAGE =
  'Sepetinizdeki bazı ürünler artık satın alınamıyor. Lütfen sepetinizi güncelleyip tekrar deneyin.'

const TECHNICAL_MESSAGE =
  /prisma|foreign key|_fkey|constraint|invocation|P20\d{2}|syntax error|node_modules|DATABASE_URL|Invalid `prisma|\n\s+at\s+|sqlstate|postgres|violates|column "|relation "/i

export type PublicClientFailure = {
  status: number
  body: { success: false; message: string; code?: string }
}

function constraintText(err: unknown): string {
  if (!err || typeof err !== 'object') return ''
  const meta = (err as { meta?: { constraint?: unknown; field_name?: unknown } }).meta
  const code = (err as { code?: unknown }).code
  return [code, meta?.constraint, meta?.field_name].filter((value) => typeof value === 'string').join(' ')
}

export function isTechnicalPublicMessage(message: string): boolean {
  return TECHNICAL_MESSAGE.test(message)
}

export function presentPublicClientError(
  err: unknown,
  options?: { status?: number; message?: string; fallback?: string },
): PublicClientFailure {
  const raw =
    options?.message ??
    (err instanceof Error ? err.message : typeof err === 'string' ? err : '')
  const fallback = options?.fallback?.trim() || GENERIC_PUBLIC_FAILURE_MESSAGE
  const constraint = `${constraintText(err)} ${raw}`
  const status = options?.status ?? 500

  if (/customerId_fkey|Order_customerId_fkey/i.test(constraint)) {
    console.error('[public-api] invalid customer session', { detail: constraint.slice(0, 400) })
    return {
      status: 401,
      body: {
        success: false,
        code: INVALID_CUSTOMER_SESSION_CODE,
        message: INVALID_CUSTOMER_SESSION_MESSAGE,
      },
    }
  }

  if (/productId_fkey/i.test(constraint)) {
    console.error('[public-api] product reference missing', { detail: constraint.slice(0, 400) })
    return { status: 400, body: { success: false, message: UNAVAILABLE_CART_MESSAGE } }
  }

  if (isTechnicalPublicMessage(raw) || isTechnicalPublicMessage(constraintText(err))) {
    console.error('[public-api] hidden client error', { status, detail: raw.slice(0, 500) })
    return { status, body: { success: false, message: fallback } }
  }

  return { status, body: { success: false, message: raw.trim() || fallback } }
}
