import { Router } from 'express'
import * as campaigns from '../controllers/campaigns.controller'

const r = Router()
r.get('/campaigns/public', campaigns.publicGetActive)

export const campaignsPublicRoutes = r
