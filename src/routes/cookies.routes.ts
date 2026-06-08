import { Router } from 'express'
import { cookiesController } from '../controllers/cookies.controller'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'

export const cookiesPublicRoutes = Router()
cookiesPublicRoutes.get('/cookies', cookiesController.getPublic)

export const cookiesAdminRoutes = Router()
cookiesAdminRoutes.get('/cookies', authMiddleware, adminOnly, cookiesController.getAdmin)
cookiesAdminRoutes.post('/cookies/scan', authMiddleware, adminOnly, cookiesController.runScan)
cookiesAdminRoutes.patch('/cookies/:id', authMiddleware, adminOnly, cookiesController.updateItem)
