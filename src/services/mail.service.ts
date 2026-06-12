import nodemailer from 'nodemailer'

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
    lines: { productName: string; downloadUrl: string }[]
  }) {
    const support = 'info@woontegra.com'
    const safeName = escapeHtml(data.customerName)
    const safeOrder = escapeHtml(data.orderNo)
    const links = data.lines
      .filter((l) => l.downloadUrl)
      .map((l) => {
        const name = escapeHtml(l.productName)
        const href = encodeURI(l.downloadUrl)
        return `<li><strong>${name}</strong> — <a href="${href}">İndir</a></li>`
      })
      .join('')

    await transporter.sendMail({
      from: '"Woontegra" <info@woontegra.com>',
      to: data.customerEmail,
      subject: `Siparişiniz onaylandı — ${data.orderNo}`,
      html: `
        <p>Merhaba ${safeName},</p>
        <p>Ödemeniz alındı. Sipariş numaranız: <b>${safeOrder}</b></p>
        <p><b>İndirme bağlantıları:</b></p>
        <ul>${links}</ul>
        <p>Sorularınız için: <a href="mailto:${support}">${support}</a></p>
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
