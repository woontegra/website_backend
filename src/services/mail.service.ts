import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { escapeMailHtml, mailBadge, mailHtmlDocument, mailInfoTable } from '../lib/mailHtmlLayout'
import {
  buildCustomerLoginPageHref,
  buildCustomerOrdersPageHref,
  buildOrderDownloadMailHref,
  mailDownloadButton,
} from '../lib/mailDownloadLink'
import { resolveDownloadSourceFromRawUrl } from '../lib/downloadStream'
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
    orderId: string
    customerName: string
    customerEmail: string
    orderNo: string
    lines: {
      id: string
      productName: string
      downloadUrl: string
      productId?: string
      licenseKeys?: string[]
      licenses?: { licenseKey: string; activationPassword?: string }[]
      licenseId?: string
    }[]
  }) {
    const support = 'destek@woontegra.com'
    const safeName = escapeHtml(data.customerName)
    const safeOrder = escapeHtml(data.orderNo)
    const ordersPageHref = buildCustomerOrdersPageHref()

    const entries = data.lines.filter((x) => x.downloadUrl?.trim())
    if (entries.length === 0) {
      console.warn('[mail] sendPaidDownloadOrder skipped: no delivery lines', { orderNo: data.orderNo })
      return
    }

    for (const l of entries) {
      if (l.downloadUrl.startsWith('saas:')) continue
      if (!resolveDownloadSourceFromRawUrl(l.downloadUrl)) {
        console.error('[mail] sendPaidDownloadOrder: unresolved source after pre-check', {
          orderNo: data.orderNo,
          productName: l.productName,
        })
        return
      }
    }

    const productSectionsHtml: string[] = []
    const productSectionsText: string[] = []

    for (const l of entries) {
      const plainName = l.productName
      const licenseEntries: { licenseKey: string; activationPassword?: string }[] =
        l.licenses?.filter((x) => x.licenseKey?.trim()) ??
        (l.licenseKeys ?? []).filter((k) => k?.trim()).map((k) => ({ licenseKey: k }))

      if (l.downloadUrl.startsWith('saas:')) {
        const saasNote =
          'Web tabanlı program için kullanım hesabınız ve giriş bilgileriniz Woontegra tarafından e-posta ile paylaşılacaktır.'
        productSectionsHtml.push(
          `<div style="margin-bottom:24px;"><h3 style="margin:0 0 8px;font-size:16px;color:#0f172a;">${escapeHtml(l.productName)}</h3><p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">${escapeHtml(saasNote)}</p></div>`,
        )
        productSectionsText.push(`- ${plainName}: ${saasNote}`)
        continue
      }

      const downloadHref = buildOrderDownloadMailHref({
        orderId: data.orderId,
        orderItemId: l.id,
        productId: l.productId,
        licenseId: l.licenseId,
      })

      const licenseRows: { label: string; value: string; mono?: boolean }[] = [
        { label: 'Program', value: escapeMailHtml(l.productName) },
      ]
      if (licenseEntries[0]?.licenseKey) {
        licenseRows.push({
          label: 'Lisans Anahtarı',
          value: escapeMailHtml(licenseEntries[0].licenseKey),
          mono: true,
        })
      }
      if (licenseEntries[0]?.activationPassword) {
        licenseRows.push({
          label: 'Aktivasyon Şifresi',
          value: escapeMailHtml(licenseEntries[0].activationPassword),
          mono: true,
        })
      }

      const licenseTable =
        licenseRows.length > 1
          ? mailInfoTable(licenseRows)
          : `<p style="margin:0 0 12px;font-size:14px;color:#475569;">${escapeMailHtml(l.productName)}</p>`

      productSectionsHtml.push(`
        <div style="margin-bottom:28px;padding-bottom:24px;border-bottom:1px solid #e2e8f0;">
          ${licenseTable}
          <h3 style="margin:20px 0 8px;font-size:15px;color:#0f172a;">Program dosyası</h3>
          ${mailDownloadButton(downloadHref, 'Programı İndir')}
          <p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:#64748b;">İndirme bağlantısı ödeme onayınıza özel oluşturulmuştur. Linki üçüncü kişilerle paylaşmayınız.</p>
        </div>`)

      const textLicense =
        licenseEntries.length > 0
          ? licenseEntries
              .map((entry) => {
                const parts = [`Program: ${plainName}`, `Lisans anahtarı: ${entry.licenseKey}`]
                if (entry.activationPassword) parts.push(`Aktivasyon şifresi: ${entry.activationPassword}`)
                return parts.join('\n')
              })
              .join('\n')
          : `Program: ${plainName}`

      productSectionsText.push(
        `${textLicense}\nProgramı İndir: ${downloadHref}\n(İndirme bağlantısı ödeme onayınıza özeldir.)`,
      )
    }

    if (productSectionsHtml.length === 0) {
      console.warn('[mail] sendPaidDownloadOrder skipped: no renderable lines', { orderNo: data.orderNo })
      return
    }

    const hasDesktopLicenseMail = entries.some(
      (l) => (l.licenses?.length ?? 0) > 0 || (l.licenseKeys?.length ?? 0) > 0,
    )
    const subject = hasDesktopLicenseMail
      ? 'Woontegra Lisans ve Kurulum Bilgileri'
      : `Siparişiniz onaylandı — ${data.orderNo}`

    const installHtml = `<ol style="margin:12px 0 0;padding-left:20px;line-height:1.7;color:#334155;font-size:14px;">
      <li>Programı indirin ve kurun.</li>
      <li>Programı ilk açtığınızda lisans aktivasyon ekranı gelecektir.</li>
      <li>Lisans anahtarınızı ve aktivasyon şifrenizi girin.</li>
      <li>Aktivasyon tamamlandıktan sonra programı kullanmaya başlayabilirsiniz.</li>
    </ol>`

    const bodyHtml = `
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Sayın ${safeName},</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">Satın aldığınız program için lisans ve kurulum bilgileriniz aşağıdadır. Sipariş numaranız: <strong>${safeOrder}</strong></p>
      ${productSectionsHtml.join('')}
      <h3 style="margin:0 0 8px;font-size:15px;color:#0f172a;">Kurulum</h3>
      ${installHtml}
      <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#64748b;">Bağlantı çalışmazsa <a href="${escapeHtml(ordersPageHref)}" style="color:#2563eb;text-decoration:none;">Hesabım &gt; Siparişlerim</a> bölümünden programınızı indirebilirsiniz.</p>
      <p style="margin:16px 0 0;font-size:14px;line-height:1.6;">Destek: <a href="mailto:${support}" style="color:#2563eb;text-decoration:none;">${support}</a></p>
    `

    const textBody = [
      `Sayın ${data.customerName},`,
      '',
      'Satın aldığınız program için lisans ve kurulum bilgileriniz aşağıdadır.',
      `Sipariş numaranız: ${data.orderNo}`,
      '',
      ...productSectionsText,
      '',
      'Kurulum:',
      '1. Programı indirin ve kurun.',
      '2. Programı ilk açtığınızda lisans aktivasyon ekranı gelecektir.',
      '3. Lisans anahtarınızı ve aktivasyon şifrenizi girin.',
      '4. Aktivasyon tamamlandıktan sonra programı kullanmaya başlayabilirsiniz.',
      '',
      `Alternatif: ${ordersPageHref}`,
      '',
      `Destek: ${support}`,
      '',
      'İyi çalışmalar,',
      'Woontegra',
    ].join('\n')

    await dispatchMail({
      to: data.customerEmail,
      subject,
      text: textBody,
      html: mailHtmlDocument('Woontegra Lisans ve Kurulum Bilgileri', bodyHtml),
    })
  },

  /** Yeni sipariş — admin / iletişim e-postasına bildirim */
  async sendNewOrderAdminNotification(data: {
    orderNo: string
    customerName: string
    customerEmail: string
    customerPhone?: string | null
    total: number
    currency: string
    paymentProvider: string
    items: { productName: string; quantity: number; total: number }[]
  }) {
    const config = await resolveMailConfig()
    const amount = `${data.total.toFixed(2)} ${data.currency}`
    const paymentLabel =
      data.paymentProvider === 'BANK_TRANSFER'
        ? 'Havale / EFT'
        : data.paymentProvider === 'PAYTR'
          ? 'Kart (PayTR)'
          : data.paymentProvider
    const paymentBadge =
      data.paymentProvider === 'BANK_TRANSFER'
        ? mailBadge('Havale / EFT — onay bekliyor', 'amber')
        : mailBadge(paymentLabel, 'blue')

    const itemsRows = data.items
      .map(
        (i) =>
          `<tr>
            <td style="padding:12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#0f172a;">${escapeHtml(i.productName)}</td>
            <td style="padding:12px;border-bottom:1px solid #e2e8f0;font-size:14px;text-align:center;color:#475569;">${i.quantity}</td>
            <td style="padding:12px;border-bottom:1px solid #e2e8f0;font-size:14px;text-align:right;font-weight:600;color:#0f172a;">${escapeHtml(i.total.toFixed(2))} ${escapeHtml(data.currency)}</td>
          </tr>`,
      )
      .join('')

    const infoRows = [
      { label: 'Sipariş no', value: escapeMailHtml(data.orderNo), mono: true },
      { label: 'Müşteri', value: escapeMailHtml(data.customerName) },
      {
        label: 'E-posta',
        value: `<a href="mailto:${escapeMailHtml(data.customerEmail)}" style="color:#2563eb;text-decoration:none;">${escapeMailHtml(data.customerEmail)}</a>`,
      },
    ]
    if (data.customerPhone?.trim()) {
      infoRows.push({ label: 'Telefon', value: escapeMailHtml(data.customerPhone.trim()), mono: true })
    }
    infoRows.push(
      { label: 'Toplam tutar', value: `<strong style="font-size:16px;color:#1d4ed8;">${escapeMailHtml(amount)}</strong>` },
      { label: 'Ödeme yöntemi', value: paymentBadge },
    )

    const bodyHtml = `
      <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#334155;">Yeni bir sipariş alındı. Detaylar aşağıdadır.</p>
      ${mailInfoTable(infoRows)}
      <h3 style="margin:20px 0 10px;font-size:15px;color:#0f172a;">Sipariş kalemleri</h3>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;">Ürün</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;">Adet</th>
            <th style="padding:10px 12px;text-align:right;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;">Tutar</th>
          </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
      </table>
      ${
        data.paymentProvider === 'BANK_TRANSFER'
          ? `<p style="margin:16px 0 0;padding:12px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:13px;line-height:1.5;color:#92400e;">Havale/EFT siparişi — ödeme gelince admin panelden onaylayın; onay sonrası müşteriye lisans ve indirme maili gider.</p>`
          : ''
      }
    `

    await config.transporter.sendMail({
      from: config.from,
      to: config.notifyTo,
      replyTo: data.customerEmail,
      subject: `Yeni sipariş — ${data.orderNo}`,
      text: [
        'Yeni sipariş alındı.',
        '',
        `Sipariş no: ${data.orderNo}`,
        `Müşteri: ${data.customerName}`,
        `E-posta: ${data.customerEmail}`,
        ...(data.customerPhone?.trim() ? [`Telefon: ${data.customerPhone.trim()}`] : []),
        `Tutar: ${amount}`,
        `Ödeme: ${paymentLabel}`,
        '',
        'Ürünler:',
        ...data.items.map((i) => `- ${i.productName} × ${i.quantity} — ${i.total.toFixed(2)} ${data.currency}`),
      ].join('\n'),
      html: mailHtmlDocument('Yeni Sipariş', bodyHtml),
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
    orderId?: string | null
    orderItemId?: string | null
    licenseId?: string | null
    productId?: string | null
  }) {
    const support = 'destek@woontegra.com'
    const safeName = escapeHtml(data.customerName)
    const safeProduct = escapeHtml(data.productName)
    const safeKey = escapeHtml(data.licenseKey)
    const ordersPageHref = buildCustomerOrdersPageHref()

    const licenseRows = [
      { label: 'Program', value: safeProduct },
      { label: 'Lisans Anahtarı', value: safeKey, mono: true as const },
    ]
    if (data.activationPassword) {
      licenseRows.push({
        label: 'Aktivasyon Şifresi',
        value: escapeMailHtml(data.activationPassword),
        mono: true as const,
      })
    }

    let downloadSectionHtml = ''
    let downloadText = ''
    const orderId = data.orderId ?? data.licenseId ?? null
    const orderItemId = data.orderItemId ?? data.licenseId ?? null
    if (orderId && orderItemId && resolveDownloadSourceFromRawUrl(data.downloadUrl)) {
      const href = buildOrderDownloadMailHref({
        orderId,
        orderItemId,
        productId: data.productId ?? undefined,
        licenseId: data.licenseId ?? undefined,
      })
      downloadSectionHtml = `
        <h3 style="margin:20px 0 8px;font-size:15px;color:#0f172a;">Program dosyası</h3>
        ${mailDownloadButton(href, 'Programı İndir')}
        <p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:#64748b;">İndirme bağlantınız ödeme onayınıza özel oluşturulmuştur. Bağlantı çalışmazsa Woontegra hesabınızdan sipariş detayına girerek programı indirebilirsiniz.</p>`
      downloadText = `Programı İndir: ${href}`
    }

    const orderLine = data.orderNo
      ? `<p style="margin:0 0 16px;font-size:14px;color:#475569;">Sipariş numaranız: <strong>${escapeHtml(data.orderNo)}</strong></p>`
      : ''
    const orderText = data.orderNo ? `Sipariş numaranız: ${data.orderNo}\n` : ''

    const passText = data.activationPassword
      ? `Aktivasyon şifresi: ${data.activationPassword}`
      : 'Aktivasyon şifreniz daha önce iletilmiştir.'

    const installHtml = `<ol style="margin:12px 0 0;padding-left:20px;line-height:1.7;color:#334155;font-size:14px;">
      <li>Programı indirin ve kurun.</li>
      <li>Programı ilk açtığınızda lisans aktivasyon ekranı gelecektir.</li>
      <li>Lisans anahtarınızı ve aktivasyon şifrenizi girin.</li>
      <li>Aktivasyon tamamlandıktan sonra programı kullanmaya başlayabilirsiniz.</li>
    </ol>`

    const bodyHtml = `
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Sayın ${safeName},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Satın aldığınız <strong>${safeProduct}</strong> için lisans ve kurulum bilgileriniz aşağıdadır.</p>
      ${orderLine}
      ${mailInfoTable(licenseRows)}
      ${downloadSectionHtml}
      <h3 style="margin:20px 0 8px;font-size:15px;color:#0f172a;">Kurulum</h3>
      ${installHtml}
      <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#64748b;">Bağlantı çalışmazsa <a href="${escapeHtml(ordersPageHref)}" style="color:#2563eb;text-decoration:none;">Hesabım &gt; Siparişlerim</a> bölümünden programınızı indirebilirsiniz.</p>
      <p style="margin:16px 0 0;font-size:14px;line-height:1.6;">Destek: <a href="mailto:${support}" style="color:#2563eb;text-decoration:none;">${support}</a></p>
    `

    const textBody = [
      `Sayın ${data.customerName},`,
      '',
      `Satın aldığınız ${data.productName} için lisans ve kurulum bilgileriniz aşağıdadır.`,
      orderText,
      `Lisans anahtarı: ${data.licenseKey}`,
      passText,
      downloadText,
      '',
      'Kurulum:',
      '1. Programı indirin ve kurun.',
      '2. Lisans aktivasyon ekranında bilgilerinizi girin.',
      '3. Programı kullanmaya başlayın.',
      '',
      `Alternatif: ${ordersPageHref}`,
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
      subject: 'Woontegra Lisans ve Kurulum Bilgileri',
      text: textBody,
      html: mailHtmlDocument('Woontegra Lisans ve Kurulum Bilgileri', bodyHtml),
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

  /** Yeni müşteri kaydı — hoş geldin e-postası */
  async sendCustomerWelcomeEmail(data: { customerName: string; customerEmail: string }) {
    const support = 'destek@woontegra.com'
    const safeName = escapeMailHtml(data.customerName.trim() || 'Müşterimiz')
    const loginHref = buildCustomerLoginPageHref()
    const ordersHref = buildCustomerOrdersPageHref()

    const bodyHtml = `
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Merhaba ${safeName},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Woontegra hesabınız başarıyla oluşturuldu.</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">Hesabınıza giriş yaparak siparişlerinizi, lisanslarınızı ve indirme bağlantılarınızı tek panelden takip edebilirsiniz.</p>
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:20px 0;">
        <tr>
          <td align="center" style="border-radius:8px;background:#2563eb;">
            <a href="${escapeMailHtml(loginHref)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Hesabıma giriş yap</a>
          </td>
        </tr>
      </table>
      ${mailInfoTable([
        { label: 'Giriş adresi', value: `<a href="${escapeMailHtml(loginHref)}" style="color:#2563eb;text-decoration:none;">${escapeMailHtml(loginHref)}</a>` },
        { label: 'Siparişlerim', value: `<a href="${escapeMailHtml(ordersHref)}" style="color:#2563eb;text-decoration:none;">${escapeMailHtml(ordersHref)}</a>` },
      ])}
      <p style="margin:20px 0 0;font-size:14px;line-height:1.6;">Destek: <a href="mailto:${support}" style="color:#2563eb;text-decoration:none;">${support}</a></p>
    `

    const textBody = [
      `Merhaba ${data.customerName.trim() || 'Müşterimiz'},`,
      '',
      'Woontegra hesabınız başarıyla oluşturuldu.',
      '',
      'Hesabınıza giriş yaparak siparişlerinizi, lisanslarınızı ve indirme bağlantılarınızı takip edebilirsiniz.',
      '',
      `Giriş: ${loginHref}`,
      `Siparişlerim: ${ordersHref}`,
      '',
      `Destek: ${support}`,
      '',
      'İyi günler,',
      'Woontegra',
    ].join('\n')

    await dispatchMail({
      to: data.customerEmail,
      subject: 'Woontegra hesabınız oluşturuldu',
      text: textBody,
      html: mailHtmlDocument('Hesabınız oluşturuldu', bodyHtml),
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
