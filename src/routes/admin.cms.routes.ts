import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'
import { uploadImage } from '../middleware/upload.middleware'
import * as cms from '../controllers/cms.controller'
import * as media from '../controllers/media.controller'
import * as menu from '../controllers/menu.controller'
import * as adminPost from '../controllers/adminPost.controller'

const r = Router()
r.use(authMiddleware, adminOnly)

r.get('/media', media.adminListMedia)
r.post('/media/upload', uploadImage.single('file'), media.adminUploadMedia)
r.delete('/media/:id', media.adminDeleteMedia)

r.get('/pages', cms.adminListPages)
r.get('/pages/:id', cms.adminGetPage)
r.put('/pages/:id', cms.adminUpdatePage)
r.delete('/pages/:id', cms.adminDeletePage)

r.get('/menus', menu.adminListMenus)
r.get('/menus/:location/items', menu.adminGetMenuItems)
r.put('/menus/:location/items', menu.adminSetMenuItems)

r.get('/post-categories', adminPost.adminListCategories)
r.post('/post-categories', adminPost.adminCreateCategory)
r.put('/post-categories/:id', adminPost.adminUpdateCategory)
r.delete('/post-categories/:id', adminPost.adminDeleteCategory)

r.get('/posts', adminPost.adminListPosts)
r.get('/posts/:id', adminPost.adminGetPost)
r.post('/posts', adminPost.adminCreatePost)
r.put('/posts/:id', adminPost.adminUpdatePost)
r.delete('/posts/:id', adminPost.adminDeletePost)

export const adminCmsRoutes = r
