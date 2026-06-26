import { Request, Response } from 'express'
import {
  createLicenseProgramForAdmin,
  listLicenseProgramsForAdmin,
} from '../services/licensePrograms.service'
import { fetchLicenseServerProgram } from '../services/woontegraLicenseServer.client'
import { normalizeLicenseAppCodeInput } from '../lib/licenseAppCode'

export async function adminListLicensePrograms(req: Request, res: Response) {
  const activeOnly = req.query.activeOnly === 'true'
  const result = await listLicenseProgramsForAdmin(activeOnly)
  if (!result.configured) {
    return res.status(503).json({ success: false, error: result.error })
  }
  if (result.error) {
    return res.status(502).json({ success: false, error: result.error, data: result.programs })
  }
  return res.json({ success: true, data: result.programs })
}

export async function adminGetLicenseProgram(req: Request, res: Response) {
  const appCode = normalizeLicenseAppCodeInput(req.params.appCode)
  if (!appCode) {
    return res.status(400).json({ success: false, error: 'appCode zorunludur' })
  }
  const { program, error } = await fetchLicenseServerProgram(appCode)
  if (error?.includes('yapılandırılmamış')) {
    return res.status(503).json({ success: false, error })
  }
  if (!program) {
    return res.status(404).json({ success: false, error: 'Lisans programı lisans sunucusunda tanımlı değil.' })
  }
  return res.json({ success: true, data: program })
}

export async function adminCreateLicenseProgram(req: Request, res: Response) {
  const body = req.body as Record<string, unknown>
  const result = await createLicenseProgramForAdmin({
    appCode: String(body.appCode ?? ''),
    name: String(body.name ?? ''),
    description: body.description == null ? null : String(body.description),
    defaultLicenseDays:
      typeof body.defaultLicenseDays === 'number' ? body.defaultLicenseDays : undefined,
    defaultMaxDevices:
      typeof body.defaultMaxDevices === 'number' ? body.defaultMaxDevices : undefined,
    isActive: body.isActive !== false,
  })

  if (result.error && !result.program) {
    const status = result.status >= 400 ? result.status : 400
    return res.status(status).json({ success: false, error: result.error })
  }
  if (result.program && result.error) {
    return res.status(result.status).json({ success: true, data: result.program, warning: result.error })
  }
  if (!result.program) {
    return res.status(500).json({ success: false, error: 'Program oluşturulamadı' })
  }
  return res.status(201).json({ success: true, data: result.program })
}
