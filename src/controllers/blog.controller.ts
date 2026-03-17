import { Request, Response } from 'express'
import { blogService } from '../services/blog.service'

export const blogController = {
  async listCategories(_req: Request, res: Response) {
    const list = await blogService.listCategories()
    return res.json({ success: true, data: list })
  },

  async listPosts(req: Request, res: Response) {
    const { category, status } = req.query
    const list = await blogService.listPosts({ category: category as string, status: status as string })
    return res.json({ success: true, data: list })
  },

  async getBySlug(req: Request, res: Response) {
    const { slug } = req.params
    const post = await blogService.getBySlug(slug)
    if (!post) return res.status(404).json({ success: false, message: 'Yazı bulunamadı' })
    return res.json({ success: true, data: post })
  },

  async createPost(req: Request, res: Response) {
    const { title, slug, excerpt, body, categoryId } = req.body
    if (!title || !slug) return res.status(400).json({ success: false, message: 'Başlık ve slug gerekli' })
    const post = await blogService.createPost({ title, slug, excerpt, body, categoryId })
    return res.status(201).json({ success: true, data: post })
  },
}
