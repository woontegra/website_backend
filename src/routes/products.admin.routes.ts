import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'
import * as products from '../controllers/products.controller'

const r = Router()
r.use(authMiddleware, adminOnly)

r.get('/products', products.adminList)
r.get('/products/:id', products.adminGetById)
r.post('/products', products.adminCreate)
r.patch('/products/:id', products.adminPatch)
r.delete('/products/:id', products.adminDelete)

export const productsAdminRoutes = r
