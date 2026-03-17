import { Router } from 'express'
import * as cms from '../controllers/cms.controller'

export const pagesRoutes = Router()

pagesRoutes.get('/:slug', cms.getPageBySlug)
