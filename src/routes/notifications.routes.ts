import { Router } from 'express'
import { notificationsController } from '../controllers/notifications.controller'
import { authMiddleware } from '../middleware/auth.middleware'

export const notificationsRoutes = Router()

notificationsRoutes.get('/', authMiddleware, notificationsController.list)
notificationsRoutes.patch('/:id/read', authMiddleware, notificationsController.markRead)
