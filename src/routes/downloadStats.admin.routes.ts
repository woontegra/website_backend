import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'
import * as downloadStatsAdmin from '../controllers/downloadStats.admin.controller'

const r = Router()
r.use(authMiddleware, adminOnly)

r.get('/download-stats', downloadStatsAdmin.adminListDownloadStats)

export const downloadStatsAdminRoutes = r
