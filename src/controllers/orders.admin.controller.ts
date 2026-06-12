import { Request, Response } from 'express'
import { ordersAdminService } from '../services/orders.service'

export async function adminListOrders(req: Request, res: Response) {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined
  const email = typeof req.query.email === 'string' ? req.query.email : undefined
  const orderNo = typeof req.query.orderNo === 'string' ? req.query.orderNo : undefined
  const rows = await ordersAdminService.list({ status, email, orderNo })
  return res.json({ success: true, data: rows })
}

export async function adminGetOrder(req: Request, res: Response) {
  const id = String(req.params.id ?? '').trim()
  if (!id) {
    return res.status(400).json({ success: false, message: 'Geçersiz id' })
  }
  const row = await ordersAdminService.getById(id)
  if (!row) {
    return res.status(404).json({ success: false, message: 'Sipariş bulunamadı' })
  }
  return res.json({ success: true, data: row })
}
