import { Router } from 'express'
import { quotesController } from '../controllers/quotes.controller'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'

export const quotesRoutes = Router()

quotesRoutes.post('/', quotesController.create)
quotesRoutes.get('/', authMiddleware, adminOnly, quotesController.list)
quotesRoutes.get('/my', authMiddleware, quotesController.myQuotes)
