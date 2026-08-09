export type LicensePurchasePublicView = {
  purchaseContext: 'DEMO_CONVERSION' | 'LICENSE_RENEWAL' | 'EXISTING_ACCOUNT_LICENSE'
  sessionId: string
  productCode: 'MUVEKKIL_KASA_SAAS'
  purpose: 'DEMO_CONVERSION' | 'LICENSE_RENEWAL' | 'LICENSE_PURCHASE'
  musteriNo: string
  buroAdi: string
  demoMu: boolean
  lisansDurumu: string
  kalanGun: number | null
  lisansBitisTarihi: string | null
  lisansBaslangicTarihi: string | null
  extensionBaseDate: string
  ownerEmail: string | null
  expiresAt: string
  status: string
  boundExternalOrderId: string | null
}

export type LicensePurchaseRenewalPreview = {
  currentLicenseEndDate: string | null
  extensionBaseDate: string
  estimatedNewEndDate: string
  renewalDays: number
}

export type LicensePurchaseFulfillResponse = {
  ok: true
  status: 'licensed' | 'already_licensed'
  tenantId: string
  tenantSlug: string
  licenseKey: string | null
  previousEndDate: string
  newEndDate: string
  renewalDays: number
  demoMu: boolean
}
