import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'
import { uploadCatalog } from '../middleware/uploadCatalog.middleware'
import * as ctrl from '../controllers/catalogMedia.controller'

const r = Router()
r.use(authMiddleware, adminOnly)

r.get('/media', ctrl.adminList)
r.post('/media/upload', uploadCatalog.single('file'), ctrl.adminUpload)
r.delete('/media/:id', ctrl.adminDelete)

export const catalogMediaAdminRoutes = r
