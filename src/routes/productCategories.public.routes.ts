import { Router } from 'express'
import * as pc from '../controllers/productCategories.controller'
import * as products from '../controllers/products.controller'

export const productCategoriesPublicRoutes = Router()

productCategoriesPublicRoutes.get('/', pc.publicList)
productCategoriesPublicRoutes.get('/:slug/products', products.publicListByCategorySlug)
