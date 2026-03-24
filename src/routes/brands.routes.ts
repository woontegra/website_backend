import { Router } from 'express'
import * as brandsController from '../controllers/brands.controller'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'

export const brandsRoutes = Router()

brandsRoutes.get('/', brandsController.getAll)
brandsRoutes.get('/:id', brandsController.getById)
brandsRoutes.post('/', authMiddleware, adminOnly, brandsController.create)
brandsRoutes.put('/:id', authMiddleware, adminOnly, brandsController.update)
brandsRoutes.delete('/:id', authMiddleware, adminOnly, brandsController.deleteBrand)
