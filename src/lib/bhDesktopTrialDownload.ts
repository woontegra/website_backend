import jwt from 'jsonwebtoken'
import { getDownloadTokenSecret } from './requiredSecrets'
import { normalizeDesktopEntitlementPlatform, type DesktopEntitlementPlatform } from './desktopEntitlementPlatform'
import { isAutoUpdateDistributionUrl, isPublicWindowsSetupInstallerUrl } from './muvekkilKasaDesktopProduct'

const TOKEN_AUDIENCE = 'bh-desktop-trial-download'
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60

export type BhDesktopTrialDownloadToken = {
  grantId: string
  platform: DesktopEntitlementPlatform
}

export function selectBhDesktopInstallerUrl(
  row: Record<string, unknown> | null | undefined,
  platform: DesktopEntitlementPlatform,
): string | null {
  if (!row) return null
  const raw = platform === 'WINDOWS' ? row.windowsDownloadUrl : row.macosDownloadUrl
  if (typeof raw !== 'string') return null
  const url = raw.trim()
  if (platform === 'WINDOWS') return isPublicWindowsSetupInstallerUrl(url) ? url : null
  if (!/^https:\/\//i.test(url) || isAutoUpdateDistributionUrl(url)) return null
  return url
}

export function bhDesktopTrialDownloadPath(
  grantId: string,
  platform: DesktopEntitlementPlatform,
  row: Record<string, unknown> | null | undefined,
): string | null {
  if (!selectBhDesktopInstallerUrl(row, platform)) return null
  return `/api/downloads/bh-desktop-trial/${encodeURIComponent(
    signBhDesktopTrialDownloadToken({ grantId, platform }),
  )}`
}

export function readBhDesktopTrialDays(
  row: Record<string, unknown> | null | undefined,
  platform: DesktopEntitlementPlatform,
): number {
  const raw = platform === 'WINDOWS' ? row?.windowsTrialDays : row?.macosTrialDays
  const days = Number(raw)
  if (Number.isInteger(days) && days >= 1 && days <= 30) return days
  return 7
}

export function signBhDesktopTrialDownloadToken(payload: BhDesktopTrialDownloadToken): string {
  return jwt.sign(
    { grantId: payload.grantId, platform: payload.platform },
    getDownloadTokenSecret(),
    { audience: TOKEN_AUDIENCE, expiresIn: TOKEN_TTL_SECONDS },
  )
}

export function verifyBhDesktopTrialDownloadToken(token: string): BhDesktopTrialDownloadToken | null {
  try {
    const decoded = jwt.verify(token, getDownloadTokenSecret(), {
      audience: TOKEN_AUDIENCE,
    }) as jwt.JwtPayload
    const grantId = String(decoded.grantId ?? '').trim()
    const platform = normalizeDesktopEntitlementPlatform(decoded.platform)
    if (!grantId || !platform) return null
    return { grantId, platform }
  } catch {
    return null
  }
}
