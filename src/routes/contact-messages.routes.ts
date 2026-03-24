import { Router } from 'express'
import * as contactMessagesController from '../controllers/contact-messages.controller'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'

export const contactMessagesRoutes = Router()

contactMessagesRoutes.post('/', contactMessagesController.create)
contactMessagesRoutes.get('/', authMiddleware, adminOnly, contactMessagesController.getAll)
contactMessagesRoutes.get('/:id', authMiddleware, adminOnly, contactMessagesController.getById)
contactMessagesRoutes.patch('/:id/read', authMiddleware, adminOnly, contactMessagesController.markAsRead)
contactMessagesRoutes.delete('/:id', authMiddleware, adminOnly, contactMessagesController.deleteMessage)
