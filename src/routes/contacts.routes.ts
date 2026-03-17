import { Router } from 'express'
import { contactsController } from '../controllers/contacts.controller'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'

export const contactsRoutes = Router()

contactsRoutes.post('/', contactsController.create)
contactsRoutes.get('/', authMiddleware, adminOnly, contactsController.list)
