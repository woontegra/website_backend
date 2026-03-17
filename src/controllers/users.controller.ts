import { Request, Response } from 'express'
import { usersService } from '../services/users.service'
import { JwtPayload } from '../middleware/auth.middleware'

export const usersController = {
  async list(_req: Request, res: Response) {
    const list = await usersService.list()
    return res.json({ success: true, data: list })
  },

  async getById(req: Request, res: Response) {
    const { id } = req.params
    const user = await usersService.getById(id)
    if (!user) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' })
    return res.json({ success: true, data: user })
  },

  async updateProfile(req: Request & { user?: JwtPayload }, res: Response) {
    const userId = req.user?.userId ?? req.params.id
    const { fullName, phone } = req.body
    const updated = await usersService.updateProfile(userId, { fullName, phone })
    return res.json({ success: true, data: updated })
  },
}
