import { Router } from 'express'
import { createLicensePublicRateLimiter } from '../middleware/rateLimit.middleware'
import * as mkSaasLicensePurchasePublic from '../controllers/mkSaasLicensePurchase.public.controller'

const r = Router()
const limiter = createLicensePublicRateLimiter()

r.post('/mk-saas/license-purchase/resolve', limiter, mkSaasLicensePurchasePublic.postMkSaasLicensePurchaseResolve)
r.post('/mk-saas/license-purchase/preview', limiter, mkSaasLicensePurchasePublic.postMkSaasLicensePurchasePreview)

export const mkSaasLicensePurchasePublicRoutes = r
