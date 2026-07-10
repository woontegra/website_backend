import { Router } from 'express'
import * as saasDemoRequests from '../controllers/saasDemoRequests.controller'

export const saasDemoRequestsPublicRoutes = Router()

saasDemoRequestsPublicRoutes.post(
  '/saas-demo-requests/muvekkil-kasa',
  saasDemoRequests.createMuvekkilKasaDemoRequest,
)
