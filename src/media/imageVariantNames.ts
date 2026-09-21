export type OptimizedImageFormat = 'jpeg' | 'webp' | 'avif' | 'png'

export type OptimizedVariantMarker = 'opt' | 'optavif'

export const OPTIMIZED_FILE_RE = /^(.+)\.(optavif|opt)-w(\d+)\.(jpe?g|png|webp|avif)$/i

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
}

export function extensionForFormat(format: OptimizedImageFormat): 'jpg' | 'png' | 'webp' | 'avif' {
  if (format === 'jpeg') return 'jpg'
  return format
}

export function mimeForFormat(format: OptimizedImageFormat): string {
  return MIME_BY_EXT[extensionForFormat(format)]
}

export function variantMarkerForFormats(hasAvif: boolean): OptimizedVariantMarker {
  return hasAvif ? 'optavif' : 'opt'
}

export function buildOptimizedFileName(
  stem: string,
  width: number,
  format: OptimizedImageFormat,
  marker: OptimizedVariantMarker = 'opt',
): string {
  return `${stem}.${marker}-w${width}.${extensionForFormat(format)}`
}

export function parseOptimizedFileName(fileName: string): {
  stem: string
  marker: OptimizedVariantMarker
  width: number
  ext: string
  hasAvif: boolean
  hasWebp: boolean
} | null {
  const base = fileName.replace(/\\/g, '/').split('/').pop() || fileName
  const match = base.match(OPTIMIZED_FILE_RE)
  if (!match) return null
  const marker = match[2].toLowerCase() as OptimizedVariantMarker
  return {
    stem: match[1],
    marker,
    width: Number(match[3]),
    ext: match[4].toLowerCase(),
    hasAvif: marker === 'optavif',
    hasWebp: true,
  }
}

export function isOptimizedFileName(fileName: string): boolean {
  return parseOptimizedFileName(fileName) !== null
}

export function listOptimizedSiblingNames(
  fileName: string,
  widths: number[],
  formats: OptimizedImageFormat[],
): string[] {
  const parsed = parseOptimizedFileName(fileName)
  if (!parsed) return []
  const names = new Set<string>()
  const allowed = formats.filter((format) => format !== 'avif' || parsed.hasAvif)
  for (const width of widths) {
    if (width > parsed.width) continue
    for (const format of allowed) {
      names.add(buildOptimizedFileName(parsed.stem, width, format, parsed.marker))
    }
  }
  return [...names]
}

export function replacePathFileName(pathOrUrl: string, fileName: string): string {
  const hashIndex = pathOrUrl.indexOf('#')
  const hash = hashIndex >= 0 ? pathOrUrl.slice(hashIndex) : ''
  const withoutHash = hashIndex >= 0 ? pathOrUrl.slice(0, hashIndex) : pathOrUrl
  const queryIndex = withoutHash.indexOf('?')
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex) : ''
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash
  const slash = pathname.lastIndexOf('/')
  if (slash === -1) return `${fileName}${query}${hash}`
  return `${pathname.slice(0, slash + 1)}${fileName}${query}${hash}`
}

export function requireUploadedCanonical(
  uploaded: Map<string, { url: string; pathname?: string }>,
  canonicalFileName: string,
): { url: string; pathname?: string } {
  const row = uploaded.get(canonicalFileName)
  if (!row?.url?.trim()) {
    throw new Error('Optimize edilmiş canonical görsel yüklenemedi.')
  }
  return row
}
