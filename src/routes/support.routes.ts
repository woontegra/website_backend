import { Router } from 'express'
import { supportController } from '../controllers/support.controller'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'

export const supportRoutes = Router()

supportRoutes.get('/', authMiddleware, supportController.list)
supportRoutes.post('/', authMiddleware, supportController.create)
supportRoutes.get('/:id', authMiddleware, supportController.getById)
