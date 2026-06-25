import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { resolveMailDownloadHref } from '../lib/mailDeliveryUrl'
import { settingsService } from './settings.service'

const DEFAULT_MAILBOX = 'info@woontegra.com'

type MailConfig = {
  transporter: Transporter
  from: string
  notifyTo: string
}

async function resolveMailConfig(): Promise<MailConfig> {
  const settings = await settingsService.getAll()
  const notifyTo = String(settings.contactEmail || DEFAULT_MAILBOX).trim() || DEFAULT_MAILBOX

  const smtpHost = String(settings.smtpHost || '').trim()
  const smtpUser = String(settings.smtpUser || '').trim()
  const smtpPassword = String(settings.smtpPassword || '').trim()

  if (smtpHost && smtpUser && smtpPassword) {
    const port = Number.parseInt(String(settings.smtpPort || '587'), 10) || 587
    const secure = settings.smtpSecure === true || settings.smtpSecure === 'true'
    return {
      transporter: nodemailer.createTransport({
        host: smtpHost,
        port,
        secure,
        auth: { user: smtpUser, pass: smtpPassword },
      }),
      from: `"Woontegra" <${smtpUser}>`,
      notifyTo,
    }
  }

  const gmailPass = process.env.GMAIL_APP_PASSWORD?.trim()
  if (gmailPass) {
    return {
      transporter: nodemailer.createTransport({
        service: 'gmail',
        auth: { user: DEFAULT_MAILBOX, pass: gmailPass },
      }),
      from: `"Woontegra Website" <${DEFAULT_MAILBOX}>`,
      notifyTo,
    }
  }

  throw new Error('E-posta yapılandırması eksik: admin SMTP ayarları veya GMAIL_APP_PASSWORD gerekli')
}

async function dispatchMail(options: nodemailer.SendMailOptions) {
  const config = await resolveMailConfig()
  await config.transporter.sendMail({
    from: config.from,
    ...options,
  })
}

