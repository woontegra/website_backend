import { Request, Response } from 'express'
import {
  testDataCleanupAdminService,
  type TestDataCleanupOptions,
} from '../services/testDataCleanup.admin.service'

function readQueryEmail(req: Request): string {
  const raw = req.query.email
  return typeof raw === 'string' ? raw.trim() : ''
}

function readBodyString(body: unknown, key: string): string {
  if (!body || typeof body !== 'object') return ''
  const value = (body as Record<string, unknown>)[key]
  return typeof value === 'string' ? value.trim() : ''
}

function readCleanupOptions(body: unknown): TestDataCleanupOptions {
  const options =
    body && typeof body === 'object' && 'options' in body && typeof (body as { options: unknown }).options === 'object'
      ? ((body as { options: Record<string, unknown> }).options ?? {})
      : {}
  return {
    deleteOrders: options.deleteOrders === true,
    deletePayments: options.deletePayments === true,
    deleteSaasMemberships: options.deleteSaasMemberships === true,
    deleteWebsiteLicenses: options.deleteWebsiteLicenses === true,
    deleteCustomer: options.deleteCustomer === true,
    deleteUserAccount: options.deleteUserAccount === true,
    deleteContactMessages: options.deleteContactMessages === true,
  }
}

export async function adminPreviewTestDataCleanup(req: Request, res: Response) {
  try {
    const email = readQueryEmail(req)
    if (!email) return res.status(400).json({ success: false, message: 'E-posta gerekli' })
    const data = await testDataCleanupAdminService.preview(email)
    return res.json({ success: true, data })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Önizleme yüklenemedi'
    const status = message.includes('Geçerli') ? 400 : 500
    if (status === 500) console.error(e)
    return res.status(status).json({ success: false, message })
  }
}

export async function adminExecuteTestDataCleanup(req: Request, res: Response) {
  try {
    const email = readBodyString(req.body, 'email')
    const confirmEmail = readBodyString(req.body, 'confirmEmail')
    const options = readCleanupOptions(req.body)
    const forceRealEmailCleanup =
      req.body && typeof req.body === 'object' && (req.body as { forceRealEmailCleanup?: unknown }).forceRealEmailCleanup === true

    if (!email) return res.status(400).json({ success: false, message: 'E-posta gerekli' })

    const data = await testDataCleanupAdminService.cleanup({
      email,
      confirmEmail,
      options,
      forceRealEmailCleanup,
    })
    return res.json({ success: true, data })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Temizlik başarısız'
    const isClient =
      message.includes('eşleşmiyor') ||
      message.includes('seçenek') ||
      message.includes('Geçerli') ||
      message.includes('onay') ||
      message.includes('PayTR') ||
      message.includes('silinemedi')
    const status = isClient ? 400 : 500
    if (status === 500) console.error(e)
    return res.status(status).json({ success: false, message })
  }
}
