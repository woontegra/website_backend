export type CustomerAddressFingerprintInput = {
  fullName: string
  phone?: string | null
  city: string
  district?: string | null
  addressLine: string
  postalCode?: string | null
  taxOffice?: string | null
  taxNumber?: string | null
  companyName?: string | null
}

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

export function customerAddressFingerprint(input: CustomerAddressFingerprintInput): string {
  return [
    norm(input.fullName),
    norm(input.phone),
    norm(input.city),
    norm(input.district),
    norm(input.addressLine),
    norm(input.postalCode),
    norm(input.taxOffice),
    norm(input.taxNumber),
    norm(input.companyName),
  ].join('|')
}

export function customerAddressMatchesFingerprint(
  row: CustomerAddressFingerprintInput,
  fingerprint: string,
): boolean {
  return customerAddressFingerprint(row) === fingerprint
}
