import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'
import * as licenseProgramsAdmin from '../controllers/licensePrograms.admin.controller'

const r = Router()
r.use(authMiddleware, adminOnly)

r.get('/license-programs', licenseProgramsAdmin.adminListLicensePrograms)
r.get('/license-programs/:appCode', licenseProgramsAdmin.adminGetLicenseProgram)
r.post('/license-programs', licenseProgramsAdmin.adminCreateLicenseProgram)

export const licenseProgramsAdminRoutes = r