export const mailService = {
  async sendContactForm(data: {
    name: string
    email: string
    message: string
    phone?: string
    company?: string
  }) {
    const config = await resolveMailConfig()
    const phoneLine = data.phone?.trim()
      ? `<p><b>Telefon:</b> ${escapeHtml(data.phone.trim())}</p>`
      : ''
    const companyLine = data.company?.trim()
      ? `<p><b>Firma:</b> ${escapeHtml(data.company.trim())}</p>`
      : ''
    await config.transporter.sendMail({
      from: config.from,
      to: config.notifyTo,
      replyTo: data.email,
      subject: 'Yeni İletişim Formu',
      html: `
        <h2>Yeni İletişim Mesajı</h2>
        <p><b>Ad:</b> ${escapeHtml(data.name)}</p>
        <p><b>E-posta:</b> ${escapeHtml(data.email)}</p>
        ${phoneLine}
        ${companyLine}
        <p><b>Mesaj:</b></p>
        <p style="white-space:pre-wrap">${escapeHtml(data.message)}</p>
      `,
    })
  },

  async sendOfferForm(data: { name: string; email: string; phone: string; service: string; note?: string }) {
    const config = await resolveMailConfig()
    await config.transporter.sendMail({
      from: config.from,
      to: config.notifyTo,
      replyTo: data.email,
      subject: 'Yeni Teklif Talebi',
      html: `
        <h2>Yeni Teklif Talebi</h2>
        <p><b>Ad:</b> ${escapeHtml(data.name)}</p>
        <p><b>E-posta:</b> ${escapeHtml(data.email)}</p>
        <p><b>Telefon:</b> ${escapeHtml(data.phone)}</p>
        <p><b>Hizmet:</b> ${escapeHtml(data.service)}</p>
        <p><b>Not:</b> ${escapeHtml(data.note || 'Yok')}</p>
      `,
    })
  },

  async sendPaidDownloadOrder(data: {
    customerName: string
    customerEmail: string
    orderNo: string
    lines: {
      id: string
      productName: string
      downloadUrl: string
      licenseKeys?: string[]
      licenses?: { licenseKey: string; activationPassword?: string }[]
    }[]
  }) {
    const support = 'info@woontegra.com'
    const safeName = escapeHtml(data.customerName)
    const safeOrder = escapeHtml(data.orderNo)

    const htmlParts: string[] = []
    const textParts: string[] = []

    const entries = data.lines.filter((x) => x.downloadUrl?.trim())
    if (entries.length === 0) {
      console.warn('[mail] sendPaidDownloadOrder skipped: no delivery lines', { orderNo: data.orderNo })
      return
    }

    for (const l of entries) {
      if (l.downloadUrl.startsWith('saas:')) continue
      if (!resolveMailDownloadHref(l.downloadUrl)) {
        console.error('[mail] sendPaidDownloadOrder: unresolved URL after pre-check', {
          orderNo: data.orderNo,
          productName: l.productName,
        })
        return
      }
    }

    const licenseHelpHtml =
      '<p style="margin-top:14px;font-size:14px;line-height:1.5;color:#334155">Programı kurduktan sonra açın; lisans anahtarı ve aktivasyon şifresini aktivasyon ekranına girin.</p>'
    const licenseHelpText =
      '\nProgramı kurduktan sonra açın; lisans anahtarı ve aktivasyon şifresini aktivasyon ekranına girin.\n'

    for (const l of entries) {
      const name = escapeHtml(l.productName)
      const plainName = l.productName
      const licenseEntries: { licenseKey: string; activationPassword?: string }[] =
        l.licenses?.filter((x) => x.licenseKey?.trim()) ??
        (l.licenseKeys ?? []).filter((k) => k?.trim()).map((k) => ({ licenseKey: k }))
      const keysHtml =
        licenseEntries.length > 0
          ? licenseEntries
              .map((entry) => {
                const keyLine = `<strong>Lisans anahtarı:</strong> <span style="font-family:monospace">${escapeHtml(entry.licenseKey)}</span>`
                const passLine = entry.activationPassword
                  ? `<br/><strong>Aktivasyon şifresi:</strong> <span style="font-family:monospace">${escapeHtml(entry.activationPassword)}</span>`
                  : ''
                return `<div style="margin-top:6px;font-size:13px">${keyLine}${passLine}</div>`
              })
              .join('')
          : ''
      const keysText =
        licenseEntries.length > 0
          ? licenseEntries
              .map((entry) => {
                const parts = [`Lisans anahtarı: ${entry.licenseKey}`]
                if (entry.activationPassword) parts.push(`Aktivasyon şifresi: ${entry.activationPassword}`)
                return `  ${parts.join('\n  ')}`
              })
              .join('\n')
          : ''
      if (l.downloadUrl.startsWith('saas:')) {
        const saasNote =
          'Web tabanlı program için kullanım hesabınız ve giriş bilgileriniz Woontegra tarafından e-posta ile paylaşılacaktır.'
        htmlParts.push(`<li><strong>${name}</strong> — ${escapeHtml(saasNote)}${keysHtml}</li>`)
        textParts.push(`- ${plainName}: ${saasNote}${keysText}`)
        continue
      }
      const abs = resolveMailDownloadHref(l.downloadUrl)!
      if (process.env.MAIL_LOG_DOWNLOAD_HREF === '1') {
        // eslint-disable-next-line no-console -- opsiyonel mail href denetimi
        console.log('[mail] paid download final href', { orderNo: data.orderNo, productName: l.productName, href: abs })
      }
      const safeHref = escapeHtml(abs)
      htmlParts.push(
        `<li><strong>${name}</strong> — <a href="${safeHref}" target="_blank" rel="noopener noreferrer">İndir</a>${keysHtml}</li>`,
      )
      textParts.push(`- ${plainName}: İndirme bağlantısı: ${abs}${keysText}`)
    }

    if (htmlParts.length === 0) {
      console.warn('[mail] sendPaidDownloadOrder skipped: no renderable lines', { orderNo: data.orderNo })
      return
    }

    const deliverySectionHtml = `<p><b>Ürün teslimi:</b></p><ul>${htmlParts.join('')}</ul>${licenseHelpHtml}`

    const textBody = [
      `Merhaba ${data.customerName},`,
      '',
      `Ödemeniz alındı. Sipariş numaranız: ${data.orderNo}`,
      '',
      'Ürün teslimi:',
      textParts.join('\n'),
      licenseHelpText,
      `Sorularınız için: ${support}`,
      '',
      'İyi çalışmalar,',
      'Woontegra',
    ].join('\n')

    const hasDesktopLicenseMail = entries.some(
      (l) => (l.licenses?.length ?? 0) > 0 || (l.licenseKeys?.length ?? 0) > 0,
    )
    const subject = hasDesktopLicenseMail
      ? `Müvekkil Kasa Defteri Masaüstü - Lisans ve İndirme Bilgileri`
      : `Siparişiniz onaylandı — ${data.orderNo}`

    await dispatchMail({
      to: data.customerEmail,
      subject,
      text: textBody,
      html: `
        <p>Merhaba ${safeName},</p>
        <p>Ödemeniz alındı. Sipariş numaranız: <b>${safeOrder}</b></p>
        ${deliverySectionHtml}
        <p>Sorularınız için: <a href="mailto:${support}">${support}</a></p>
        <p>İyi çalışmalar,<br/>Woontegra</p>
      `,
    })
  },

  async sendBankTransferOrderCreated(data: {
    customerName: string
    customerEmail: string
    info: {
      bankName: string
      accountHolder: string
      iban: string
      ibanCompact: string
      branchName?: string | null
      accountNumber?: string | null
      instructions?: string | null
      paymentReference: string
      orderTotal: number
      currency: string
      amountFormatted: string
    }
  }) {
    const i = data.info
    const safeName = escapeHtml(data.customerName)
    const warn =
      'Lütfen ödeme açıklamasına sipariş numaranızı yazınız. Açıklama yazılmadığında ödeme onayı gecikebilir.'
    const linesHtml: string[] = [
      `<tr><td><b>Sipariş no</b></td><td>${escapeHtml(i.paymentReference)}</td></tr>`,
      `<tr><td><b>Ödenecek tutar</b></td><td>${escapeHtml(i.amountFormatted)}</td></tr>`,
      `<tr><td><b>Banka</b></td><td>${escapeHtml(i.bankName)}</td></tr>`,
      `<tr><td><b>Alıcı / hesap sahibi</b></td><td>${escapeHtml(i.accountHolder)}</td></tr>`,
    ]
    if (i.branchName) linesHtml.push(`<tr><td><b>Şube</b></td><td>${escapeHtml(i.branchName)}</td></tr>`)
    if (i.accountNumber) linesHtml.push(`<tr><td><b>Hesap no</b></td><td>${escapeHtml(i.accountNumber)}</td></tr>`)
    linesHtml.push(`<tr><td><b>IBAN</b></td><td style="font-family:monospace">${escapeHtml(i.iban)}</td></tr>`)
    linesHtml.push(
      `<tr><td><b>Ödeme açıklaması</b></td><td style="font-family:monospace;font-weight:bold">${escapeHtml(i.paymentReference)}</td></tr>`,
    )
    const textLines = [
      `Sipariş no: ${i.paymentReference}`,
      `Ödenecek tutar: ${i.amountFormatted}`,
      `Banka: ${i.bankName}`,
      `Alıcı / hesap sahibi: ${i.accountHolder}`,
      ...(i.branchName ? [`Şube: ${i.branchName}`] : []),
      ...(i.accountNumber ? [`Hesap no: ${i.accountNumber}`] : []),
      `IBAN: ${i.ibanCompact}`,
      `Ödeme açıklaması (EFT/Havale açıklama alanına yazın): ${i.paymentReference}`,
      '',
      warn,
    ]
    if (i.instructions) {
      textLines.splice(textLines.length - 2, 0, `Not: ${i.instructions}`, '')
      linesHtml.push(`<tr><td colspan="2"><i>${escapeHtml(i.instructions)}</i></td></tr>`)
    }
    const textBody = [`Merhaba ${data.customerName},`, '', 'Siparişiniz alındı. Havale/EFT ile ödeme için bilgileriniz:', '', ...textLines, '', 'İyi günler,', 'Woontegra'].join('\n')
    await dispatchMail({
      to: data.customerEmail,
      subject: `Siparişiniz alındı — Havale/EFT ödeme bilgileri — ${i.paymentReference}`,
      text: textBody,
      html: `
        <p>Merhaba ${safeName},</p>
        <p>Siparişiniz alındı. Aşağıdaki hesaba <b>${escapeHtml(i.amountFormatted)}</b> tutarında Havale veya EFT yapabilirsiniz.</p>
        <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;border-color:#ccc;max-width:560px">
          ${linesHtml.join('')}
        </table>
        <p style="margin-top:16px;padding:12px;background:#fff8e6;border:1px solid #f0d060;border-radius:8px"><b>Önemli:</b> ${escapeHtml(warn)}</p>
        <p>Sorularınız için: <a href="mailto:info@woontegra.com">info@woontegra.com</a></p>
        <p>İyi günler,<br/>Woontegra</p>
      `,
    })
  },

  async sendDesktopLicenseMail(data: {
    customerName: string
    customerEmail: string
    productName: string
    downloadUrl: string | null
    licenseKey: string
    activationPassword?: string
    orderNo?: string | null
  }) {
    const support = 'info@woontegra.com'
    const safeName = escapeHtml(data.customerName)
    const safeProduct = escapeHtml(data.productName)
    const safeKey = escapeHtml(data.licenseKey)
    const passBlock = data.activationPassword
      ? `<p><strong>Aktivasyon şifresi:</strong> <span style="font-family:monospace">${escapeHtml(data.activationPassword)}</span></p>`
      : `<p><em>Aktivasyon şifreniz daha önce iletilmiştir. Hatırlamıyorsanız destek ile iletişime geçin.</em></p>`
    const passText = data.activationPassword
      ? `Aktivasyon şifresi: ${data.activationPassword}`
      : 'Aktivasyon şifreniz daha önce iletilmiştir.'

    let downloadHtml = ''
    let downloadText = ''
    if (data.downloadUrl?.trim()) {
      const href = resolveMailDownloadHref(data.downloadUrl.trim())
      if (href) {
        downloadHtml = `<p><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">Programı indir</a></p>`
        downloadText = `İndirme bağlantısı: ${href}`
      }
    }

    const orderLine = data.orderNo
      ? `<p>Sipariş numaranız: <b>${escapeHtml(data.orderNo)}</b></p>`
      : ''
    const orderText = data.orderNo ? `Sipariş numaranız: ${data.orderNo}\n` : ''

    const installHtml =
      '<ol style="margin:12px 0;padding-left:20px;line-height:1.6"><li>Programı indirip kurun.</li><li>Programı açın.</li><li>Lisans anahtarı ve aktivasyon şifresini girin.</li><li>İlk kullanıcı hesabınızı oluşturup giriş yapın.</li></ol>'

    const textBody = [
      `Merhaba ${data.customerName},`,
      '',
      `${data.productName} lisans bilgileriniz:`,
      orderText,
      downloadText,
      `Lisans anahtarı: ${data.licenseKey}`,
      passText,
      '',
      'Kurulum: İndir → Kur → Lisans bilgilerini gir → Hesap oluştur',
      '',
      `Destek: ${support}`,
      '',
      'İyi çalışmalar,',
      'Woontegra',
    ]
      .filter(Boolean)
      .join('\n')

    await dispatchMail({
      to: data.customerEmail,
      subject: 'Müvekkil Kasa Defteri Masaüstü - Lisans ve İndirme Bilgileri',
      text: textBody,
      html: `
        <p>Merhaba ${safeName},</p>
        <p><strong>${safeProduct}</strong> lisans bilgileriniz aşağıdadır.</p>
        ${orderLine}
        ${downloadHtml}
        <p><strong>Lisans anahtarı:</strong> <span style="font-family:monospace">${safeKey}</span></p>
        ${passBlock}
        <p><strong>Kurulum:</strong></p>
        ${installHtml}
        <p>Destek: <a href="mailto:${support}">${support}</a></p>
        <p>İyi çalışmalar,<br/>Woontegra</p>
      `,
    })
  },

  /** Havale/EFT admin onayı — teslimat e-postasından bağımsız kısa bilgilendirme (hata yutulur). */
  async sendBankTransferPaymentApproved(data: {
    customerName: string
    customerEmail: string
    orderNo: string
    messageLines: string[]
  }) {
    const safeName = escapeHtml(data.customerName)
    const safeOrder = escapeHtml(data.orderNo)
    const lines = data.messageLines.map((t) => `<p>${escapeHtml(t)}</p>`).join('')
    await dispatchMail({
      to: data.customerEmail,
      subject: `Ödemeniz onaylandı — ${data.orderNo}`,
      html: `
        <p>Merhaba ${safeName},</p>
        <p>Havale/EFT ödemeniz sipariş numarası <b>${safeOrder}</b> için onaylandı.</p>
        ${lines}
        <p>Sorularınız için: <a href="mailto:info@woontegra.com">info@woontegra.com</a></p>
        <p>İyi çalışmalar,<br/>Woontegra</p>
      `,
    })
  },
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
