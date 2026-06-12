const TR_MAP: Record<string, string> = {
  ç: 'c',
  Ç: 'c',
  ğ: 'g',
  Ğ: 'g',
  ı: 'i',
  İ: 'i',
  ö: 'o',
  Ö: 'o',
  ş: 's',
  Ş: 's',
  ü: 'u',
  Ü: 'u',
}

/** Türkçe uyumlu slug; boşsa `emptyFallback` kullanılır. */
export function slugifyName(name: string, emptyFallback = 'item'): string {
  let s = name.trim().toLowerCase()
  for (const [k, v] of Object.entries(TR_MAP)) {
    s = s.split(k).join(v)
  }
  s = s
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
  return s || emptyFallback
}
