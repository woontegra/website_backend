import { BH_DESKTOP_LICENSE_DAYS } from './bhDesktopYearlyOffer'
import { BILIRKISI_DESKTOP_ORDER_DOWNLOAD } from './bhDesktopPurchaseMail'

export type ResendDeliveryFact = { label: string; value: string }

export type ResendDeliveryMailLine = {
  id: string
  productName: string
  downloadUrl: string
  productId?: string
  licenses?: { licenseKey: string; activationPassword?: string }[]
  windowsInstallerUrl?: string | null
  purchaseInstaller?: { url: string; label: string; heading: string } | null
  deliveryFacts?: ResendDeliveryFact[]
  saas?: {
    licenseKey: string
    ownerEmail: string
    ownerUsername: string | null
    temporaryPassword: string | null
    loginUrl: string | null
    musteriNo: string | null
    tenantSlug: string
    tenantName: string
    licenseStartDate: string
    licenseEndDate: string
    mkActivationMailSent: boolean
  }
}

export type ResendOrderItemInput = {
  id: string
  productName: string
  productId: string | null
  downloadUrl: string | null
  productType: string | null
  productSlug: string | null
  licenseServerLicenseKey: string | null
  licenseServerActivationPasswordPending: string | null
  saasMembershipId: string | null
}

export type ResendMembershipInput = {
  id: string
  firstOrderId: string
  licenseKey: string
  ownerEmail: string
  tenantSlug: string
  licenseStartDate: Date
  licenseEndDate: Date
}

export type ResendLicenseInput = {
  orderItemId: string | null
  licenseKey: string
}

export type ResendOrderInput = {
  status: string
  orderNo: string
  customerEmail: string
  desktopPurchasePlatform: string | null
  desktopLicenseNewEndDate: Date | null
  paymentConfirmedAt: Date | null
  hasSuccessfulPayment: boolean
  items: ResendOrderItemInput[]
  memberships: ResendMembershipInput[]
  licenses: ResendLicenseInput[]
}

const BH_MACOS_INSTALLER_LABEL = 'macOS Kurulumunu İndir'

export function deliveryResendBlockReason(input: {
  status: string
  paymentConfirmedAt: Date | null
  hasSuccessfulPayment: boolean
}): string | null {
  if (input.status === 'PAID') return null
  if (input.status === 'PROCESSING' && (input.paymentConfirmedAt || input.hasSuccessfulPayment)) return null
  if (input.status === 'PENDING') return 'Ödeme henüz onaylanmadığı için teslimat e-postası gönderilmez.'
  if (input.status === 'FAILED') return 'Başarısız ödemede teslimat e-postası gönderilmez.'
  if (input.status === 'CANCELLED') return 'İptal edilmiş siparişte teslimat e-postası gönderilmez.'
  return 'Yalnız ödenmiş ve teslim edilebilir siparişlerde e-posta yeniden gönderilir.'
}

function isSaasItem(item: ResendOrderItemInput): boolean {
  if (isBhDesktopItem(item)) return false
  const url = (item.downloadUrl ?? '').trim()
  if (url.startsWith('saas:')) return true
  if (item.productType === 'SAAS') return true
  return item.productSlug === 'muvekkil-kasa-defteri-web-tabanli'
}

function isBhDesktopItem(item: ResendOrderItemInput): boolean {
  return (item.downloadUrl ?? '').trim() === BILIRKISI_DESKTOP_ORDER_DOWNLOAD
}

function formatTrDate(value: Date): string {
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(value)
}

function licenseDurationLabel(newEndDate: Date | null): string {
  if (newEndDate) return `${formatTrDate(newEndDate)} tarihine kadar`
  return `${BH_DESKTOP_LICENSE_DAYS} gün`
}

function platformLabel(platform: string | null): 'Windows' | 'macOS' | null {
  const normalized = (platform ?? '').trim().toUpperCase()
  if (normalized === 'WINDOWS') return 'Windows'
  if (normalized === 'MACOS') return 'macOS'
  return null
}

function membershipForItem(orderNo: string, item: ResendOrderItemInput, memberships: ResendMembershipInput[]) {
  return (
    memberships.find((row) => item.saasMembershipId && row.id === item.saasMembershipId) ??
    memberships.find((row) => row.firstOrderId === `${orderNo}:${item.id}`) ??
    null
  )
}

function existingLicenseKey(item: ResendOrderItemInput, licenses: ResendLicenseInput[]): string | null {
  const stored = item.licenseServerLicenseKey?.trim()
  if (stored) return stored
  const local = licenses.find((row) => row.orderItemId === item.id && row.licenseKey.trim())
  return local?.licenseKey.trim() || null
}

