import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'
import * as ordersAdmin from '../controllers/orders.admin.controller'
import * as legalArchiveAdmin from '../controllers/legalArchive.admin.controller'

const r = Router()
r.use(authMiddleware, adminOnly)

r.get('/orders', ordersAdmin.adminListOrders)
r.post('/orders/:id/retry-delivery', ordersAdmin.adminRetryOrderDelivery)
r.post('/orders/:id/confirm-bank-payment', ordersAdmin.adminConfirmBankPayment)
r.patch('/orders/:id/confirm-bank-transfer', ordersAdmin.adminConfirmBankPayment)
r.patch('/orders/:id/licenses/:licenseId', ordersAdmin.adminPatchOrderLicense)
r.get('/orders/:id', ordersAdmin.adminGetOrder)
r.get('/orders/:id/legal-archive', legalArchiveAdmin.adminListLegalArchive)
r.post('/orders/:id/legal-archive/generate', legalArchiveAdmin.adminGenerateLegalArchive)
r.get('/orders/:id/legal-archive/files/:fileId/download', legalArchiveAdmin.adminDownloadLegalArchiveFile)

export const ordersAdminRoutes = r
