import { Router } from 'express'
import { blogController } from '../controllers/blog.controller'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'

export const blogRoutes = Router()

blogRoutes.get('/categories', blogController.listCategories)
blogRoutes.get('/posts', blogController.listPosts)
blogRoutes.get('/posts/:slug', blogController.getBySlug)
blogRoutes.post('/posts', authMiddleware, adminOnly, blogController.createPost)
