import { Router } from 'express'
import { createLicensePublicRateLimiter } from '../middleware/rateLimit.middleware'
import * as licensePublic from '../controllers/license.public.controller'

const r = Router()
const limiter = createLicensePublicRateLimiter()

r.post('/activate', limiter, licensePublic.postLicenseActivate)
r.post('/validate', limiter, licensePublic.postLicenseValidate)

export const licensePublicRoutes = r
