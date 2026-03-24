import { Router } from 'express'
import { pageContentController } from '../controllers/page-content.controller'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'

const router = Router()

// Public route - get page content
router.get('/:pageKey', pageContentController.getContent)

// Admin route - update page content
router.put('/:pageKey', authMiddleware, adminOnly, pageContentController.updateContent)

export default router
