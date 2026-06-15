import { Router } from 'express'
import * as payments from '../controllers/payments.controller'

export const paymentsPublicRoutes = Router()

paymentsPublicRoutes.get('/bank-transfer-display', payments.getBankTransferDisplay)
paymentsPublicRoutes.post('/paytr/start', payments.paytrStart)
paymentsPublicRoutes.post('/paytr/callback', payments.paytrCallback)
