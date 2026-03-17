import { Router } from 'express'
import { authController } from '../controllers/auth.controller'
import { authMiddleware } from '../middleware/auth.middleware'

export const authRoutes = Router()

authRoutes.post('/login', authController.login)
authRoutes.post('/register', authController.register)
authRoutes.post('/forgot-password', authController.forgotPassword)
authRoutes.post('/reset-password', authController.resetPassword)
authRoutes.post('/refresh', authController.refresh)
authRoutes.get('/profile', authMiddleware, authController.profile)
