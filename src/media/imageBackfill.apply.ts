import { prepareCatalogImageForStorage } from './prepareCatalogImage'
import { replacePathFileName } from './imageVariantNames'
import { stemFromUrl } from './imageBackfill.classify'
import { staticRelativePath } from './imageBackfill.urls'
import type {
  ImageBackfillApplyPort,
  ImageBackfillApplyResult,
  ImageBackfillItem,
  PreparedVariantFile,
} from './imageBackfill.types'

export async function prepareApplyFiles(input: {
  url: string
  mime: string
  buffer: Buffer
}): Promise<
  | {
      canonicalFileName: string
      proposedCanonicalUrl: string
      files: PreparedVariantFile[]
    }
  | { skip: 'gif-animated' | 'not-raster' | 'transform-failed' }
> {
  try {
    const prepared = await prepareCatalogImageForStorage(
      { mimetype: input.mime, buffer: input.buffer },
      stemFromUrl(input.url),
    )
    if (prepared.mode === 'passthrough') {
      return { skip: input.mime === 'image/gif' ? 'gif-animated' : 'not-raster' }
    }
    return {
      canonicalFileName: prepared.set.canonical.fileName,
      proposedCanonicalUrl: replacePathFileName(input.url, prepared.set.canonical.fileName),
      files: prepared.set.files.map((file) => ({
        fileName: file.fileName,
        mimeType: file.mimeType,
        buffer: file.buffer,
        bytes: file.fileSize,
      })),
    }
  } catch {
    return { skip: 'transform-failed' }
  }
}

export async function applyOptimizedAsset(input: {
  item: ImageBackfillItem
  buffer: Buffer
  mime: string
  port: ImageBackfillApplyPort
  updateCms: boolean
}): Promise<ImageBackfillApplyResult> {
  const prepared = await prepareApplyFiles({
    url: input.item.url,
    mime: input.mime,
    buffer: input.buffer,
  })
  if ('skip' in prepared) {
    return {
      status: 'skipped',
      newCanonicalUrl: null,
      variantUrls: [],
      orphanVariantUrls: [],
      cmsUpdated: false,
      cmsLocations: [],
      error: prepared.skip,
    }
  }

  if (input.item.source === 'frontend-static') {
    const staticFiles = prepared.files.map((file) => ({
      relativePath: staticRelativePath(input.item.url, file.fileName),
      buffer: file.buffer,
    }))
    const written = await input.port.writeStaticFiles(staticFiles)
    const canonicalRel = staticRelativePath(input.item.url, prepared.canonicalFileName)
    const canonicalUrl = `/${canonicalRel.replace(/^\/+/, '')}`
    if (input.port.replaceFrontendRefs) {
      await input.port.replaceFrontendRefs(input.item.url, canonicalUrl)
    }
    return {
      status: 'static-written',
      newCanonicalUrl: canonicalUrl,
      variantUrls: written,
      orphanVariantUrls: [],
      cmsUpdated: false,
      cmsLocations: [],
    }
  }

  let uploaded: { fileName: string; url: string }[] = []
  try {
    const result = await input.port.uploadVariants({
      source: input.item.source,
      originalUrl: input.item.url,
      files: prepared.files,
      canonicalFileName: prepared.canonicalFileName,
    })
    uploaded = result.uploaded
    const canonical = uploaded.find((file) => file.fileName === prepared.canonicalFileName)
    if (!canonical?.url) {
      return {
        status: 'failed-upload',
        newCanonicalUrl: null,
        variantUrls: uploaded.map((file) => file.url),
        orphanVariantUrls: uploaded.map((file) => file.url),
        cmsUpdated: false,
        cmsLocations: [],
        error: 'canonical upload missing',
      }
    }

    if (!input.updateCms) {
      return {
        status: 'success',
        newCanonicalUrl: canonical.url,
        variantUrls: uploaded.map((file) => file.url),
        orphanVariantUrls: [],
        cmsUpdated: false,
        cmsLocations: [],
      }
    }

    try {
      const cms = await input.port.replaceCmsUrls(input.item.url, canonical.url)
      return {
        status: 'success',
        newCanonicalUrl: canonical.url,
        variantUrls: uploaded.map((file) => file.url),
        orphanVariantUrls: [],
        cmsUpdated: cms.updated > 0,
        cmsLocations: cms.locations,
      }
    } catch (error) {
      return {
        status: 'failed-cms',
        newCanonicalUrl: canonical.url,
        variantUrls: uploaded.map((file) => file.url),
        orphanVariantUrls: uploaded.map((file) => file.url),
        cmsUpdated: false,
        cmsLocations: [],
        error: error instanceof Error ? error.message : String(error),
      }
    }
  } catch (error) {
    return {
      status: 'failed-upload',
      newCanonicalUrl: null,
      variantUrls: uploaded.map((file) => file.url),
      orphanVariantUrls: uploaded.map((file) => file.url),
      cmsUpdated: false,
      cmsLocations: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
