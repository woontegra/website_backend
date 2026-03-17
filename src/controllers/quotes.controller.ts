import { Request, Response } from 'express'
import { quotesService } from '../services/quotes.service'
import { JwtPayload } from '../middleware/auth.middleware'

export const quotesController = {
  async create(req: Request, res: Response) {
    const { projectType, service, brief, contactName, contactEmail, contactPhone } = req.body
    if (!contactName || !contactEmail) {
      return res.status(400).json({ success: false, message: 'Ad ve e-posta gerekli' })
    }
    const quote = await quotesService.create({
      projectType,
      service,
      brief,
      contactName,
      contactEmail,
      contactPhone,
    })
    return res.status(201).json({ success: true, data: quote })
  },

  async list(_req: Request, res: Response) {
    const list = await quotesService.list()
    return res.json({ success: true, data: list })
  },

  async myQuotes(req: Request & { user?: JwtPayload }, res: Response) {
    const userId = req.user?.userId
    if (!userId) return res.status(401).json({ success: false, message: 'Yetkisiz' })
    const list = await quotesService.getByUser(userId)
    return res.json({ success: true, data: list })
  },
}
