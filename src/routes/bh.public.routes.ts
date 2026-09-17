import { Router } from 'express'
import { createLicensePublicRateLimiter } from '../middleware/rateLimit.middleware'
import { customerAuthMiddleware } from '../middleware/customerAuth.middleware'
import * as bh from '../controllers/bh.public.controller'

/**
 * Bilirkişi Hesap sales/demo BFF — allowlisted paths only.
 * Mounted at /api/bh
 *
 * Demo remains public. Purchase payment endpoints require Woontegra customer auth.
 */
const r = Router()
const limiter = createLicensePublicRateLimiter()

r.get('/config', limiter, bh.getBhPublicConfig)
r.get('/product', limiter, bh.getBhProduct)
r.post('/quote', limiter, bh.postBhQuote)
r.get('/campaigns/:code', limiter, bh.getBhCampaignByCode)
r.post('/demo/request', limiter, bh.postBhDemoRequest)
r.get('/legal/templates/:type/preview', limiter, bh.getBhLegalPreview)
r.get('/payment/bank-transfer-availability', limiter, bh.getBhBankTransferAvailability)
r.post('/payment/bank-transfer-order', limiter, customerAuthMiddleware, bh.postBhBankTransferOrder)
r.post('/checkout/create-order', limiter, customerAuthMiddleware, bh.postBhCheckoutCreateOrder)
r.get('/payment/public-status', limiter, bh.getBhPaymentPublicStatus)
r.post('/payment/paytr-token-guest', limiter, customerAuthMiddleware, bh.postBhPaytrTokenGuest)

r.post('/renewal/options', limiter, customerAuthMiddleware, bh.postBhRenewalOptions)
r.post('/renewal/start', limiter, customerAuthMiddleware, bh.postBhRenewalStart)
r.post('/renewal/resolve', limiter, bh.postBhRenewalResolve)
r.post('/renewal/quote', limiter, bh.postBhRenewalQuote)

export const bhPublicRoutes = r
