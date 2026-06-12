import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'
import * as ctrl from '../controllers/navigationMenu.controller'

const r = Router()
r.use(authMiddleware, adminOnly)

r.get('/navigation-menu', ctrl.adminList)
r.get('/navigation-menu/:id', ctrl.adminGetById)
r.post('/navigation-menu', ctrl.adminCreate)
r.patch('/navigation-menu/:id', ctrl.adminPatch)
r.delete('/navigation-menu/:id', ctrl.adminDelete)

export const navigationMenuAdminRoutes = r
