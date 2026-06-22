import { escapeHtml } from './legalSeller'

export type LegalBuyerInput = {
  customerName?: string | null
  customerEmail?: string | null
  customerPhone?: string | null
  billingType?: string | null
  companyName?: string | null
  taxOffice?: string | null
  taxNumber?: string | null
  city?: string | null
  district?: string | null
  addressLine?: string | null
}

function pick(value?: string | null): string {
  return (value ?? '').trim()
}

function isCorporate(billingType: string): boolean {
  const t = billingType.toLowerCase()
  return t === 'kurumsal' || t === 'corporate' || t === 'şirket' || t === 'sirket'
}

export function buildFullAddress(input: LegalBuyerInput): string {
  const line = pick(input.addressLine)
  const district = pick(input.district)
  const city = pick(input.city)
  return [line, district, city].filter(Boolean).join(', ')
}

function line(label: string, value: string): string {
  if (!value) return ''
  return `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`
}

/** Yasal metinlerde alıcı/abone bilgi bloğu — boş alanlar satır olarak eklenmez. */
export function buildBuyerInfoBlockHtml(input: LegalBuyerInput): string {
  const name = pick(input.customerName)
  const email = pick(input.customerEmail)
  const phone = pick(input.customerPhone)
  const billingType = pick(input.billingType)
  const companyName = pick(input.companyName)
  const taxOffice = pick(input.taxOffice)
  const taxNumber = pick(input.taxNumber)
  const fullAddress = buildFullAddress(input)
  const corporate = billingType ? isCorporate(billingType) : !!companyName && !!taxOffice

  const rows: string[] = []

  if (corporate) {
    if (companyName) rows.push(line('Firma Unvanı', companyName))
    if (name) rows.push(line('Yetkili / İletişim', name))
    if (taxNumber) rows.push(line('Vergi No', taxNumber))
    if (taxOffice) rows.push(line('Vergi Dairesi', taxOffice))
  } else {
    if (name) rows.push(line('Ad Soyad', name))
    if (taxNumber) rows.push(line('T.C. Kimlik No', taxNumber))
  }

  if (billingType) rows.push(line('Fatura Tipi', billingType))
  if (email) rows.push(line('E-posta', email))
  if (phone) rows.push(line('Telefon', phone))
  if (fullAddress) rows.push(line('Adres', fullAddress))

  if (rows.length === 0) {
    return '<div class="legal-buyer-block"><p>Alıcı bilgileri sipariş formunda henüz girilmedi.</p></div>'
  }

  return `<div class="legal-buyer-block">\n<h3>Alıcı / Abone Bilgileri</h3>\n${rows.join('\n')}\n</div>`
}

export function buildLegalBuyerVariables(input: LegalBuyerInput): Record<string, string> {
  const name = pick(input.customerName)
  const email = pick(input.customerEmail)
  const fullAddress = buildFullAddress(input)
  return {
    customerName: name,
    buyerName: name,
    customerEmail: email,
    email,
    customerPhone: pick(input.customerPhone),
    phone: pick(input.customerPhone),
    billingType: pick(input.billingType),
    invoiceType: pick(input.billingType),
    companyName: pick(input.companyName),
    taxOffice: pick(input.taxOffice),
    taxNumber: pick(input.taxNumber),
    identityNumber: pick(input.taxNumber),
    city: pick(input.city),
    district: pick(input.district),
    address: pick(input.addressLine),
    addressLine: pick(input.addressLine),
    fullAddress,
    buyerInfoBlock: buildBuyerInfoBlockHtml(input),
  }
}

export function legalBuyerInputFromRecord(record: Record<string, string>): LegalBuyerInput {
  return {
    customerName: record.customerName || record.buyerName,
    customerEmail: record.customerEmail || record.email,
    customerPhone: record.customerPhone || record.phone,
    billingType: record.billingType || record.invoiceType,
    companyName: record.companyName,
    taxOffice: record.taxOffice,
    taxNumber: record.taxNumber || record.identityNumber,
    city: record.city,
    district: record.district,
    addressLine: record.addressLine || record.address,
  }
}

export function enrichLegalBuyerVariables(vars: Record<string, string>): Record<string, string> {
  const buyer = buildLegalBuyerVariables(legalBuyerInputFromRecord(vars))
  return { ...vars, ...buyer }
}
