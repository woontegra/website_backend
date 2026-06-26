import { Request, Response } from 'express'
import {
  classifyFreeDownloadAccess,
  headFreeProductObject,
  parseFreeDownloadVariant,
  streamFreeProductDownload,
} from '../services/freeProductDownload.service'
import { metaConversionsService } from '../services/metaConversions.service'

function denyStatus(access: { kind: 'not_found' } | { kind: 'forbidden' }): number {
  return access.kind === 'forbidden' ? 403 : 404
}

export async function headFreeProductDownload(req: Request, res: Response) {
  const slug = String(req.params.productSlug ?? '').trim()
  const variant = parseFreeDownloadVariant(String(req.params.fileType ?? ''))
  if (!slug || !variant) {
    return res.status(404).end()
  }

  try {
    const access = await classifyFreeDownloadAccess(slug, variant)
    if (access.kind !== 'ok') {
      return res.status(denyStatus(access)).end()
    }

    const meta = await headFreeProductObject(access.resolved)
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${access.resolved.filename}"`)
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.setHeader('Content-Length', String(meta.size))
    return res.status(200).end()
  } catch (e) {
    console.error('[downloads] free product HEAD failed', { slug, variant, error: e })
    return res.status(500).end()
  }
}

export async function getFreeProductDownload(req: Request, res: Response) {
  const slug = String(req.params.productSlug ?? '').trim()
  const variant = parseFreeDownloadVariant(String(req.params.fileType ?? ''))
  if (!slug || !variant) {
    return res.status(404).json({ success: false, message: 'İndirme dosyası bulunamadı' })
  }

  try {
    const access = await classifyFreeDownloadAccess(slug, variant)
    if (access.kind !== 'ok') {
      const status = denyStatus(access)
      return res.status(status).json({
        success: false,
        message: status === 403 ? 'Bu ürün için ücretsiz indirme kullanılamaz' : 'Ücretsiz indirme dosyası bulunamadı',
      })
    }

    if (!req.headers.range) {
      void metaConversionsService.sendDownloadEvent(req, variant)
    }
    await streamFreeProductDownload(access.resolved, req, res)
  } catch (e) {
    console.error('[downloads] free product stream failed', { slug, variant, error: e })
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Dosya indirilemedi. Lütfen tekrar deneyin.' })
    }
  }
}
