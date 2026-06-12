import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'
import * as pay from '../controllers/paymentSettings.controller'

const r = Router()
r.use(authMiddleware, adminOnly)
r.get('/payment-settings/paytr', pay.adminGetPaytr)
r.patch('/payment-settings/paytr', pay.adminPatchPaytr)

export const paymentSettingsAdminRoutes = r
