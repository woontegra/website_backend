import type { Request, Response } from 'express'
import type { JwtPayload } from '../middleware/auth.middleware'
import { isBuilderPagesError } from '../lib/builderPages.errors'
import { normalizeBuilderPageKey } from '../lib/builderPages.validation'
import { builderPagesService } from '../services/builderPages.service'

type AuthedRequest = Request & { user?: JwtPayload }

function pageKeyFromParams(req: Request): string | null {
  return normalizeBuilderPageKey(req.params.pageKey)
}

function sendError(res: Response, err: unknown, fallback: string) {
  if (isBuilderPagesError(err)) {
    return res.status(err.status).json({ success: false, message: err.message })
  }
  const message = err instanceof Error ? err.message : fallback
  return res.status(500).json({ success: false, message })
}

export const builderPagesAdminController = {
  async getState(req: Request, res: Response) {
    const pageKey = pageKeyFromParams(req)
    if (!pageKey) return res.status(400).json({ success: false, message: 'Geçersiz sayfa anahtarı' })
    try {
      const data = await builderPagesService.getState(pageKey)
      return res.json({ success: true, data })
    } catch (err) {
      return sendError(res, err, 'Builder durumu yüklenemedi')
    }
  },

  async saveDraft(req: Request, res: Response) {
    const pageKey = pageKeyFromParams(req)
    if (!pageKey) return res.status(400).json({ success: false, message: 'Geçersiz sayfa anahtarı' })
    try {
      const data = await builderPagesService.saveDraft(pageKey, req.body?.content)
      return res.json({ success: true, data })
    } catch (err) {
      return sendError(res, err, 'Taslak kaydedilemedi')
    }
  },

  async publish(req: AuthedRequest, res: Response) {
    const pageKey = pageKeyFromParams(req)
    if (!pageKey) return res.status(400).json({ success: false, message: 'Geçersiz sayfa anahtarı' })
    try {
      const data = await builderPagesService.publish(pageKey, req.user?.userId)
      return res.json({ success: true, data })
    } catch (err) {
      return sendError(res, err, 'Yayın başarısız')
    }
  },

  async listRevisions(req: Request, res: Response) {
    const pageKey = pageKeyFromParams(req)
    if (!pageKey) return res.status(400).json({ success: false, message: 'Geçersiz sayfa anahtarı' })
    try {
      const data = await builderPagesService.listRevisions(pageKey)
      return res.json({ success: true, data })
    } catch (err) {
      return sendError(res, err, 'Sürüm listesi yüklenemedi')
    }
  },

  async getRevision(req: Request, res: Response) {
    const pageKey = pageKeyFromParams(req)
    const revisionId = String(req.params.revisionId ?? '').trim()
    if (!pageKey) return res.status(400).json({ success: false, message: 'Geçersiz sayfa anahtarı' })
    if (!revisionId) return res.status(400).json({ success: false, message: 'Geçersiz sürüm' })
    try {
      const data = await builderPagesService.getRevision(pageKey, revisionId)
      return res.json({ success: true, data })
    } catch (err) {
      return sendError(res, err, 'Sürüm yüklenemedi')
    }
  },
}
