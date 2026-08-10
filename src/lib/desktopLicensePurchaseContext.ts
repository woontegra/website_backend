export const DESKTOP_LICENSE_PURCHASE_CONTEXT_RENEWAL = 'DESKTOP_LICENSE_RENEWAL' as const

export type DesktopLicensePurchaseContextValue = typeof DESKTOP_LICENSE_PURCHASE_CONTEXT_RENEWAL

export function isDesktopLicenseRenewalOrderContext(
  ctx: string | null | undefined,
): ctx is DesktopLicensePurchaseContextValue {
  return ctx === DESKTOP_LICENSE_PURCHASE_CONTEXT_RENEWAL
}

export function desktopLicensePurchaseContextAdminLabel(ctx: string | null | undefined): string | null {
  if (ctx === DESKTOP_LICENSE_PURCHASE_CONTEXT_RENEWAL) return 'Masaüstü Lisans Yenileme'
  return null
}
