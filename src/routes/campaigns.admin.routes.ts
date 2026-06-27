import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'
import * as campaigns from '../controllers/campaigns.controller'

const r = Router()
r.use(authMiddleware, adminOnly)

r.get('/campaigns', campaigns.adminList)
r.get('/campaigns/:id', campaigns.adminGetById)
r.post('/campaigns', campaigns.adminCreate)
r.patch('/campaigns/:id', campaigns.adminUpdate)
r.delete('/campaigns/:id', campaigns.adminDelete)

export const campaignsAdminRoutes = r
