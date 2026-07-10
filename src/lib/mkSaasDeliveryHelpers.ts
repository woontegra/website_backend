/** Sistem tarafından admin notuna eklenir; bilgilendirme maili gönderildiğini işaretler. */
import { prisma } from './prisma'

export const MK_SAAS_PENDING_MAIL_ADMIN_NOTE_MARKER = '[woontegra:saas-pending-mail-sent]'

export const MK_OWNER_EMAIL_ALREADY_EXISTS_CODE = 'OWNER_EMAIL_ALREADY_EXISTS'

export const MK_DUPLICATE_EMAIL_ADMIN_MESSAGE =
  'MK SaaS tarafında bu e-posta zaten mevcut; otomatik bağlama için tenant bilgisi gerekiyor. Destek ile iletişime geçin veya teslimatı tekrar deneyin.'

export function isMkOwnerEmailDuplicateError(error: string, code?: string | null): boolean {
  if (code === MK_OWNER_EMAIL_ALREADY_EXISTS_CODE) return true
  return /daha önce Müvekkil Kasa hesabı|OWNER_EMAIL_ALREADY_EXISTS|otomatik bağlama yapılamaz/i.test(error)
}

export function formatMkOwnerEmailDuplicateError(rawError: string): string {
  if (isMkOwnerEmailDuplicateError(rawError)) {
    return MK_DUPLICATE_EMAIL_ADMIN_MESSAGE
  }
  return rawError.trim()
}

export function hasMkSaasPendingMailSent(adminNote: string | null | undefined): boolean {
  return (adminNote ?? '').includes(MK_SAAS_PENDING_MAIL_ADMIN_NOTE_MARKER)
}

export function appendMkSaasPendingMailAdminNote(adminNote: string | null | undefined): string {
  if (hasMkSaasPendingMailSent(adminNote)) {
    return (adminNote ?? '').trim()
  }
  const base = (adminNote ?? '').trim()
  return base
    ? `${base}\n${MK_SAAS_PENDING_MAIL_ADMIN_NOTE_MARKER}`
    : MK_SAAS_PENDING_MAIL_ADMIN_NOTE_MARKER
}

export function isMkSaasOrderItem(item: {
  downloadUrl?: string | null
  product?: { productType?: string; slug?: string | null; licenseAppCode?: string | null } | null
  productSlug?: string | null
}): boolean {
  const url = (item.downloadUrl ?? '').trim()
  if (url.startsWith('saas:')) return true
  if (item.product?.productType === 'SAAS') return true
  const slug = item.productSlug ?? item.product?.slug ?? ''
  return slug === 'muvekkil-kasa-defteri-web-tabanli'
}

export type SaasDeliveryStatusView = {
  paymentReceived: boolean
  saasAccessCreated: boolean
  saasAccessPending: boolean
  saasProvisionFailed: boolean
  activationEmailSent: boolean
  pendingInfoEmailSent: boolean
}

export async function resolveSaasDeliveryStatusView(input: {
  status: string
  downloadEmailSentAt: Date | null
  adminNote: string | null
  orderNo: string
  items: {
    id: string
    downloadUrl: string | null
    licenseServerLastError: string | null
    saasMembershipId?: string | null
  }[]
}): Promise<SaasDeliveryStatusView | null> {
  const mkItems = input.items.filter((i) => isMkSaasOrderItem(i))
  if (mkItems.length === 0) return null

  const paidLike = input.status === 'PAID' || input.status === 'PROCESSING'
  const mkErrors = mkItems
    .map((i) => i.licenseServerLastError?.trim())
    .filter((e): e is string => Boolean(e))

  let saasAccessCreated = false
  for (const item of mkItems) {
    if (item.saasMembershipId) {
      saasAccessCreated = true
      break
    }
    const extId = `${input.orderNo}:${item.id}`
    const membership = await prisma.customerSaasMembership.findUnique({
      where: { firstOrderId: extId },
      select: { licenseKey: true },
    })
    if (membership?.licenseKey?.trim()) {
      saasAccessCreated = true
      break
    }
  }

  return {
    paymentReceived: paidLike,
    saasAccessCreated: saasAccessCreated && mkErrors.length === 0,
    saasAccessPending: paidLike && !saasAccessCreated && mkErrors.length === 0,
    saasProvisionFailed: mkErrors.length > 0,
    activationEmailSent: Boolean(input.downloadEmailSentAt),
    pendingInfoEmailSent: hasMkSaasPendingMailSent(input.adminNote),
  }
}
