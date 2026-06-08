import { Request, Response } from 'express'
import { cookieInventoryService } from '../services/cookieInventory.service'

export const cookiesController = {
  async getPublic(_req: Request, res: Response) {
    try {
      const data = await cookieInventoryService.getPublicCookies()
      return res.json(data)
    } catch (error) {
      console.error('getPublic cookies error', error)
      return res.status(500).json({ error: 'Çerez listesi alınamadı' })
    }
  },

  async getAdmin(_req: Request, res: Response) {
    try {
      const data = await cookieInventoryService.getAdminDashboard()
      return res.json(data)
    } catch (error) {
      console.error('getAdmin cookies error', error)
      return res.status(500).json({ error: 'Çerez tarama verisi alınamadı' })
    }
  },

  async runScan(req: Request, res: Response) {
    try {
      const baseUrl = typeof req.body?.baseUrl === 'string' ? req.body.baseUrl : undefined
      const data = await cookieInventoryService.runScan(baseUrl)
      return res.json({ success: true, ...data })
    } catch (error) {
      console.error('runScan error', error)
      const message = error instanceof Error ? error.message : 'Tarama başarısız'
      return res.status(500).json({ success: false, error: message })
    }
  },

  async updateItem(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { adminProvider, adminCategory, adminPurpose, adminDurationLabel } = req.body ?? {}

      const updated = await cookieInventoryService.updateItem(id, {
        adminProvider,
        adminCategory,
        adminPurpose,
        adminDurationLabel,
      })

      return res.json(updated)
    } catch (error) {
      console.error('updateItem error', error)
      return res.status(500).json({ error: 'Çerez kaydı güncellenemedi' })
    }
  },
}
