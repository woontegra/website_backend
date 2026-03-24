import { Router } from 'express'
import * as servicesController from '../controllers/services.controller'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'

export const servicesRoutes = Router()

servicesRoutes.get('/', servicesController.getAll)
servicesRoutes.get('/:id', servicesController.getById)
servicesRoutes.post('/', authMiddleware, adminOnly, servicesController.create)
servicesRoutes.put('/:id', authMiddleware, adminOnly, servicesController.update)
servicesRoutes.delete('/:id', authMiddleware, adminOnly, servicesController.deleteService)
