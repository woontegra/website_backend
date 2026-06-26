import { Router } from 'express'
import * as freeDownloads from '../controllers/freeProductDownload.controller'
import * as orderDownloads from '../controllers/orderProductDownload.controller'

export const downloadsFreeRoutes = Router()

downloadsFreeRoutes.head('/free/:productSlug/:fileType', freeDownloads.headFreeProductDownload)
downloadsFreeRoutes.get('/free/:productSlug/:fileType', freeDownloads.getFreeProductDownload)

downloadsFreeRoutes.head('/order/:token', orderDownloads.headOrderDownload)
downloadsFreeRoutes.get('/order/:token', orderDownloads.getOrderDownload)