export function buildResendDeliveryMailLines(
  order: ResendOrderInput,
  installers: { windows: string | null; macos: string | null },
): { ok: true; lines: ResendDeliveryMailLine[] } | { ok: false; message: string } {
  const email = order.customerEmail.trim()
  if (!email) return { ok: false, message: 'Siparişte müşteri e-posta adresi yok.' }

  const lines: ResendDeliveryMailLine[] = []
  for (const item of order.items) {
    if (isBhDesktopItem(item)) {
      const licenseKey = existingLicenseKey(item, order.licenses)
      if (!licenseKey) {
        return { ok: false, message: 'Mevcut lisans anahtarı bulunamadı. Yeni lisans oluşturulmaz.' }
      }
      const platform = platformLabel(order.desktopPurchasePlatform)
      if (!platform) {
        return { ok: false, message: 'Siparişin platformu Windows veya macOS değil. Kurulum bağlantısı eklenemez.' }
      }
      const activationPassword = item.licenseServerActivationPasswordPending?.trim() || ''
      const facts: ResendDeliveryFact[] = [
        { label: 'Platform', value: platform },
        { label: 'Lisans süresi', value: licenseDurationLabel(order.desktopLicenseNewEndDate) },
      ]
      if (!activationPassword) {
        facts.push({
          label: 'Aktivasyon bilgisi',
          value: 'Mevcut aktivasyon şifresi ilk teslimat e-postasında iletildi. Yeni şifre üretilmedi.',
        })
      }
      const line: ResendDeliveryMailLine = {
        id: item.id,
        productName: item.productName,
        productId: item.productId ?? undefined,
        downloadUrl: BILIRKISI_DESKTOP_ORDER_DOWNLOAD,
        licenses: [{ licenseKey, ...(activationPassword ? { activationPassword } : {}) }],
        deliveryFacts: facts,
      }
      if (platform === 'Windows') {
        if (!installers.windows) {
          return { ok: false, message: 'Admin ürün kaydında güncel Windows kurulum bağlantısı yok. E-posta gönderilmedi.' }
        }
        line.windowsInstallerUrl = installers.windows
      } else {
        if (!installers.macos) {
          return { ok: false, message: 'Admin ürün kaydında güncel macOS kurulum bağlantısı yok. E-posta gönderilmedi.' }
        }
        line.purchaseInstaller = {
          url: installers.macos,
          label: BH_MACOS_INSTALLER_LABEL,
          heading: 'macOS kurulumu',
        }
      }
      lines.push(line)
      continue
    }

    if (isSaasItem(item)) {
      const membership = membershipForItem(order.orderNo, item, order.memberships)
      if (!membership?.licenseKey.trim() || !membership.ownerEmail.trim()) {
        return { ok: false, message: 'Mevcut SaaS erişim kaydı bulunamadı. Yeni üyelik oluşturulmaz.' }
      }
      const downloadUrl = (item.downloadUrl ?? '').trim().startsWith('saas:')
        ? item.downloadUrl!.trim()
        : 'saas:muvekkil-kasa'
      lines.push({
        id: item.id,
        productName: item.productName,
        productId: item.productId ?? undefined,
        downloadUrl,
        saas: {
          licenseKey: membership.licenseKey.trim(),
          ownerEmail: membership.ownerEmail.trim(),
          ownerUsername: null,
          temporaryPassword: null,
          loginUrl: null,
          musteriNo: null,
          tenantSlug: membership.tenantSlug,
          tenantName: membership.tenantSlug,
          licenseStartDate: membership.licenseStartDate.toISOString(),
          licenseEndDate: membership.licenseEndDate.toISOString(),
          mkActivationMailSent: false,
        },
      })
      continue
    }

    const downloadUrl = (item.downloadUrl ?? '').trim()
    if (!downloadUrl) continue
    const licenseKey = existingLicenseKey(item, order.licenses)
    const activationPassword = item.licenseServerActivationPasswordPending?.trim() || ''
    lines.push({
      id: item.id,
      productName: item.productName,
      productId: item.productId ?? undefined,
      downloadUrl,
      ...(licenseKey
        ? { licenses: [{ licenseKey, ...(activationPassword ? { activationPassword } : {}) }] }
        : {}),
    })
  }

  if (lines.length === 0) {
    return { ok: false, message: 'Bu sipariş için yeniden gönderilecek teslimat içeriği yok.' }
  }
  return { ok: true, lines }
}
