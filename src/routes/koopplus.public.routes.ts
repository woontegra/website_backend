import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import * as koopplusPublic from '../controllers/koopplus.public.controller'

export const koopplusPublicRoutes = Router()

const demoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Çok fazla istek. Lütfen daha sonra tekrar deneyin.' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
})

koopplusPublicRoutes.post('/demo-request', demoLimiter, koopplusPublic.createKoopPlusDemoRequest)
