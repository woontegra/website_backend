export type OrderInvoiceAddress = {
  billingCity: string | null
  billingDistrict: string | null
  billingAddress: string | null
}

const CHECKOUT_ADDRESS_WINDOW_MS = 15 * 60 * 1000

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function invoiceAddressFromBilling(
  billing: Record<string, unknown> | null | undefined,
): OrderInvoiceAddress {
  const source = billing && typeof billing === 'object' ? billing : {}
  const city = text(source.city)
  const district = text(source.district)
  const address = text(source.openAddress || source.addressLine || source.address)
  return {
    billingCity: city || null,
    billingDistrict: district || null,
    billingAddress: address || null,
  }
}

export function invoiceAddressFromDelivery(input: {
  deliveryCity?: string | null
  deliveryDistrict?: string | null
  deliveryLine?: string | null
}): OrderInvoiceAddress {
  return invoiceAddressFromBilling({
    city: input.deliveryCity,
    district: input.deliveryDistrict,
    openAddress: input.deliveryLine,
  })
}

type CheckoutAddress = {
  city: string
  district?: string | null
  addressLine: string
  createdAt: Date
}

/** Sipariş kolonları boşsa, checkout anında kaydedilmiş adres defteri satırını kullanır. */
export function invoiceAddressFromCheckoutBook(
  orderCreatedAt: Date,
  addresses: CheckoutAddress[],
): OrderInvoiceAddress | null {
  let best: CheckoutAddress | null = null
  let bestDelta = Number.POSITIVE_INFINITY
  for (const address of addresses) {
    const delta = Math.abs(address.createdAt.getTime() - orderCreatedAt.getTime())
    if (delta > CHECKOUT_ADDRESS_WINDOW_MS || delta >= bestDelta) continue
    best = address
    bestDelta = delta
  }
  if (!best) return null
  const city = best.city.trim()
  const district = best.district?.trim() || ''
  const address = best.addressLine.trim()
  if (!city && !district && !address) return null
  return {
    billingCity: city || null,
    billingDistrict: district || null,
    billingAddress: address || null,
  }
}

export function resolveOrderInvoiceAddress(
  stored: OrderInvoiceAddress,
  checkoutBook: OrderInvoiceAddress | null,
): OrderInvoiceAddress {
  if (stored.billingCity || stored.billingDistrict || stored.billingAddress) return stored
  return (
    checkoutBook ?? {
      billingCity: null,
      billingDistrict: null,
      billingAddress: null,
    }
  )
}
