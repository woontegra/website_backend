export const DESKTOP_LICENSE_PURCHASE_CONTEXT_RENEWAL = 'DESKTOP_LICENSE_RENEWAL' as const
export const BILIRKISI_DESKTOP_FIRST_PURCHASE_CONTEXT = 'BILIRKISI_DESKTOP_FIRST_PURCHASE' as const

export type DesktopLicensePurchaseContextValue = typeof DESKTOP_LICENSE_PURCHASE_CONTEXT_RENEWAL

export function isDesktopLicenseRenewalOrderContext(
  ctx: string | null | undefined,
): ctx is DesktopLicensePurchaseContextValue {
  return ctx === DESKTOP_LICENSE_PURCHASE_CONTEXT_RENEWAL
}

export function isBilirkisiDesktopFirstPurchaseContext(ctx: string | null | undefined): boolean {
  return ctx === BILIRKISI_DESKTOP_FIRST_PURCHASE_CONTEXT
}

export function desktopLicensePurchaseContextAdminLabel(ctx: string | null | undefined): string | null {
  if (ctx === DESKTOP_LICENSE_PURCHASE_CONTEXT_RENEWAL) return 'Masaüstü Lisans Yenileme'
  if (ctx === BILIRKISI_DESKTOP_FIRST_PURCHASE_CONTEXT) return 'Bilirkişi Desktop İlk Satın Alma'
  return null
}
