import { Request, Response } from 'express'
import { getAdminSidebarBadges } from '../services/adminSidebarBadges.service'

export async function adminGetSidebarBadges(_req: Request, res: Response) {
  try {
    const data = await getAdminSidebarBadges()
    return res.json({ success: true, data })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ success: false, message: 'Sidebar rozetleri yüklenemedi' })
  }
}
