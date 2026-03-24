import 'dotenv/config'
// Railway: DATABASE_URL referansı yoksa PGHOST/PGUSER/… ile URL üret (scripts/resolve-database-url.cjs)
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('../scripts/resolve-database-url.cjs').applyToProcessEnv()

import path from 'path'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { authRoutes } from './routes/auth.routes'
import { usersRoutes } from './routes/users.routes'
import { contactsRoutes } from './routes/contacts.routes'
import { quotesRoutes } from './routes/quotes.routes'
import { projectsRoutes } from './routes/projects.routes'
import { supportRoutes } from './routes/support.routes'
import { blogRoutes } from './routes/blog.routes'
import { notificationsRoutes } from './routes/notifications.routes'
import { settingsRoutes } from './routes/settings.routes'
import { pagesRoutes } from './routes/pages.routes'
import { adminCmsRoutes } from './routes/admin.cms.routes'
import { menusPublicRoutes } from './routes/menus.public.routes'
import { servicesRoutes } from './routes/services.routes'
import { brandsRoutes } from './routes/brands.routes'
import { contactMessagesRoutes } from './routes/contact-messages.routes'
import pageContentRoutes from './routes/page-content.routes'

const app = express()
const PORT = process.env.PORT ?? 4000

app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173', credentials: true }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')))

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Çok fazla istek. Lütfen daha sonra tekrar deneyin.' },
})
app.use(limiter)

app.use('/api/auth', authRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/contacts', contactsRoutes)
app.use('/api/quotes', quotesRoutes)
app.use('/api/projects', projectsRoutes)
app.use('/api/support', supportRoutes)
app.use('/api/blog', blogRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/pages', pagesRoutes)
app.use('/api/menus', menusPublicRoutes)
app.use('/api/admin/cms', adminCmsRoutes)
app.use('/api/services', servicesRoutes)
app.use('/api/brands', brandsRoutes)
app.use('/api/contact-messages', contactMessagesRoutes)
app.use('/api/page-content', pageContentRoutes)

app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'Woontegra API' })
})

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint bulunamadı' })
})

app.listen(PORT, () => {
  console.log(`Woontegra API http://localhost:${PORT}`)
})
