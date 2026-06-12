import { Router } from 'express'
import * as products from '../controllers/products.controller'

export const productsPublicRoutes = Router()

productsPublicRoutes.post('/cart-preview', products.publicCartPreview)
productsPublicRoutes.get('/', products.publicList)
productsPublicRoutes.get('/:slug', products.publicGetBySlug)
