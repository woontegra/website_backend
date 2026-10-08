import { escapeMailHtml, mailHtmlDocument } from './mailHtmlLayout'
import { mailDownloadButton } from './mailDownloadLink'

export const BH_DESKTOP_DEMO_APPLICATION_SUBJECT = 'Bilirkişi Hesap — 7 Günlük Ücretsiz Deneme'

export const BH_DESKTOP_DEMO_APPLICATION_MESSAGE =
  'Başvurunuz alındı. Kurulum bağlantısı e-postanıza gönderildi. 7 günlük süre, program içinde demo hesabını oluşturup etkinleştirdiğinizde başlar.'

export type DesktopDemoProfileCheck = {
  ok: boolean
  alreadyUsed: boolean
  alreadyRecorded: boolean
}

/** Başvuru kaydı demo aktivasyonu değildir. Tekrar başvuru mevcut kaydı tüketmez. */
export function desktopDemoApplicationAction(
  prior: DesktopDemoProfileCheck,
): 'save-application' | 'resend-download' | 'profile-unavailable' {
  if (prior.alreadyUsed || prior.alreadyRecorded) return 'resend-download'
  if (prior.ok) return 'save-application'
  return 'profile-unavailable'
}

export function buildBilirkisiDesktopDemoApplicationMail(data: {
  customerName: string
  platformLabel: string
  downloadUrl: string
}): { subject: string; text: string; html: string } {
  const safeName = escapeMailHtml(data.customerName)
  const safePlatform = escapeMailHtml(data.platformLabel)
  const safeUrl = escapeMailHtml(data.downloadUrl)
  const text = [
    `Merhaba ${data.customerName},`,
    '',
    'Bilirkişi Hesap Desktop demo başvurunuz alındı.',
    `${data.platformLabel} programını indirebilirsiniz.`,
    '7 günlük süre, program içinde demo hesabınızı oluşturup etkinleştirdiğiniz anda başlar.',
    'Bu e-posta demo lisansı oluşturmaz.',
    '',
    'Kurulumu İndir:',
    data.downloadUrl,
    '',
    'Woontegra',
  ].join('\n')
  const html = mailHtmlDocument(
    'Bilirkişi Hesap',
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Merhaba ${safeName},</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Bilirkişi Hesap Desktop demo başvurunuz alındı. ${safePlatform} programını indirebilirsiniz.</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">7 günlük süre, program içinde demo hesabınızı oluşturup etkinleştirdiğiniz anda başlar. Bu e-posta demo lisansı oluşturmaz.</p>
      ${mailDownloadButton(data.downloadUrl, 'Kurulumu İndir')}
      <p style="margin:16px 0 0;font-size:13px;line-height:1.6;word-break:break-all;"><a href="${safeUrl}" style="color:#2563eb;text-decoration:none;">${safeUrl}</a></p>`,
  )
  return { subject: BH_DESKTOP_DEMO_APPLICATION_SUBJECT, text, html }
}
