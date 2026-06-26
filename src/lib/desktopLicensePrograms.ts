export type DesktopLicenseProgramOption = {
  label: string
  appCode: string
}

/**
 * Seed / öneri listesi — satış ve lisans doğrulaması için kullanılmaz.
 * Gerçek kaynak: Woontegra-Lisans-Server program kayıtları (API).
 */
export const DESKTOP_LICENSE_PROGRAMS: DesktopLicenseProgramOption[] = [
  { label: 'Müvekkil Kasa Defteri Desktop', appCode: 'MUVEKKIL_KASA_DESKTOP' },
  { label: 'Şifre Kasası Desktop', appCode: 'SIFRE_KASASI_DESKTOP' },
  { label: 'İşletme Defteri Desktop', appCode: 'ISLETME_DEFTERI_DESKTOP' },
  { label: 'Optik Desktop', appCode: 'OPTIK_DESKTOP' },
  { label: 'Bilirkişi Desktop', appCode: 'BILIRKISI_DESKTOP' },
]
