import path from 'path'
import { randomUUID } from 'crypto'

const TR_MAP: Record<string, string> = {
  ç: 'c',
  Ç: 'c',
  ğ: 'g',
  Ğ: 'g',
  ı: 'i',
  I: 'i',
  İ: 'i',
  i: 'i',
  ö: 'o',
  Ö: 'o',
  ş: 's',
  Ş: 's',
  ü: 'u',
  Ü: 'u',
}

/** UTF-8 metnin Latin-1 olarak yanlış okunması (mÃ¼…) için kaba onarım */
export function maybeFixMojibakeFilename(name: string): string {
  if (!name || !name.includes('Ã')) return name
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8')
    if (/[ğüşıöçĞÜŞİÖÇ]/.test(decoded) && !decoded.includes('Ã')) return decoded
  } catch {
    /* ignore */
  }
  return name
}

function transliterateTr(s: string): string {
  let out = ''
  for (const ch of s) {
    out += TR_MAP[ch] ?? ch
  }
  return out
}

/**
 * Disk + URL için ASCII güvenli dosya adı; görüntüleme için kısa orijinal ad.
 * Örnek: müvekkil kasa defteri.png → muvekkil-kasa-defteri-1730000000000-abc123def0.png
 */
export function buildSafeCatalogStorageFilename(
  originalName: string,
  extNoDot: string,
): { storageFileName: string; displayOriginalName: string } {
  const raw = maybeFixMojibakeFilename(originalName || 'dosya')
  const base = path.basename(raw, path.extname(raw))
  let slug = transliterateTr(base)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  slug = slug
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (!slug) slug = 'dosya'
  const safeExt = (extNoDot || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin'
  const stamp = Date.now()
  const short = randomUUID().replace(/-/g, '').slice(0, 10)
  const storageFileName = `${slug}-${stamp}-${short}.${safeExt}`
  const displayOriginalName = `${slug}.${safeExt}`
  return { storageFileName, displayOriginalName }
}
