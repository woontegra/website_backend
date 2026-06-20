import { Request, Response } from 'express'
import { activateLicenseForDevice, validateLicenseForDevice } from '../services/license.service'

function readString(body: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = body[key]
    if (v === undefined || v === null) continue
    const s = String(v).trim()
    if (s) return s
  }
  return ''
}

export async function postLicenseActivate(req: Request, res: Response) {
  const body = req.body as Record<string, unknown>
  const licenseKey = readString(body, 'licenseKey')
  const activationPassword = readString(body, 'activationPassword', 'password')
  const customerEmail = readString(body, 'customerEmail', 'userEmail')
  const deviceHash = readString(body, 'deviceHash')
  const appCode = readString(body, 'appCode')
  const deviceName = readString(body, 'deviceName') || null
  const platform = readString(body, 'platform') || null
  const appVersion = readString(body, 'appVersion') || null

  try {
    const out = await activateLicenseForDevice({
      licenseKey,
      activationPassword: activationPassword || null,
      customerEmail: customerEmail || null,
      deviceHash,
      appCode: appCode || null,
      deviceName,
      platform,
      appVersion,
    })
    if (!out.ok) {
      return res.status(400).json(out)
    }
    return res.json(out)
  } catch (e) {
    console.error('[license] activate', e)
    return res.status(500).json({
      ok: false,
      message: 'İşlem şu an tamamlanamadı. Lütfen daha sonra tekrar deneyin.',
    })
  }
}

export async function postLicenseValidate(req: Request, res: Response) {
  const body = req.body as Record<string, unknown>
  const licenseKey = readString(body, 'licenseKey')
  const deviceHash = readString(body, 'deviceHash')
  const appCode = readString(body, 'appCode')
  const appVersion = readString(body, 'appVersion') || null

  try {
    const out = await validateLicenseForDevice({
      licenseKey,
      deviceHash,
      appCode: appCode || null,
      appVersion,
    })
    if (!out.ok) {
      return res.status(400).json(out)
    }
    return res.json(out)
  } catch (e) {
    console.error('[license] validate', e)
    return res.status(500).json({
      ok: false,
      message: 'İşlem şu an tamamlanamadı. Lütfen daha sonra tekrar deneyin.',
    })
  }
}
