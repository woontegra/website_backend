export type DesktopLicenseProgramOption = {
  label: string
  appCode: string
}

/** Woontegra-Lisans-Server program kodları — admin ürün formu dropdown */
export const DESKTOP_LICENSE_PROGRAMS: DesktopLicenseProgramOption[] = [
  { label: 'Müvekkil Kasa Defteri Desktop', appCode: 'MUVEKKIL_KASA_DESKTOP' },
  { label: 'Şifre Kasası Desktop', appCode: 'SIFRE_KASASI_DESKTOP' },
  { label: 'İşletme Defteri Desktop', appCode: 'ISLETME_DEFTERI_DESKTOP' },
  { label: 'Optik Desktop', appCode: 'OPTIK_DESKTOP' },
  { label: 'Bilirkişi Desktop', appCode: 'BILIRKISI_DESKTOP' },
]

const APP_CODES = new Set(DESKTOP_LICENSE_PROGRAMS.map((p) => p.appCode))

export function isKnownDesktopLicenseAppCode(code: string | null | undefined): boolean {
  return APP_CODES.has((code ?? '').trim())
}
