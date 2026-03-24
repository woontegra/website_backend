import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'
import * as cms from '../controllers/cms.controller'

export const pagesRoutes = Router()

pagesRoutes.post('/', authMiddleware, adminOnly, cms.adminCreatePage)
pagesRoutes.put('/:id', authMiddleware, adminOnly, cms.adminUpdatePage)
pagesRoutes.get('/:slug', cms.getPageBySlug)
