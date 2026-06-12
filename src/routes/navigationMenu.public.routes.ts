import { Router } from 'express'
import * as ctrl from '../controllers/navigationMenu.controller'

export const navigationMenuPublicRoutes = Router()
navigationMenuPublicRoutes.get('/', ctrl.publicList)
