import { Router } from 'express'
import { settingsController } from '../controllers/settings.controller'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'

export const settingsRoutes = Router()

settingsRoutes.get('/', settingsController.getPublic)
settingsRoutes.get('/admin', authMiddleware, adminOnly, settingsController.getAll)
settingsRoutes.patch('/admin', authMiddleware, adminOnly, settingsController.update)
