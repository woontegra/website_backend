import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'
import * as legal from '../controllers/legalDocuments.controller'

const r = Router()
r.use(authMiddleware, adminOnly)
r.get('/legal-documents', legal.adminList)
r.get('/legal-documents/:id', legal.adminGetById)
r.post('/legal-documents', legal.adminCreate)
r.patch('/legal-documents/:id', legal.adminPatch)
r.delete('/legal-documents/:id', legal.adminDelete)

export const legalDocumentsAdminRoutes = r
