import express from 'express'
import { mailService } from '../services/mail.service'

const router = express.Router()

router.post('/contact', async (req, res) => {
  const { name, email, message } = req.body

  if (!name || !email || !message) {
    return res.status(400).json({ success: false, message: 'Tüm alanlar zorunludur' })
  }

  try {
    await mailService.sendContactForm({ name, email, message })
    res.json({ success: true, message: 'Mesajınız başarıyla gönderildi' })
  } catch (err) {
    console.error('Contact form error:', err)
    res.status(500).json({ success: false, message: 'Mail gönderilirken hata oluştu' })
  }
})

router.post('/offer', async (req, res) => {
  const { name, email, phone, service, note } = req.body

  if (!name || !email || !phone || !service) {
    return res.status(400).json({ success: false, message: 'Zorunlu alanlar eksik' })
  }

  try {
    await mailService.sendOfferForm({ name, email, phone, service, note })
    res.json({ success: true, message: 'Teklif talebiniz başarıyla gönderildi' })
  } catch (err) {
    console.error('Offer form error:', err)
    res.status(500).json({ success: false, message: 'Mail gönderilirken hata oluştu' })
  }
})

export default router
