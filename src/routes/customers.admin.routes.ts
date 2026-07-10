import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'
import * as customersAdmin from '../controllers/customers.admin.controller'

const r = Router()
r.use(authMiddleware, adminOnly)

r.get('/customers/summary', customersAdmin.adminCustomerSummary)
r.get('/customers', customersAdmin.adminListCustomers)
r.get('/customers/:id', customersAdmin.adminGetCustomer)
r.patch('/customers/:id/status', customersAdmin.adminPatchCustomerStatus)
r.patch('/customers/:id', customersAdmin.adminPatchCustomer)
r.delete('/customers/:id', customersAdmin.adminDeleteCustomer)

export const customersAdminRoutes = r
