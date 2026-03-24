import { Router } from 'express'
import * as menu from '../controllers/menu.controller'

export const menusPublicRoutes = Router()

menusPublicRoutes.get('/:location', menu.getPublicMenu)
