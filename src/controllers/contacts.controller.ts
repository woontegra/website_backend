import { Request, Response } from 'express'
import { contactsService } from '../services/contacts.service'

export const contactsController = {
  async create(req: Request, res: Response) {
    const { name, email, message } = req.body
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, message: 'Ad, e-posta ve mesaj gerekli' })
    }
    const contact = await contactsService.create({ name, email, message })
    return res.status(201).json({ success: true, data: contact })
  },

  async list(_req: Request, res: Response) {
    const list = await contactsService.list()
    return res.json({ success: true, data: list })
  },
}
