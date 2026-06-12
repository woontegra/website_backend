import { Router } from 'express'
import * as orders from '../controllers/orders.controller'
import { optionalCustomerAuth } from '../middleware/customerAuth.middleware'

export const ordersPublicRoutes = Router()

ordersPublicRoutes.post('/', optionalCustomerAuth, orders.createOrder)
ordersPublicRoutes.post('/lookup', orders.orderLookup)
ordersPublicRoutes.get('/success/:orderNo', optionalCustomerAuth, orders.orderSuccess)
