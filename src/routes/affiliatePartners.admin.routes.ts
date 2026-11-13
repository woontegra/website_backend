import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'
import * as ctrl from '../controllers/affiliatePartners.controller'

const r = Router()
r.use(authMiddleware, adminOnly)

r.get('/affiliate-partners', ctrl.adminList)
r.get('/affiliate-partners/:id', ctrl.adminGetById)
r.post('/affiliate-partners', ctrl.adminCreate)
r.patch('/affiliate-partners/:id', ctrl.adminUpdate)
r.post('/affiliate-partners/:id/deactivate', ctrl.adminDeactivate)
r.post('/affiliate-partners/:id/activate', ctrl.adminActivate)
r.post('/affiliate-partners/:id/partner-access/invite', ctrl.adminInvitePartnerAccess)
r.post('/affiliate-partners/:id/partner-access/revoke', ctrl.adminRevokePartnerAccess)
r.get('/affiliate-partners/:id/links', ctrl.adminListLinks)
r.post('/affiliate-partners/:id/links', ctrl.adminCreateLink)
r.get('/affiliate-partners/:id/summary', ctrl.adminGetSummary)
r.get('/affiliate-partners/:id/commissions', ctrl.adminListCommissions)
r.get('/affiliate-partners/:id/payouts/earned', ctrl.adminListEarnedForPayout)
r.get('/affiliate-partners/:id/payouts', ctrl.adminListPayouts)
r.post('/affiliate-partners/:id/payouts', ctrl.adminCreatePayout)
r.post('/affiliate-partners/links/:linkId/deactivate', ctrl.adminDeactivateLink)
r.post('/affiliate-partners/links/:linkId/activate', ctrl.adminActivateLink)

export const affiliatePartnersAdminRoutes = r
