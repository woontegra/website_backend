import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'
import * as saasMembershipsAdmin from '../controllers/saasMemberships.admin.controller'

const r = Router()
r.use(authMiddleware, adminOnly)

r.get('/saas-memberships', saasMembershipsAdmin.adminListSaasMemberships)
r.get('/saas-memberships/:id', saasMembershipsAdmin.adminGetSaasMembership)
r.post('/saas-memberships', saasMembershipsAdmin.adminCreateSaasMembership)
r.patch('/saas-memberships/:id', saasMembershipsAdmin.adminPatchSaasMembership)
r.patch('/saas-memberships/:id/status', saasMembershipsAdmin.adminPatchSaasMembershipStatus)
r.patch('/saas-memberships/:id/extend', saasMembershipsAdmin.adminExtendSaasMembership)

export const saasMembershipsAdminRoutes = r
