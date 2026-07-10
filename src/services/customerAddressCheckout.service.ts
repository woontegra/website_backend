import { prisma } from '../lib/prisma'
import {
  customerAddressFingerprint,
  customerAddressMatchesFingerprint,
  type CustomerAddressFingerprintInput,
} from '../lib/customerAddressFingerprint'

export type SaveCheckoutAddressInput = CustomerAddressFingerprintInput & {
  selectedAddressId?: string | null
}

export type SaveCheckoutAddressResult =
  | { ok: true; status: 'saved'; addressId: string }
  | { ok: true; status: 'skipped_unchanged' | 'skipped_duplicate' | 'skipped_incomplete' | 'skipped_disabled' }

function buildAddressTitle(city: string, district?: string | null): string {
  const c = city.trim()
  const d = district?.trim()
  if (c && d) return `${c}, ${d}`
  return c || 'Adres defteri'
}

export async function saveCustomerAddressFromCheckout(
  customerId: string,
  input: SaveCheckoutAddressInput,
): Promise<SaveCheckoutAddressResult> {
  const fullName = input.fullName.trim()
  const city = input.city.trim()
  const addressLine = input.addressLine.trim()
  if (!fullName || !city || !addressLine) {
    return { ok: true, status: 'skipped_incomplete' }
  }

  const payload: CustomerAddressFingerprintInput = {
    fullName,
    phone: input.phone?.trim() || null,
    city,
    district: input.district?.trim() || null,
    addressLine,
    postalCode: input.postalCode?.trim() || null,
    taxOffice: input.taxOffice?.trim() || null,
    taxNumber: input.taxNumber?.trim() || null,
    companyName: input.companyName?.trim() || null,
  }
  const fingerprint = customerAddressFingerprint(payload)

  const existingRows = await prisma.customerAddress.findMany({
    where: { customerId },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  })

  const selectedId = input.selectedAddressId?.trim()
  if (selectedId) {
    const selected = existingRows.find((row) => row.id === selectedId)
    if (selected && customerAddressMatchesFingerprint(selected, fingerprint)) {
      return { ok: true, status: 'skipped_unchanged' }
    }
  }

  if (existingRows.some((row) => customerAddressMatchesFingerprint(row, fingerprint))) {
    return { ok: true, status: 'skipped_duplicate' }
  }

  const hasDefault = existingRows.some((row) => row.isDefault)
  const isDefault = !hasDefault

  const created = await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } })
    }
    return tx.customerAddress.create({
      data: {
        customerId,
        title: buildAddressTitle(city, payload.district),
        fullName: payload.fullName,
        phone: payload.phone,
        city: payload.city,
        district: payload.district,
        addressLine: payload.addressLine,
        postalCode: payload.postalCode,
        taxOffice: payload.taxOffice,
        taxNumber: payload.taxNumber,
        companyName: payload.companyName,
        isDefault,
      },
    })
  })

  return { ok: true, status: 'saved', addressId: created.id }
}
