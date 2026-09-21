import { replacePathFileName } from './imageVariantNames'
import { fileNameFromUrl, normalizeImageUrl } from './imageBackfill.classify'

export function urlPathname(url: string): string {
  const value = normalizeImageUrl(url)
  if (/^https?:\/\//i.test(value)) {
    try {
      return new URL(value).pathname.replace(/^\/+/, '')
    } catch {
      return value.replace(/^https?:\/\/[^/]+\//i, '')
    }
  }
  return value.replace(/^\/+/, '')
}

export function siblingObjectKey(originalUrl: string, newFileName: string): string {
  return replacePathFileName(urlPathname(originalUrl), newFileName)
}

export function blobPathnameFromUrl(originalUrl: string, newFileName: string): string {
  const path = urlPathname(originalUrl)
  const website = path.includes('website-media/') ? path.slice(path.indexOf('website-media/')) : `website-media/backfill/${path}`
  return replacePathFileName(website, newFileName)
}

export function staticRelativePath(originalUrl: string, newFileName: string): string {
  const path = urlPathname(originalUrl)
  const images = path.startsWith('images/') ? path : `images/${fileNameFromUrl(originalUrl)}`
  return replacePathFileName(images, newFileName)
}

export function urlAliases(url: string, siteBase = 'https://www.woontegra.com'): string[] {
  const raw = normalizeImageUrl(url)
  if (!raw) return []
  const aliases = new Set<string>([raw])
  const site = siteBase.replace(/\/+$/, '')
  if (raw.startsWith('/')) {
    aliases.add(`${site}${raw}`)
    aliases.add(`https://woontegra.com${raw}`)
  }
  if (/^https?:\/\/(www\.)?woontegra\.com\//i.test(raw)) {
    aliases.add(raw.replace(/^https?:\/\/(www\.)?woontegra\.com/i, ''))
  }
  return [...aliases]
}

export function replaceExactUrlsInText(text: string, aliases: string[], next: string): { text: string; count: number } {
  let nextText = text
  let count = 0
  const sorted = [...aliases].sort((a, b) => b.length - a.length)
  for (const alias of sorted) {
    if (!alias || alias === next) continue
    let index = nextText.indexOf(alias)
    while (index !== -1) {
      nextText = `${nextText.slice(0, index)}${next}${nextText.slice(index + alias.length)}`
      count += 1
      index = nextText.indexOf(alias, index + next.length)
    }
  }
  return { text: nextText, count }
}

export function replaceExactUrlsInValue(
  value: unknown,
  aliases: string[],
  next: string,
): { value: unknown; count: number } {
  if (typeof value === 'string') {
    if (aliases.includes(normalizeImageUrl(value)) || aliases.includes(value)) {
      return { value: next, count: 1 }
    }
    const replaced = replaceExactUrlsInText(value, aliases, next)
    return { value: replaced.text, count: replaced.count }
  }
  if (Array.isArray(value)) {
    let count = 0
    const items = value.map((item) => {
      const replaced = replaceExactUrlsInValue(item, aliases, next)
      count += replaced.count
      return replaced.value
    })
    return { value: items, count }
  }
  if (!value || typeof value !== 'object') return { value, count: 0 }
  let count = 0
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    const replaced = replaceExactUrlsInValue(child, aliases, next)
    out[key] = replaced.value
    count += replaced.count
  }
  return { value: out, count }
}
