import { Router } from 'express'
import * as legal from '../controllers/legalDocuments.controller'

export const legalDocumentsPublicRoutes = Router()
legalDocumentsPublicRoutes.get('/', legal.publicList)
legalDocumentsPublicRoutes.post('/preview', legal.publicPreview)
legalDocumentsPublicRoutes.get('/:type', legal.publicGetByType)
