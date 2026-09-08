import { Router } from 'express'
import { getPublicReferralRedirect } from '../controllers/affiliateReferral.public.controller'

export const affiliateReferralPublicRoutes = Router()
affiliateReferralPublicRoutes.get('/r/:code', getPublicReferralRedirect)
