import { Router } from 'express'
import { createLicensePublicRateLimiter } from '../middleware/rateLimit.middleware'
import * as desktopLicenseRenewalPublic from '../controllers/desktopLicenseRenewal.public.controller'

const r = Router()
const limiter = createLicensePublicRateLimiter()

r.post('/desktop-license/renewal-link', limiter, desktopLicenseRenewalPublic.postDesktopLicenseRenewalLink)
r.post('/desktop-license/renewal/resolve', limiter, desktopLicenseRenewalPublic.postDesktopLicenseRenewalResolve)
r.post('/desktop-license/renewal/preview', limiter, desktopLicenseRenewalPublic.postDesktopLicenseRenewalPreview)

export const desktopLicenseRenewalPublicRoutes = r
