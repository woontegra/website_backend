import { Router } from 'express'
import { settingsController } from '../controllers/settings.controller'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'

export const settingsRoutes = Router()

settingsRoutes.get('/', settingsController.getPublic)
settingsRoutes.get('/admin', authMiddleware, adminOnly, settingsController.getAll)
settingsRoutes.patch('/', authMiddleware, adminOnly, settingsController.update)
settingsRoutes.post('/test-email', authMiddleware, adminOnly, settingsController.testEmail)
settingsRoutes.post('/clear-cache', authMiddleware, adminOnly, settingsController.clearCache)
