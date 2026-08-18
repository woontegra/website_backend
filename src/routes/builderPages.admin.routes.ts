import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'
import { builderPagesAdminController as ctrl } from '../controllers/builderPages.admin.controller'

const r = Router()
r.use(authMiddleware, adminOnly)

r.get('/builder-pages/:pageKey/revisions/:revisionId', ctrl.getRevision)
r.get('/builder-pages/:pageKey/revisions', ctrl.listRevisions)
r.put('/builder-pages/:pageKey/draft', ctrl.saveDraft)
r.post('/builder-pages/:pageKey/publish', ctrl.publish)
r.get('/builder-pages/:pageKey', ctrl.getState)

export const builderPagesAdminRoutes = r
