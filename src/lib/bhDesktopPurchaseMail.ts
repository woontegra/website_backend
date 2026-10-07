import { selectBhDesktopInstallerUrl } from './bhDesktopTrialDownload'
import { escapeMailHtml } from './mailHtmlLayout'
import { mailDownloadButton } from './mailDownloadLink'

export const BILIRKISI_DESKTOP_ORDER_DOWNLOAD = 'license:BILIRKISI_DESKTOP'
export const BH_WINDOWS_INSTALLER_BUTTON_LABEL = 'Windows Kurulumunu İndir'

/** Admin windowsDownloadUrl, demo ile aynı kurulum adresi kuralından geçer. */
export function resolveBilirkisiWindowsPurchaseInstallerUrl(
  lineDownloadUrl: string,
  installerUrl: string | null | undefined,
): string | null {
  if (lineDownloadUrl.trim() !== BILIRKISI_DESKTOP_ORDER_DOWNLOAD) return null
  return selectBhDesktopInstallerUrl({ windowsDownloadUrl: installerUrl ?? '' }, 'WINDOWS')
}

export function bhWindowsPurchaseInstallerMail(url: string): { html: string; text: string } {
  return bhPurchaseInstallerMail({
    url,
    label: BH_WINDOWS_INSTALLER_BUTTON_LABEL,
    heading: 'Windows kurulumu',
  })
}

/** Platforma göre kurulum düğmesi. Otomatik Windows maili bhWindowsPurchaseInstallerMail kullanmaya devam eder. */
export function bhPurchaseInstallerMail(input: { url: string; label: string; heading: string }): { html: string; text: string } {
  const safeUrl = escapeMailHtml(input.url)
  const safeHeading = escapeMailHtml(input.heading)
  return {
    html: `<h3 style="margin:20px 0 8px;font-size:15px;color:#0f172a;">${safeHeading}</h3>
      ${mailDownloadButton(input.url, input.label)}
      <p style="margin:8px 0 0;font-size:13px;line-height:1.6;word-break:break-all;"><a href="${safeUrl}" style="color:#2563eb;text-decoration:none;">${safeUrl}</a></p>`,
    text: `${input.label}:\n${input.url}`,
  }
}
