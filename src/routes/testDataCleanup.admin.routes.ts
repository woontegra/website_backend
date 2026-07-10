import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'
import * as testDataCleanupAdmin from '../controllers/testDataCleanup.admin.controller'

const r = Router()
r.use(authMiddleware, adminOnly)

r.get('/test-data-cleanup/preview', testDataCleanupAdmin.adminPreviewTestDataCleanup)
r.post('/test-data-cleanup', testDataCleanupAdmin.adminExecuteTestDataCleanup)

export const testDataCleanupAdminRoutes = r
