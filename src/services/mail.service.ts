import nodemailer from 'nodemailer'
import { resolveMailDownloadHref } from '../lib/mailDeliveryUrl'

export const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'info@woontegra.com',
    pass: process.env.GMAIL_APP_PASSWORD
  }
})

export const mailService = {
  async sendContactForm(data: { name: string; email: string; message: string }) {
    await transporter.sendMail({
      from: '"Woontegra Website" <info@woontegra.com>',
      to: 'info@woontegra.com',
      subject: 'Yeni İletişim Formu',
      html: `
        <h2>Yeni Mesaj</h2>
        <p><b>Ad:</b> ${data.name}</p>
        <p><b>Email:</b> ${data.email}</p>
        <p><b>Mesaj:</b> ${data.message}</p>
      `
    })
  },

  async sendOfferForm(data: { name: string; email: string; phone: string; service: string; note?: string }) {
    await transporter.sendMail({
      from: '"Woontegra Website" <info@woontegra.com>',
      to: 'info@woontegra.com',
      subject: 'Yeni Teklif Talebi',
      html: `
        <h2>Yeni Teklif Talebi</h2>
        <p><b>Ad:</b> ${data.name}</p>
        <p><b>Email:</b> ${data.email}</p>
        <p><b>Telefon:</b> ${data.phone}</p>
        <p><b>Hizmet:</b> ${data.service}</p>
        <p><b>Not:</b> ${data.note || 'Yok'}</p>
      `
    })
  },

  async sendPaidDownloadOrder(data: {
    customerName: string
    customerEmail: string
    orderNo: string
    lines: { id: string; productName: string; downloadUrl: string; licenseKeys?: string[] }[]
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
      '<p style="margin-top:14px;font-size:14px;line-height:1.5;color:#334155">Programı kurduktan sonra giriş yapın ve lisans kodunuzu aktivasyon ekranına girin.</p>'
    const licenseHelpText =
      '\nProgramı kurduktan sonra giriş yapın ve lisans kodunuzu aktivasyon ekranına girin.\n'

    for (const l of entries) {
      const name = escapeHtml(l.productName)
      const plainName = l.productName
      const keys = (l.licenseKeys ?? []).filter((k) => k?.trim())
      const keysHtml =
        keys.length > 0
          ? `<div style="margin-top:6px;font-size:13px"><strong>Lisans kodu:</strong> ${keys.map((k) => `<span style="font-family:monospace">${escapeHtml(k)}</span>`).join(keys.length > 1 ? '<br/>' : '')}</div>`
          : ''
      const keysText =
        keys.length > 0
          ? `\n  Lisans kodu: ${keys.join(keys.length > 1 ? '\n  Lisans kodu: ' : '')}`
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

    await transporter.sendMail({
      from: '"Woontegra" <info@woontegra.com>',
      to: data.customerEmail,
      subject: `Siparişiniz onaylandı — ${data.orderNo}`,
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
    await transporter.sendMail({
      from: '"Woontegra" <info@woontegra.com>',
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
    await transporter.sendMail({
      from: '"Woontegra" <info@woontegra.com>',
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
