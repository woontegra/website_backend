export const BH_BANK_TRANSFER_ACTIVATION_NOTE =
  'Ödemeniz banka hesabımıza ulaştıktan ve onaylandıktan sonra aboneliğiniz/lisansınız aktif edilecektir.'

export function bilirkisiPackageLabel(
  productType: string | null | undefined,
  _subscriptionPeriod?: number | null,
): string {
  const type = String(productType || '').trim().toLowerCase()
  if (type === 'monthly') return 'Aylık'
  if (type === 'annual') return 'Yıllık'
  return 'Abonelik'
}

/** Mail tutarı siparişin kayıtlı nihai toplamıdır. Liste fiyatı ve kalem ara toplamı kullanılmaz. */
export function bankTransferMailAmountTl(input: { orderTotal: number }): number {
  return input.orderTotal
}

export function formatBankTransferMailAmount(orderTotalTl: number, currency = 'TRY'): string {
  const amount = bankTransferMailAmountTl({ orderTotal: orderTotalTl })
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: currency || 'TRY' }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency || 'TRY'}`
  }
}

export function shouldSendBankTransferOrderReceivedMail(input: {
  paymentProvider: string
  createdNewOrder: boolean
}): boolean {
  return input.paymentProvider === 'BANK_TRANSFER' && input.createdNewOrder
}

/**
 * Aktivasyon maili yalnız havale onayında, Bilirkişi fulfillment bu çağrıda APPLIED olduğunda gider.
 * PayTR ve zaten APPLIED kayıtlar tekrar mail üretmez. FAILED kayıt mail üretmez.
 */
export function shouldSendBilirkisiSubscriptionActivatedMail(input: {
  paymentProvider: string
  bhSaleRef?: string | null
  fulfillmentStatusBefore?: string | null
  fulfillmentStatusAfter?: string | null
}): boolean {
  if (input.paymentProvider !== 'BANK_TRANSFER') return false
  if (!String(input.bhSaleRef || '').trim()) return false
  if (input.fulfillmentStatusBefore === 'APPLIED') return false
  return input.fulfillmentStatusAfter === 'APPLIED'
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type BankTransferReceivedMailContent = {
  subject: string
  text: string
  html: string
}

export function buildBankTransferReceivedMail(input: {
  customerName: string
  orderNo: string
  amountFormatted: string
  bankName: string
  accountHolder: string
  iban: string
  productName?: string | null
  packageLabel?: string | null
  branchName?: string | null
  accountNumber?: string | null
  instructions?: string | null
  includeActivationNote?: boolean
}): BankTransferReceivedMailContent {
  const warn =
    'Lütfen ödeme açıklamasına sipariş numaranızı yazınız. Açıklama yazılmadığında ödeme onayı gecikebilir.'
  const rows: Array<{ label: string; value: string; mono?: boolean }> = []
  if (input.productName?.trim()) rows.push({ label: 'Ürün', value: input.productName.trim() })
  if (input.packageLabel?.trim()) rows.push({ label: 'Paket', value: input.packageLabel.trim() })
  rows.push(
    { label: 'Sipariş no', value: input.orderNo },
    { label: 'Ödenecek tutar', value: input.amountFormatted },
    { label: 'Banka', value: input.bankName },
    { label: 'Hesap Sahibi', value: input.accountHolder },
  )
  if (input.branchName?.trim()) rows.push({ label: 'Şube', value: input.branchName.trim() })
  if (input.accountNumber?.trim()) rows.push({ label: 'Hesap no', value: input.accountNumber.trim() })
  rows.push(
    { label: 'IBAN', value: input.iban, mono: true },
    { label: 'Ödeme Açıklaması / Sipariş No', value: input.orderNo, mono: true },
  )

  const textLines = [
    `Merhaba ${input.customerName},`,
    '',
    'Havale/EFT siparişiniz alındı. Ödeme bilgileriniz:',
    '',
    ...rows.map((row) => `${row.label}: ${row.value}`),
    '',
    warn,
  ]
  if (input.instructions?.trim()) {
    textLines.push('', `Not: ${input.instructions.trim()}`)
  }
  if (input.includeActivationNote) {
    textLines.push('', BH_BANK_TRANSFER_ACTIVATION_NOTE)
  }
  textLines.push('', 'İyi günler,', 'Woontegra')

  const rowsHtml = rows
    .map(
      (row) =>
        `<tr><td><b>${escapeHtml(row.label)}</b></td><td${row.mono ? ' style="font-family:monospace"' : ''}>${escapeHtml(row.value)}</td></tr>`,
    )
    .join('')
  const noteHtml = input.includeActivationNote
    ? `<p>${escapeHtml(BH_BANK_TRANSFER_ACTIVATION_NOTE)}</p>`
    : ''
  const instructionsHtml = input.instructions?.trim()
    ? `<p><i>${escapeHtml(input.instructions.trim())}</i></p>`
    : ''

  return {
    subject: `Havale/EFT Siparişiniz Alındı — ${input.orderNo}`,
    text: textLines.join('\n'),
    html: `
      <p>Merhaba ${escapeHtml(input.customerName)},</p>
      <p>Havale/EFT siparişiniz alındı. Aşağıdaki hesaba <b>${escapeHtml(input.amountFormatted)}</b> tutarında Havale veya EFT yapabilirsiniz.</p>
      <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;border-color:#ccc;max-width:560px">
        ${rowsHtml}
      </table>
      ${instructionsHtml}
      <p style="margin-top:16px;padding:12px;background:#fff8e6;border:1px solid #f0d060;border-radius:8px"><b>Önemli:</b> ${escapeHtml(warn)}</p>
      ${noteHtml}
      <p>Sorularınız için: <a href="mailto:info@woontegra.com">info@woontegra.com</a></p>
      <p>İyi günler,<br/>Woontegra</p>
    `,
  }
}

export function buildBilirkisiSubscriptionActivatedMail(input: {
  customerName: string
  orderNo: string
  productName: string
  packageLabel: string
  amountFormatted: string
}): BankTransferReceivedMailContent {
  const text = [
    `Merhaba ${input.customerName},`,
    '',
    'Ödemeniz onaylandı. Bilirkişi Hesap aboneliğiniz aktif edildi.',
    '',
    `Ürün: ${input.productName}`,
    `Paket: ${input.packageLabel}`,
    `Sipariş no: ${input.orderNo}`,
    `Ödenen tutar: ${input.amountFormatted}`,
    '',
    'İyi çalışmalar,',
    'Woontegra',
  ].join('\n')
  return {
    subject: `Ödemeniz Onaylandı — Bilirkişi Hesap Aboneliğiniz Aktif — ${input.orderNo}`,
    text,
    html: `
      <p>Merhaba ${escapeHtml(input.customerName)},</p>
      <p>Ödemeniz onaylandı. <b>Bilirkişi Hesap</b> aboneliğiniz aktif edildi.</p>
      <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;border-color:#ccc;max-width:560px">
        <tr><td><b>Ürün</b></td><td>${escapeHtml(input.productName)}</td></tr>
        <tr><td><b>Paket</b></td><td>${escapeHtml(input.packageLabel)}</td></tr>
        <tr><td><b>Sipariş no</b></td><td>${escapeHtml(input.orderNo)}</td></tr>
        <tr><td><b>Ödenen tutar</b></td><td>${escapeHtml(input.amountFormatted)}</td></tr>
      </table>
      <p>Sorularınız için: <a href="mailto:info@woontegra.com">info@woontegra.com</a></p>
      <p>İyi çalışmalar,<br/>Woontegra</p>
    `,
  }
}
