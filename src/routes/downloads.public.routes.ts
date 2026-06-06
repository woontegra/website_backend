import { Router } from 'express'
import * as downloads from '../controllers/downloads.controller'

export const downloadsPublicRoutes = Router()

downloadsPublicRoutes.get('/sifre-kasasi/stats', downloads.getSifreKasasiStats)
downloadsPublicRoutes.get('/sifre-kasasi/setup', downloads.downloadSifreKasasiSetup)
downloadsPublicRoutes.get('/sifre-kasasi/portable', downloads.downloadSifreKasasiPortable)
