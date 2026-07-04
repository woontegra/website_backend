import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import {
  getPublicCached,
  invalidatePublicCache,
  PUBLIC_PAGE_CONTENT_CACHE,
  PUBLIC_PAGE_CONTENT_TTL_MS,
} from '../lib/publicResponseCache'
import { PublishImageValidationError, validatePageContentPublishImages } from '../lib/publishImageValidation'
import { sanitizeImageFields } from '../utils/sanitizeImageFields'

export const pageContentController = {
  async getContent(req: Request, res: Response) {
    try {
      const { pageKey } = req.params
      const payload = await getPublicCached(
        PUBLIC_PAGE_CONTENT_CACHE,
        pageKey,
        PUBLIC_PAGE_CONTENT_TTL_MS,
        async () => {
          const pageContent = await prisma.pageContent.findUnique({
            where: { pageKey },
          })

          if (!pageContent) {
            return { success: true as const, data: null }
          }

          const parsed = sanitizeImageFields(JSON.parse(pageContent.content))
          return { success: true as const, data: parsed }
        },
      )

      return res.json(payload)
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

      const sanitized = sanitizeImageFields(content)

      try {
        validatePageContentPublishImages(pageKey, sanitized)
      } catch (err) {
        if (err instanceof PublishImageValidationError) {
          return res.status(400).json({ success: false, message: err.message })
        }
        throw err
      }
      
      const pageContent = await prisma.pageContent.upsert({
        where: { pageKey },
        update: { 
          content: JSON.stringify(sanitized),
          updatedAt: new Date(),
        },
        create: {
          pageKey,
          content: JSON.stringify(sanitized),
        },
      })

      invalidatePublicCache(PUBLIC_PAGE_CONTENT_CACHE, pageKey)
      
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
