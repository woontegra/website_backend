const PAGE_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/

export function normalizeBuilderPageKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const pageKey = raw.trim()
  if (!PAGE_KEY_PATTERN.test(pageKey)) return null
  return pageKey
}

export function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** API body'sinden JSON nesnesi çıkarır. Geçersiz giriş için null. */
export function parseBuilderContentInput(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return null
    try {
      const parsed: unknown = JSON.parse(trimmed)
      return isPlainJsonObject(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  if (isPlainJsonObject(raw)) return raw
  return null
}

export function parseStoredJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    return isPlainJsonObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function serializeBuilderContent(content: Record<string, unknown>): string {
  return JSON.stringify(content)
}

export function builderContentsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
