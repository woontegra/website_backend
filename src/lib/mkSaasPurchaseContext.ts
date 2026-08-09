export const MK_SAAS_PURCHASE_CONTEXT_DEMO = 'DEMO_CONVERSION' as const
export const MK_SAAS_PURCHASE_CONTEXT_RENEWAL = 'LICENSE_RENEWAL' as const
/** @deprecated Eski demo akışı kayıtları */
export const MK_SAAS_PURCHASE_CONTEXT_LEGACY = 'EXISTING_ACCOUNT_LICENSE' as const

export type MkSaasPurchaseContextValue =
  | typeof MK_SAAS_PURCHASE_CONTEXT_DEMO
  | typeof MK_SAAS_PURCHASE_CONTEXT_RENEWAL
  | typeof MK_SAAS_PURCHASE_CONTEXT_LEGACY

export function isMkSaasExistingAccountOrderContext(ctx: string | null | undefined): ctx is MkSaasPurchaseContextValue {
  if (!ctx) return false
  return (
    ctx === MK_SAAS_PURCHASE_CONTEXT_DEMO ||
    ctx === MK_SAAS_PURCHASE_CONTEXT_RENEWAL ||
    ctx === MK_SAAS_PURCHASE_CONTEXT_LEGACY
  )
}

export function purchaseContextFromMkToken(input: {
  purpose?: string | null
  purchaseContext?: string | null
}): MkSaasPurchaseContextValue {
  const ctx = input.purchaseContext?.trim()
  const purpose = input.purpose?.trim()
  if (ctx === MK_SAAS_PURCHASE_CONTEXT_RENEWAL || purpose === 'LICENSE_RENEWAL') {
    return MK_SAAS_PURCHASE_CONTEXT_RENEWAL
  }
  if (
    ctx === MK_SAAS_PURCHASE_CONTEXT_DEMO ||
    purpose === 'DEMO_CONVERSION' ||
    purpose === 'LICENSE_PURCHASE'
  ) {
    return MK_SAAS_PURCHASE_CONTEXT_DEMO
  }
  return MK_SAAS_PURCHASE_CONTEXT_LEGACY
}

export function mkSaasPurchaseContextAdminLabel(ctx: string | null | undefined): string | null {
  if (ctx === MK_SAAS_PURCHASE_CONTEXT_RENEWAL) return 'Mevcut Hesap Lisans Yenileme'
  if (ctx === MK_SAAS_PURCHASE_CONTEXT_DEMO || ctx === MK_SAAS_PURCHASE_CONTEXT_LEGACY) {
    return 'Mevcut Hesap Lisanslama (Demo → Ücretli)'
  }
  return null
}
