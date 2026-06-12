import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'
import * as ctrl from '../controllers/productCategories.controller'

const r = Router()
r.use(authMiddleware, adminOnly)

r.get('/product-categories', ctrl.adminList)
r.get('/product-categories/:id', ctrl.adminGetById)
r.post('/product-categories', ctrl.adminCreate)
r.patch('/product-categories/:id', ctrl.adminPatch)
r.delete('/product-categories/:id', ctrl.adminDelete)

export const productCategoriesAdminRoutes = r
