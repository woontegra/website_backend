import { Router } from 'express'
import { customerAuthMiddleware } from '../middleware/customerAuth.middleware'
import * as c from '../controllers/customers.controller'

const r = Router()

r.post('/register', c.register)
r.post('/login', c.login)

r.use(customerAuthMiddleware)
r.post('/logout', c.logout)
r.get('/me', c.me)
r.patch('/me', c.patchMe)
r.patch('/me/password', c.patchPassword)

r.get('/me/addresses', c.listAddresses)
r.post('/me/addresses', c.createAddress)
r.patch('/me/addresses/:id', c.patchAddress)
r.delete('/me/addresses/:id', c.deleteAddress)

r.get('/me/orders', c.listOrders)
r.get('/me/orders/:orderNo', c.getOrder)
r.get('/me/licenses', c.listLicenses)

r.get('/me/favorites', c.listFavorites)
r.post('/me/favorites/:productId', c.addFavorite)
r.delete('/me/favorites/:productId', c.removeFavorite)

export const customersPublicRoutes = r
