import path from 'path'

/**
 * Ödeme onayı e-postasındaki indirme bağlantılarını mutlak, tıklanabilir URL’ye çevirir.
 *
 * Önemli: `/uploads/...` dosyaları Express backend’de `public/uploads` altından servis edilir.
 * Mailde bu yollar mutlaka **BACKEND_PUBLIC_URL** ile birleştirilir; frontend kökü kullanılırsa
 * tıklanınca SPA “Route not found” JSON’u döner, ZIP inmez.
 */

function tryOrigin(candidate: string | undefined): string | null {
  const t = candidate?.trim()
  if (!t) return null
  try {
    const u = new URL(t.includes('://') ? t : `https://${t}`)
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return null
    return u.origin
  } catch {
    return null
  }
}

/** Backend’in public kökeni; localhost dahil (lokal test postası için). */
export function tryBackendOrigin(candidate: string | undefined): string | null {
  const t = candidate?.trim()
  if (!t) return null
  try {
    const u = new URL(t.includes('://') ? t : `https://${t}`)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.origin
  } catch {
    return null
  }
}

/**
 * Mail ve müşteri iletileri için backend kökeni.
 * Öncelik: BACKEND_PUBLIC_URL → API_PUBLIC_URL → RAILWAY_PUBLIC_DOMAIN
 */
export function pickBackendPublicOrigin(): string | null {
  const candidates = [
    process.env.BACKEND_PUBLIC_URL,
    process.env.API_PUBLIC_URL,
    process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN.trim()}` : undefined,
  ]
  for (const c of candidates) {
    const o = tryBackendOrigin(c)
    if (o) return o
  }
  return null
}

/** CORS_ORIGIN virgül listesindeki ilk https kökeni (localhost hariç). */
function firstHttpsOriginFromCorsList(raw: string | undefined): string | null {
  if (!raw?.trim()) return null
  for (const part of raw.split(',')) {
    const o = tryOrigin(part.trim())
    if (o?.startsWith('https:')) return o
  }
  return null
}

/**
 * Genel site (frontend) kökeni — `/uploads` dışındaki göreli yollar için.
 * BACKEND_PUBLIC_URL burada kullanılmaz (yanlış host’a düşmeyi önlemek için).
 */
export function pickPublicSiteOrigin(): string | null {
  const direct = [process.env.PUBLIC_SITE_URL, process.env.FRONTEND_URL]
  for (const raw of direct) {
    const o = tryOrigin(raw)
    if (o) return o
  }
  const corsHttps = firstHttpsOriginFromCorsList(process.env.CORS_ORIGIN)
  if (corsHttps) return corsHttps

  for (const raw of [process.env.VITE_PUBLIC_SITE_URL, process.env.FRONTEND_SUCCESS_URL]) {
    const o = tryOrigin(raw)
    if (o) return o
  }
  return null
}

function isLocalhostHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')
}

function isUploadsCatalogPath(pathname: string): boolean {
  return pathname.startsWith('/uploads/')
}

/**
 * Mailde kullanılacak tam http(s) URL veya null (saas:, boş, geçersiz, çözülemeyen).
 * Göreli `/uploads/...` için BACKEND_PUBLIC_URL zorunludur (/api eklenmez).
 */
export function resolveMailDownloadHref(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim()
  if (!t || t.startsWith('saas:')) return null

  if (t.startsWith('/')) {
    if (isUploadsCatalogPath(t)) {
      const origin = pickBackendPublicOrigin()
      if (!origin) {
        console.error(
          '[mailDeliveryUrl] /uploads download URL cannot be resolved: set BACKEND_PUBLIC_URL (public API origin, no /api suffix).',
          { raw: t },
        )
        return null
      }
      try {
        const u = new URL(t, origin)
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
        return u.href
      } catch {
        return null
      }
    }
    const origin = pickPublicSiteOrigin()
    if (!origin) {
      console.error(
        '[mailDeliveryUrl] Relative download URL cannot be resolved: no public site origin. Set PUBLIC_SITE_URL or FRONTEND_URL.',
        { raw: t },
      )
      return null
    }
    try {
      const u = new URL(t, origin)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
      if (isLocalhostHost(u.hostname)) return null
      return u.href
    } catch {
      return null
    }
  }

  try {
    const u = new URL(t)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (isUploadsCatalogPath(u.pathname)) {
      const backend = pickBackendPublicOrigin()
      if (backend) {
        const bo = new URL(backend)
        if (u.origin !== bo.origin) {
          return new URL(u.pathname + u.search + u.hash, backend).href
        }
        return u.href
      }
      console.warn(
        '[mailDeliveryUrl] Absolute /uploads URL without BACKEND_PUBLIC_URL; using stored host as-is.',
        { raw: t },
      )
      if (!isLocalhostHost(u.hostname)) return u.href
      return null
    }
    if (isLocalhostHost(u.hostname)) return null
    return u.href
  } catch {
    return null
  }
}

/** Çözülmüş mail indirme URL’si backend `/uploads/...` ise yerel `public/uploads` dosya yolu. */
export function localPublicFilePathForMailUploadsHref(resolvedHref: string): string | null {
  let pathname: string
  try {
    pathname = new URL(resolvedHref).pathname
  } catch {
    return null
  }
  if (!isUploadsCatalogPath(pathname)) return null
  const relFromMount = pathname.replace(/^\/uploads\/?/, '')
  if (!relFromMount || relFromMount.includes('..')) return null
  return path.join(process.cwd(), 'public', 'uploads', relFromMount)
}
