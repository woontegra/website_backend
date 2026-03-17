import { Router } from 'express'
import { projectsController } from '../controllers/projects.controller'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'

export const projectsRoutes = Router()

projectsRoutes.get('/', authMiddleware, projectsController.list)
projectsRoutes.get('/:id', authMiddleware, projectsController.getById)
projectsRoutes.post('/', authMiddleware, adminOnly, projectsController.create)
