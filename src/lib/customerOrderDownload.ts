import { parseProductDownloadFiles } from './productDownloadFiles'

export type CustomerDownloadKind = 'setup' | 'portable' | 'generic'

export function resolveCustomerOrderDownloadMeta(item: {
  downloadUrl: string | null
  product?: { downloadFiles?: unknown } | null
}): {
  downloadKind: CustomerDownloadKind
  downloadLabel: string
  downloadButtonLabel: string
} {
  const config = parseProductDownloadFiles(item.product?.downloadFiles)
  const configured = config.files.filter((f) => f.url.trim())
  const setupFile = configured.find((f) => f.type === 'setup')
  const portableFile = configured.find((f) => f.type === 'portable')
  const hasSetup = Boolean(setupFile)
  const hasPortable = Boolean(portableFile)

  const url = (item.downloadUrl ?? '').toLowerCase()
  const urlSaysPortable = /portable/.test(url)

  if (hasPortable && !hasSetup) {
    return buildMeta(portableFile, 'portable')
  }
  if (hasSetup && !hasPortable) {
    return buildMeta(setupFile, 'setup')
  }
  if (hasPortable && hasSetup && urlSaysPortable) {
    return buildMeta(portableFile, 'portable')
  }
  if (hasSetup) {
    return buildMeta(setupFile, 'setup')
  }

  if (urlSaysPortable) {
    return {
      downloadKind: 'portable',
      downloadLabel: 'Portable dosya',
      downloadButtonLabel: 'Portable indir',
    }
  }
  if (/setup|install|kurulum|\.exe|\.msi/.test(url)) {
    return {
      downloadKind: 'setup',
      downloadLabel: 'Kurulum dosyası',
      downloadButtonLabel: 'Kurulum dosyasını indir',
    }
  }
  return {
    downloadKind: 'generic',
    downloadLabel: 'Dijital dosya',
    downloadButtonLabel: 'İndir',
  }
}

function buildMeta(
  file: { label: string; buttonLabel?: string } | undefined,
  kind: Exclude<CustomerDownloadKind, 'generic'>,
) {
  if (kind === 'portable') {
    return {
      downloadKind: 'portable' as const,
      downloadLabel: file?.label?.trim() || 'Portable dosya',
      downloadButtonLabel: file?.buttonLabel?.trim() || 'Portable indir',
    }
  }
  return {
    downloadKind: 'setup' as const,
    downloadLabel: file?.label?.trim() || 'Kurulum dosyası',
    downloadButtonLabel: file?.buttonLabel?.trim() || 'Kurulum dosyasını indir',
  }
}
