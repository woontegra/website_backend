export type DesktopEntitlementPlatform = 'WINDOWS' | 'MACOS'

export function normalizeDesktopEntitlementPlatform(raw: unknown): DesktopEntitlementPlatform | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim().toLowerCase()
  if (!value) return null
  if (value === 'windows' || value.startsWith('win32') || value.startsWith('win64') || value.startsWith('windows')) {
    return 'WINDOWS'
  }
  if (value === 'macos' || value === 'mac' || value.startsWith('darwin') || value.startsWith('macos')) {
    return 'MACOS'
  }
  return null
}
