import { Router } from 'express'
import { usersController } from '../controllers/users.controller'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'

export const usersRoutes = Router()

usersRoutes.get('/', authMiddleware, adminOnly, usersController.list)
usersRoutes.get('/:id', authMiddleware, usersController.getById)
usersRoutes.patch('/:id/profile', authMiddleware, usersController.updateProfile)
