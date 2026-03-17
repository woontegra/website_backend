import { Request, Response } from 'express'
import { notificationsService } from '../services/notifications.service'
import { JwtPayload } from '../middleware/auth.middleware'

export const notificationsController = {
  async list(req: Request & { user?: JwtPayload }, res: Response) {
    const userId = req.user?.userId
    if (!userId) return res.status(401).json({ success: false, message: 'Yetkisiz' })
    const list = await notificationsService.list(userId)
    return res.json({ success: true, data: list })
  },

  async markRead(req: Request & { user?: JwtPayload }, res: Response) {
    const { id } = req.params
    const userId = req.user?.userId
    if (!userId) return res.status(401).json({ success: false, message: 'Yetkisiz' })
    await notificationsService.markRead(id, userId)
    return res.json({ success: true })
  },
}
