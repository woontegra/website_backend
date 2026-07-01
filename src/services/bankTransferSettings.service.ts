import { prisma } from '../lib/prisma'

export type PublicBankTransferDisplay = {
  /** Havale/EFT seçilebilir ve tam banka bilgisi var */
  bankTransferEnabled: boolean
  /** @deprecated — bankTransferEnabled ile aynı */
  configured: boolean
  bankName?: string
  branchName?: string
  accountNumber?: string
  accountHolder?: string
  iban?: string
  currency?: string
  referenceNote?: string
}

export type BankTransferCustomerInfo = {
  bankName: string
  accountHolder: string
  iban: string
  /** Boşluksuz IBAN (kopyalama) */
  ibanCompact: string
  branchName?: string | null
  accountNumber?: string | null
  instructions?: string | null
  /** Ödeme açıklaması = sipariş numarası */
  paymentReference: string
  orderTotal: number
  currency: string
  amountFormatted: string
}

function compactIban(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase()
}

function formatAmountTr(total: number, currency: string): string {
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: currency || 'TRY' }).format(total)
  } catch {
    return `${total.toFixed(2)} ${currency || 'TRY'}`
  }
}

/** Yayınlanmış ve zorunlu alanlar doluysa true (IBAN, banka adı, hesap sahibi şart). */
export async function getPublicBankTransferDisplay(): Promise<PublicBankTransferDisplay> {
  const row = await prisma.bankTransferSettings.findUnique({ where: { id: 'default' } })
  if (!row?.isPublished) {
    return { bankTransferEnabled: false, configured: false }
  }
  const iban = compactIban(row.iban ?? '')
  const bankName = row.bankName?.trim() || ''
  const accountHolder = row.accountHolder?.trim() || ''
  const branchName = row.branchName?.trim() || ''
  const accountNumber = row.accountNumber?.trim() || ''
  const referenceNote = row.referenceNote?.trim() || ''

  const bankTransferEnabled = iban.length >= 15 && bankName.length > 0 && accountHolder.length > 0

  if (!bankTransferEnabled) {
    return { bankTransferEnabled: false, configured: false }
  }

  return {
    bankTransferEnabled: true,
    configured: true,
    bankName,
    branchName: branchName || undefined,
    accountNumber: accountNumber || undefined,
    accountHolder,
    iban: row.iban?.trim() || iban,
    currency: row.currency?.trim() || 'TRY',
    referenceNote: referenceNote || undefined,
  }
}

/** Müşteri ekranları ve e-posta için tam banka satırı; ayar yoksa null */
export async function getBankTransferCustomerInfo(
  ctx: {
    orderNo: string
    total: number
    currency: string
  },
  cachedDisplay?: PublicBankTransferDisplay,
): Promise<BankTransferCustomerInfo | null> {
  const pub = cachedDisplay ?? (await getPublicBankTransferDisplay())
  if (!pub.bankTransferEnabled || !pub.iban || !pub.bankName || !pub.accountHolder) return null
  const ibanCompact = compactIban(pub.iban)
  return {
    bankName: pub.bankName,
    accountHolder: pub.accountHolder,
    iban: pub.iban,
    ibanCompact,
    branchName: pub.branchName ?? null,
    accountNumber: pub.accountNumber ?? null,
    instructions: pub.referenceNote ?? null,
    paymentReference: ctx.orderNo.trim(),
    orderTotal: ctx.total,
    currency: (ctx.currency || 'TRY').trim(),
    amountFormatted: formatAmountTr(ctx.total, ctx.currency || 'TRY'),
  }
}
