import { isValidLicenseAppCodeFormat, normalizeLicenseAppCodeInput } from '../lib/licenseAppCode'
import {
  createLicenseServerProgram,
  fetchLicenseServerProgram,
  fetchLicenseServerPrograms,
  isLicenseServerConfigured,
  type LicenseServerProgram,
  type LicenseServerProgramCreateInput,
} from './woontegraLicenseServer.client'

export type LicenseProgramSaleStatus =
  | 'not_required'
  | 'missing_code'
  | 'invalid_format'
  | 'server_unconfigured'
  | 'not_found'
  | 'inactive'
  | 'active'

export async function listLicenseProgramsForAdmin(activeOnly = false): Promise<{
  programs: LicenseServerProgram[]
  configured: boolean
  error?: string
}> {
  if (!isLicenseServerConfigured()) {
    return {
      programs: [],
      configured: false,
      error: 'Lisans sunucusu yapılandırılmamış. LICENSE_SERVER_URL ve LICENSE_SERVER_INTEGRATION_SECRET kontrol edin.',
    }
  }
  const result = await fetchLicenseServerPrograms(activeOnly)
  return {
    programs: result.programs,
    configured: true,
    error: result.error,
  }
}

export async function createLicenseProgramForAdmin(
  input: LicenseServerProgramCreateInput,
): Promise<{ program?: LicenseServerProgram; error?: string; status: number }> {
  if (!isLicenseServerConfigured()) {
    return {
      error: 'Lisans sunucusu yapılandırılmamış.',
      status: 503,
    }
  }
  const appCode = normalizeLicenseAppCodeInput(input.appCode)
  if (!isValidLicenseAppCodeFormat(appCode)) {
    return {
      error: 'appCode büyük harf, rakam ve alt çizgi içermeli (ör. WOONTEGRA_ISLETME_KASASI).',
      status: 400,
    }
  }
  return createLicenseServerProgram({ ...input, appCode })
}

export async function resolveLicenseProgramSaleStatus(
  licenseRequired: boolean,
  licenseAppCode: string | null | undefined,
): Promise<LicenseProgramSaleStatus> {
  if (!licenseRequired) return 'not_required'
  const code = normalizeLicenseAppCodeInput(licenseAppCode)
  if (!code) return 'missing_code'
  if (!isValidLicenseAppCodeFormat(code)) return 'invalid_format'
  if (!isLicenseServerConfigured()) return 'server_unconfigured'

  const { program, error } = await fetchLicenseServerProgram(code)
  if (error && !program) return 'not_found'
  if (!program) return 'not_found'
  if (!program.isActive) return 'inactive'
  return 'active'
}

export async function assertLicensedProductSaleReady(row: {
  licenseRequired: boolean
  licenseAppCode: string | null | undefined
  isActive: boolean
  purchaseEnabled: boolean
}): Promise<void> {
  if (!row.licenseRequired) return
  if (!row.isActive || !row.purchaseEnabled) return

  const code = normalizeLicenseAppCodeInput(row.licenseAppCode)
  if (!code) {
    throw new Error('Merkezi lisans için appCode zorunludur.')
  }
  if (!isValidLicenseAppCodeFormat(code)) {
    throw new Error(
      'Lisans program kodu geçersiz. Büyük harf, rakam ve alt çizgi kullanın (ör. WOONTEGRA_ISLETME_KASASI).',
    )
  }
  if (!isLicenseServerConfigured()) {
    throw new Error(
      'Lisans sunucusu yapılandırılmamış. Satışa açık lisanslı ürün kaydedilemez.',
    )
  }

  const { program, error } = await fetchLicenseServerProgram(code)
  if (!program) {
    throw new Error(
      error?.includes('ulaşılamadı')
        ? error
        : 'Lisans programı lisans sunucusunda tanımlı değil.',
    )
  }
  if (!program.isActive) {
    throw new Error('Lisans programı pasif; ürün satışa açılamaz.')
  }
}
