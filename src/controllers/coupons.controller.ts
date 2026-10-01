import { Request, Response } from 'express'
import { couponsService } from '../services/coupons.service'

function readBody(req: Request): Record<string, unknown> {
  return (req.body ?? {}) as Record<string, unknown>
}

export async function adminList(req: Request, res: Response) {
  const includeArchived = String(req.query.includeArchived ?? '') === 'true'
  const data = await couponsService.listAdmin(includeArchived)
  return res.json({ success: true, data })
}

export async function adminGetById(req: Request, res: Response) {
  const row = await couponsService.getById(String(req.params.id))
  if (!row) return res.status(404).json({ success: false, message: 'Kupon bulunamadı' })
  return res.json({ success: true, data: row })
}

export async function adminCreate(req: Request, res: Response) {
  try {
    const data = await couponsService.create(readBody(req))
    return res.status(201).json({ success: true, data })
  } catch (err) {
    const error = err as Error & { status?: number; publicMessage?: string }
    return res.status(error.status ?? 500).json({ success: false, message: error.publicMessage || error.message })
  }
}

export async function adminUpdate(req: Request, res: Response) {
  try {
    const data = await couponsService.update(String(req.params.id), readBody(req))
    return res.json({ success: true, data })
  } catch (err) {
    const error = err as Error & { status?: number; publicMessage?: string }
    return res.status(error.status ?? 500).json({ success: false, message: error.publicMessage || error.message })
  }
}

export async function adminArchive(req: Request, res: Response) {
  try {
    const data = await couponsService.archive(String(req.params.id))
    return res.json({ success: true, data })
  } catch (err) {
    const error = err as Error & { status?: number; publicMessage?: string }
    return res.status(error.status ?? 500).json({ success: false, message: error.publicMessage || error.message })
  }
}
