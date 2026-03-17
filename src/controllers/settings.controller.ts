import { Request, Response } from 'express'
import { settingsService } from '../services/settings.service'

export const settingsController = {
  async getPublic(_req: Request, res: Response) {
    const data = await settingsService.getPublic()
    return res.json({ success: true, data })
  },

  async getAll(_req: Request, res: Response) {
    const data = await settingsService.getAll()
    return res.json({ success: true, data })
  },

  async update(req: Request, res: Response) {
    const data = await settingsService.update(req.body)
    return res.json({ success: true, data })
  },
}
