import { Request, Response } from 'express'
import { getAdminPaytrDto, patchAdminPaytr } from '../services/paymentSettings.service'

export async function adminGetPaytr(_req: Request, res: Response) {
  try {
    const data = await getAdminPaytrDto()
    res.json({ success: true, data })
  } catch {
    res.status(500).json({ success: false, message: 'Yüklenemedi' })
  }
}

export async function adminPatchPaytr(req: Request, res: Response) {
  try {
    const data = await patchAdminPaytr(req.body as Record<string, unknown>)
    res.json({ success: true, data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Kaydedilemedi'
    res.status(400).json({ success: false, message: msg })
  }
}
