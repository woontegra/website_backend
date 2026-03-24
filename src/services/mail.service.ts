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
  }
}
