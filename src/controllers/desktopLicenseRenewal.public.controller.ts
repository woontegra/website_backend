import type { Request, Response, NextFunction } from 'express'
import {
  bindDesktopLicenseRenewalToken,
  issueDesktopLicenseRenewalLink,
  previewDesktopLicenseRenewal,
  resolveDesktopLicenseRenewalToken,
} from '../services/desktopLicenseRenewal.service'

function publicMessageForCode(code: string): string {
  switch (code) {
    case 'LICENSE_RENEWAL_NOT_ELIGIBLE':
      return 'Bu lisans yenileme için uygun değil. Lisansı Kontrol Et ile doğrulayın.'
    case 'LICENSE_RENEWAL_UNSUPPORTED_PRODUCT':
      return 'Bu ürün için yenileme desteklenmiyor.'
    default:
      return 'Lisans yenileme bağlantısı oluşturulamadı.'
  }
}

export async function postDesktopLicenseRenewalLink(req: Request, res: Response, next: NextFunction) {
  try {
    const licenseKey = typeof req.body?.licenseKey === 'string' ? req.body.licenseKey : ''
    const deviceHash = typeof req.body?.deviceHash === 'string' ? req.body.deviceHash : ''
    const appCode = typeof req.body?.appCode === 'string' ? req.body.appCode : ''
    const result = await issueDesktopLicenseRenewalLink({ licenseKey, deviceHash, appCode })
    res.json({ ok: true, ...result })
  } catch (e) {
    const code = e instanceof Error ? e.message : 'LICENSE_RENEWAL_INVALID'
    if (code.startsWith('LICENSE_RENEWAL_')) {
      res.status(403).json({ ok: false, message: publicMessageForCode(code), code })
      return
    }
    next(e)
  }
}

export async function postDesktopLicenseRenewalResolve(req: Request, res: Response, next: NextFunction) {
  try {
    const renewalToken = typeof req.body?.renewalToken === 'string' ? req.body.renewalToken.trim() : ''
    if (!renewalToken) {
      res.status(400).json({ ok: false, message: 'renewalToken zorunludur.' })
      return
    }
    const data = await resolveDesktopLicenseRenewalToken(renewalToken)
    res.json({ ok: true, ...data })
  } catch {
    res.status(410).json({ ok: false, message: 'Yenileme bağlantısı geçersiz veya süresi dolmuş.' })
  }
}

export async function postDesktopLicenseRenewalPreview(req: Request, res: Response, next: NextFunction) {
  try {
    const renewalToken = typeof req.body?.renewalToken === 'string' ? req.body.renewalToken.trim() : ''
    const renewalDays = Number(req.body?.renewalDays)
    if (!renewalToken || !Number.isFinite(renewalDays)) {
      res.status(400).json({ ok: false, message: 'renewalToken ve renewalDays zorunludur.' })
      return
    }
    const data = await previewDesktopLicenseRenewal({ renewalToken, renewalDays })
    res.json({ ok: true, ...data })
  } catch {
    res.status(410).json({ ok: false, message: 'Yenileme bağlantısı geçersiz veya süresi dolmuş.' })
  }
}

export { bindDesktopLicenseRenewalToken }
