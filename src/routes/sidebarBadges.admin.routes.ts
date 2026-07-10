import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'
import * as adminSidebarBadgesController from '../controllers/adminSidebarBadges.controller'

const r = Router()
r.use(authMiddleware, adminOnly)

r.get('/sidebar-badges', adminSidebarBadgesController.adminGetSidebarBadges)

export const adminSidebarBadgesRoutes = r
