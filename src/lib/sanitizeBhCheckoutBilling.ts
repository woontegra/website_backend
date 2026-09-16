/**
 * Sanitize + validate BH checkout billing before upstream forward.
 * Does not log TCKN/VKN. Does not put sensitive ids into customerNote.
 */
export type BhBillingSanitizeResult =
  | { ok: true; billingInfo: Record<string, unknown> }
  | { ok: false; message: string }

function digitsOnly(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, max)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim()
}

export function sanitizeBhCheckoutBilling(
  raw: Record<string, unknown> | null | undefined,
  trustedEmail: string,
): BhBillingSanitizeResult {
  const src = raw && typeof raw === 'object' ? raw : {}
  const invoiceTypeRaw = String(src.invoiceType || 'individual').toLowerCase()
  const corporate = invoiceTypeRaw === 'corporate'
  const invoiceType = corporate ? 'corporate' : 'individual'

  const fullName = text(src.fullName || src.name)
  const companyName = text(src.companyName)
  const phone = text(src.phone)
  const city = text(src.city)
  const district = text(src.district)
  const openAddress = text(src.openAddress || src.address)
  const taxOffice = text(src.taxOffice)
  const identityNumber = digitsOnly(src.identityNumber ?? src.identity_number, 11)
  const taxNumber = digitsOnly(src.taxNumber ?? src.tax_number, 10)
  const email = trustedEmail.trim().toLowerCase()

  if (!email || !email.includes('@')) {
    return { ok: false, message: 'Geçerli bir e-posta adresi gerekli.' }
  }
  if (!phone || phone.replace(/\D/g, '').length < 10) {
    return { ok: false, message: 'Telefon numarası zorunludur.' }
  }
  if (!city || !district) {
    return { ok: false, message: 'İl ve ilçe seçimi zorunludur.' }
  }
  if (!openAddress || openAddress.length < 5) {
    return { ok: false, message: 'Fatura adresi en az 5 karakter olmalıdır.' }
  }

  if (corporate) {
    if (!companyName) return { ok: false, message: 'Firma / unvan zorunludur.' }
    if (!fullName) return { ok: false, message: 'Yetkili ad soyad zorunludur.' }
    if (taxNumber.length !== 10) return { ok: false, message: 'Vergi numarası 10 haneli olmalıdır.' }
    if (!taxOffice) return { ok: false, message: 'Vergi dairesi zorunludur.' }
  } else {
    if (!fullName) return { ok: false, message: 'Ad soyad zorunludur.' }
    if (identityNumber && identityNumber.length !== 11) {
      return { ok: false, message: 'T.C. Kimlik No 11 haneli olmalıdır.' }
    }
  }

  const composedAddress = `${openAddress}${district ? ` — ${district}` : ''}${city ? ` / ${city}` : ''}`

  const billingInfo: Record<string, unknown> = {
    invoiceType,
    fullName,
    name: fullName,
    email,
    phone,
    city,
    district,
    openAddress,
    address: composedAddress,
  }

  if (corporate) {
    billingInfo.companyName = companyName
    billingInfo.taxOffice = taxOffice
    billingInfo.taxNumber = taxNumber
  } else if (identityNumber) {
    billingInfo.identityNumber = identityNumber
  }

  return { ok: true, billingInfo }
}
