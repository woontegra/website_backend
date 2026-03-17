import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'
import * as cms from '../controllers/cms.controller'

const r = Router()
r.use(authMiddleware, adminOnly)

r.get('/pages', cms.adminListPages)
r.get('/pages/:id', cms.adminGetPage)
r.post('/pages', cms.adminCreatePage)
r.put('/pages/:id', cms.adminUpdatePage)
r.delete('/pages/:id', cms.adminDeletePage)

r.post('/sections', cms.adminCreateSection)
r.put('/sections/:id', cms.adminUpdateSection)
r.delete('/sections/:id', cms.adminDeleteSection)
r.patch('/sections/reorder', cms.adminReorderSections)

r.post('/items', cms.adminCreateItem)
r.put('/items/:id', cms.adminUpdateItem)
r.delete('/items/:id', cms.adminDeleteItem)
r.patch('/items/reorder', cms.adminReorderItems)

r.post('/faqs', cms.adminCreateFaq)
r.put('/faqs/:id', cms.adminUpdateFaq)
r.delete('/faqs/:id', cms.adminDeleteFaq)
r.patch('/faqs/reorder', cms.adminReorderFaqs)

export const adminCmsRoutes = r
