import { Request, Response } from 'express'
import { projectsService } from '../services/projects.service'
import { JwtPayload } from '../middleware/auth.middleware'

export const projectsController = {
  async list(req: Request & { user?: JwtPayload }, res: Response) {
    const userId = req.user?.userId
    const isAdmin = req.user?.role === 'admin'
    const list = await projectsService.list(userId, isAdmin)
    return res.json({ success: true, data: list })
  },

  async getById(req: Request, res: Response) {
    const { id } = req.params
    const project = await projectsService.getById(id)
    if (!project) return res.status(404).json({ success: false, message: 'Proje bulunamadı' })
    return res.json({ success: true, data: project })
  },

  async create(req: Request, res: Response) {
    const { title, userId } = req.body
    if (!title) return res.status(400).json({ success: false, message: 'Başlık gerekli' })
    const project = await projectsService.create({ title, userId })
    return res.status(201).json({ success: true, data: project })
  },
}
