import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'
import * as bh from '../controllers/bh.admin.controller'

/**
 * Bilirkişi Hesap commercial admin BFF.
 * Mounted at /api/admin → paths /bh/...
 * Proxies to BH webapi with server-side BH admin credentials.
 */
const r = Router()
r.use(authMiddleware, adminOnly)

r.get('/bh/overview', bh.getBhAdminOverview)
r.get('/bh/product', bh.getBhAdminProduct)
r.post('/bh/product', bh.postBhAdminProduct)

r.get('/bh/campaigns', bh.getBhAdminCampaigns)
r.post('/bh/campaigns', bh.postBhAdminCampaign)
r.get('/bh/campaigns/:id', bh.getBhAdminCampaignById)
r.put('/bh/campaigns/:id', bh.putBhAdminCampaign)
r.delete('/bh/campaigns/:id', bh.deleteBhAdminCampaign)

r.get('/bh/bar-performance', bh.getBhAdminBarPerformance)
r.get('/bh/bar-performance/:barAssociationKey', bh.getBhAdminBarPerformanceDetails)

r.get('/bh/demo-requests', bh.getBhAdminDemoRequests)

r.get('/bh/orders', bh.getBhAdminOrders)
r.get('/bh/orders/:merchantOid', bh.getBhAdminOrderDetail)

r.get('/bh/bank-transfers', bh.getBhAdminBankTransfers)
r.get('/bh/bank-transfers/:merchantOid', bh.getBhAdminBankTransferDetail)
r.post('/bh/bank-transfers/:merchantOid/approve', bh.postBhAdminBankTransferApprove)
r.post('/bh/bank-transfers/:merchantOid/reject', bh.postBhAdminBankTransferReject)

r.get('/bh/legal-archives', bh.getBhAdminLegalArchives)
r.get('/bh/legal-archives/:id', bh.getBhAdminLegalArchiveDetail)
r.get('/bh/legal-archives/documents/:docId/download', bh.getBhAdminLegalArchiveDocumentDownload)

r.get('/bh/bar-associations', bh.getBhAdminBarAssociations)

export const bhAdminRoutes = r
