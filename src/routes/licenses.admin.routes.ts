import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'
import * as licensesAdmin from '../controllers/licenses.admin.controller'

const r = Router()
r.use(authMiddleware, adminOnly)

r.get('/licenses', licensesAdmin.adminListLicenses)
r.get('/licenses/:id', licensesAdmin.adminGetLicense)
r.post('/licenses', licensesAdmin.adminCreateLicense)
r.patch('/licenses/:id', licensesAdmin.adminPatchLicense)
r.post('/licenses/:id/extend', licensesAdmin.adminExtendLicense)
r.post('/licenses/:id/reset-devices', licensesAdmin.adminResetLicenseDevices)
r.post('/licenses/:id/regenerate-password', licensesAdmin.adminRegenerateLicensePassword)
r.post('/licenses/:id/send-email', licensesAdmin.adminSendLicenseEmail)

export const licensesAdminRoutes = r
