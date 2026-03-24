import { Request, Response } from 'express'
import { blogService } from '../services/blog.service'

export const blogController = {
  async listCategories(_req: Request, res: Response) {
    const list = await blogService.listCategories()
    return res.json({ success: true, data: list })
  },

  async listPosts(req: Request, res: Response) {
    const { category } = req.query
    const list = await blogService.listPosts({ category: category as string, status: 'published' })
    return res.json({ success: true, data: list })
  },

  async getBySlug(req: Request, res: Response) {
    const { slug } = req.params
    const post = await blogService.getBySlug(slug)
    if (!post) return res.status(404).json({ success: false, message: 'Yazı bulunamadı' })
    return res.json({ success: true, data: post })
  },

  async createPost(_req: Request, res: Response) {
    return res.status(501).json({ success: false, message: 'Admin panelinden oluşturun' })
  },
}
