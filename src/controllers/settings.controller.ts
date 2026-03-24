import { Request, Response } from 'express'
import { settingsService } from '../services/settings.service'
import nodemailer from 'nodemailer'

export const settingsController = {
  async getPublic(_req: Request, res: Response) {
    try {
      const data = await settingsService.getPublic()
      return res.json(data)
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch settings' })
    }
  },

  async getAll(_req: Request, res: Response) {
    try {
      const data = await settingsService.getAll()
      return res.json(data)
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch settings' })
    }
  },

  async update(req: Request, res: Response) {
    try {
      const data = await settingsService.update(req.body)
      return res.json(data)
    } catch (error) {
      return res.status(500).json({ error: 'Failed to update settings' })
    }
  },

  async testEmail(req: Request, res: Response) {
    try {
      const { to, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPassword } = req.body

      if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword) {
        return res.status(400).json({ error: 'SMTP ayarları eksik' })
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort),
        secure: smtpSecure,
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
      })

      await transporter.sendMail({
        from: smtpUser,
        to: to || smtpUser,
        subject: 'Woontegra - Test E-postası',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #16a34a;">Test E-postası Başarılı!</h2>
            <p>SMTP ayarlarınız doğru şekilde yapılandırılmış.</p>
            <p>Bu e-posta Woontegra admin panelinden gönderilmiştir.</p>
            <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="color: #6b7280; font-size: 12px;">Woontegra © ${new Date().getFullYear()}</p>
          </div>
        `,
      })

      return res.json({ success: true, message: 'Test e-postası gönderildi' })
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'E-posta gönderilemedi' })
    }
  },

  async clearCache(_req: Request, res: Response) {
    try {
      const result = await settingsService.clearCache()
      return res.json(result)
    } catch (error) {
      return res.status(500).json({ error: 'Cache temizlenemedi' })
    }
  },
}
