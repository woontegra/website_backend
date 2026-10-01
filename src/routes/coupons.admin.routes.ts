import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'
import * as coupons from '../controllers/coupons.controller'

const r = Router()
r.use(authMiddleware, adminOnly)

r.get('/coupons', coupons.adminList)
r.post('/coupons', coupons.adminCreate)
r.get('/coupons/:id', coupons.adminGetById)
r.patch('/coupons/:id', coupons.adminUpdate)
r.post('/coupons/:id/archive', coupons.adminArchive)

export const couponsAdminRoutes = r
