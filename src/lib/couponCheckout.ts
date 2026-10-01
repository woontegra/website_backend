import { roundMoney } from './campaignPricing'

export type CouponCartLine = {
  productId: string
  quantity: number
  unitPrice: number
}

export type CouponUsageCounts = {
  totalUses: number
  customerUses: number
  customerPriorOrders: number
}

export type CouponDiscountType = 'percent' | 'fixed_amount'

export type CouponCheckoutRule = {
  id: string
  name: string
  code: string
  isActive: boolean
  archivedAt?: string | null
  discountType: CouponDiscountType
  discountValue: number
  startsAt?: string | null
  endsAt?: string | null
  usageLimit?: number | null
  perCustomerLimit?: number | null
  firstPurchaseOnly?: boolean
  minimumCartTotal?: number | null
  /** Boşsa kupon sepetteki ürünlerin tümünde geçerlidir. */
  productIds: string[]
}

export type CouponQuote = {
  code: string
  couponId: string
  couponName: string
  discountType: CouponDiscountType
  discountValue: number
  discountAmount: number
  subtotal: number
  total: number
}

export type CouponEvaluation = { ok: true; quote: CouponQuote } | { ok: false; message: string }

const COUPON_NOT_FOUND = 'Bu kupon bulunamadı.'
const COUPON_INACTIVE = 'Bu kupon aktif değildir.'
const COUPON_EXPIRED = 'Bu kuponun kullanım süresi dolmuştur.'
const COUPON_NOT_STARTED = 'Bu kupon henüz geçerli değildir.'
const COUPON_WRONG_PRODUCT = 'Bu kupon seçili ürün için geçerli değildir.'
const COUPON_USAGE_LIMIT = 'Bu kuponun kullanım limiti dolmuştur.'
const COUPON_CUSTOMER_LIMIT = 'Bu kupon için müşteri kullanım limiti dolmuştur.'
const COUPON_FIRST_PURCHASE = 'Bu kupon yalnızca ilk alışverişte geçerlidir.'
const COUPON_MIN_CART = 'Bu kupon için minimum sepet tutarı sağlanmıyor.'
const COUPON_NO_DISCOUNT = 'Bu kupon bu sepet için indirim uygulamıyor.'

function lineSubtotal(lines: CouponCartLine[]): number {
  return roundMoney(lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0))
}

export function evaluateCouponQuote(input: {
  coupon: CouponCheckoutRule | null
  lines: CouponCartLine[]
  usage?: CouponUsageCounts
  now?: Date
}): CouponEvaluation {
  const coupon = input.coupon
  if (!coupon || coupon.archivedAt) return { ok: false, message: COUPON_NOT_FOUND }
  if (!coupon.isActive) return { ok: false, message: COUPON_INACTIVE }

  const now = input.now ?? new Date()
  const ts = now.getTime()
  if (coupon.startsAt) {
    const start = new Date(coupon.startsAt).getTime()
    if (!Number.isNaN(start) && start > ts) return { ok: false, message: COUPON_NOT_STARTED }
  }
  if (coupon.endsAt) {
    const end = new Date(coupon.endsAt).getTime()
    if (!Number.isNaN(end) && end < ts) return { ok: false, message: COUPON_EXPIRED }
  }

  const lines = input.lines.filter((line) => line.quantity > 0 && line.unitPrice >= 0)
  if (lines.length === 0) return { ok: false, message: COUPON_WRONG_PRODUCT }

  const allowed = new Set(coupon.productIds)
  if (allowed.size > 0 && lines.some((line) => !allowed.has(line.productId))) {
    return { ok: false, message: COUPON_WRONG_PRODUCT }
  }

  const subtotal = lineSubtotal(lines)
  const minimum = coupon.minimumCartTotal
  if (minimum != null && minimum > 0 && subtotal < minimum) {
    return { ok: false, message: COUPON_MIN_CART }
  }

  const usage = input.usage ?? { totalUses: 0, customerUses: 0, customerPriorOrders: 0 }
  if (coupon.usageLimit != null && coupon.usageLimit >= 0 && usage.totalUses >= coupon.usageLimit) {
    return { ok: false, message: COUPON_USAGE_LIMIT }
  }
  if (
    coupon.perCustomerLimit != null &&
    coupon.perCustomerLimit >= 0 &&
    usage.customerUses >= coupon.perCustomerLimit
  ) {
    return { ok: false, message: COUPON_CUSTOMER_LIMIT }
  }
  if (coupon.firstPurchaseOnly === true && usage.customerPriorOrders > 0) {
    return { ok: false, message: COUPON_FIRST_PURCHASE }
  }

  let discount = 0
  if (coupon.discountType === 'percent') {
    const pct = Math.min(100, Math.max(0, coupon.discountValue))
    discount = subtotal * (pct / 100)
  } else {
    discount = Math.min(subtotal, Math.max(0, coupon.discountValue))
  }
  const discountAmount = roundMoney(Math.max(0, Math.min(subtotal, discount)))
  if (discountAmount <= 0) return { ok: false, message: COUPON_NO_DISCOUNT }

  return {
    ok: true,
    quote: {
      code: coupon.code.trim().toUpperCase(),
      couponId: coupon.id,
      couponName: coupon.name,
      discountType: coupon.discountType,
      discountValue: roundMoney(coupon.discountValue),
      discountAmount,
      subtotal,
      total: roundMoney(subtotal - discountAmount),
    },
  }
}
