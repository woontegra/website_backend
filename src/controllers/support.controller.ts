import { Request, Response } from 'express'
import { supportService } from '../services/support.service'
import { JwtPayload } from '../middleware/auth.middleware'

export const supportController = {
  async list(req: Request & { user?: JwtPayload }, res: Response) {
    const userId = req.user?.userId
    const isAdmin = req.user?.role === 'admin'
    const list = await supportService.list(userId, isAdmin)
    return res.json({ success: true, data: list })
  },

  async getById(req: Request, res: Response) {
    const { id } = req.params
    const ticket = await supportService.getById(id)
    if (!ticket) return res.status(404).json({ success: false, message: 'Talep bulunamadı' })
    return res.json({ success: true, data: ticket })
  },

  async create(req: Request & { user?: JwtPayload }, res: Response) {
    const userId = req.user?.userId
    if (!userId) return res.status(401).json({ success: false, message: 'Yetkisiz' })
    const { subject, message } = req.body
    if (!subject) return res.status(400).json({ success: false, message: 'Konu gerekli' })
    const ticket = await supportService.create({ userId, subject, message })
    return res.status(201).json({ success: true, data: ticket })
  },
}
