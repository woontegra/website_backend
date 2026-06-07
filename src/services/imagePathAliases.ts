/** Panel/veritabanındaki bilinen hatalı path → public/images gerçek dosya */
const IMAGE_PATH_ALIASES: Record<string, string> = {
  '/images/about-hero.jpg': '/images/about-hero.png',
  '/images/blog/default.jpg': '/images/blog/varsayilan.jpg',
  '/images/e-ticaret.png': '/images/e-ticaret.jpeg',
  '/images/e-ticaret.jpg': '/images/e-ticaret-sistemi.jpg',
  '/images/web-tasarim.jpg': '/images/web-tasarim-mockup.jpg',
}

export function normalizePublicImagePath(url?: string | null): string {
  if (!url) return ''
  const trimmed = url.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('/uploads/')) return ''

  const lower = trimmed.toLowerCase()
  return IMAGE_PATH_ALIASES[lower] ?? IMAGE_PATH_ALIASES[trimmed] ?? trimmed
}
