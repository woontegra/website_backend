import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'

export const pageContentController = {
  async getContent(req: Request, res: Response) {
    try {
      const { pageKey } = req.params
      const pageContent = await prisma.pageContent.findUnique({
        where: { pageKey },
      })
      
      if (!pageContent) {
        return res.json({ success: true, data: null })
      }
      
      return res.json({ 
        success: true, 
        data: JSON.parse(pageContent.content) 
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'İçerik yüklenemedi'
      return res.status(500).json({ success: false, message })
    }
  },

  async updateContent(req: Request, res: Response) {
    try {
      const { pageKey } = req.params
      const { content } = req.body
      
      if (!content) {
        return res.status(400).json({ success: false, message: 'İçerik gerekli' })
      }
      
      const pageContent = await prisma.pageContent.upsert({
        where: { pageKey },
        update: { 
          content: JSON.stringify(content),
          updatedAt: new Date(),
        },
        create: {
          pageKey,
          content: JSON.stringify(content),
        },
      })
      
      return res.json({ 
        success: true, 
        data: JSON.parse(pageContent.content) 
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'İçerik kaydedilemedi'
      return res.status(500).json({ success: false, message })
    }
  },
}
