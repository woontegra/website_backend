import { Router } from 'express'
import {
  createLicensePublicRateLimiter,
  createPublicBhProductReadRateLimiter,
} from '../middleware/rateLimit.middleware'
import { customerAuthMiddleware, optionalCustomerAuth } from '../middleware/customerAuth.middleware'
import * as bh from '../controllers/bh.public.controller'

/**
 * Bilirkişi Hesap sales/demo BFF — allowlisted paths only.
 * Mounted at /api/bh
 *
 * Demo remains public. Purchase payment endpoints require Woontegra customer auth.
 */
const r = Router()
const limiter = createLicensePublicRateLimiter()
const productReadLimiter = createPublicBhProductReadRateLimiter()

r.get('/config', limiter, bh.getBhPublicConfig)
r.get('/product', productReadLimiter, bh.getBhProduct)
r.post('/quote', limiter, bh.postBhQuote)
r.get('/campaigns/:code', limiter, bh.getBhCampaignByCode)
r.post('/demo/request', limiter, bh.postBhDemoRequest)
r.post('/desktop-trial', limiter, optionalCustomerAuth, bh.postBhDesktopTrial)
r.get('/legal/templates/:type/preview', limiter, bh.getBhLegalPreview)
r.get('/payment/bank-transfer-availability', limiter, bh.getBhBankTransferAvailability)
r.post('/payment/bank-transfer-order', limiter, customerAuthMiddleware, bh.postBhBankTransferOrder)
r.post('/checkout/coupon/validate', limiter, optionalCustomerAuth, bh.postBhCheckoutCouponValidate)
r.post('/checkout/create-order', limiter, customerAuthMiddleware, bh.postBhCheckoutCreateOrder)
r.post('/desktop-purchase/resolve', limiter, bh.postBhDesktopPurchaseResolve)
r.post('/desktop-purchase/quote', limiter, bh.postBhDesktopPlatformQuote)
r.post('/desktop-purchase/checkout', limiter, customerAuthMiddleware, bh.postBhDesktopPurchaseCheckout)
r.get('/payment/public-status', limiter, bh.getBhPaymentPublicStatus)
r.post('/payment/paytr-token-guest', limiter, customerAuthMiddleware, bh.postBhPaytrTokenGuest)

r.post('/renewal/options', limiter, customerAuthMiddleware, bh.postBhRenewalOptions)
r.post('/renewal/start', limiter, customerAuthMiddleware, bh.postBhRenewalStart)
r.post('/renewal/resolve', limiter, bh.postBhRenewalResolve)
r.post('/renewal/quote', limiter, bh.postBhRenewalQuote)

export const bhPublicRoutes = r
