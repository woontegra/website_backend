import type { Request, Response } from 'express'
import {
  bhUpstreamBinaryFetch,
  bhUpstreamFetch,
  bhUpstreamRemoteReadGet,
  type BhUpstreamMethod,
} from '../services/bhWebapi.client'
import {
  getBhAdminAuthorization,
  getBhRemoteAdminAuthorization,
} from '../services/bhAdminAuth.service'
import { isBhRemoteReadAllowed } from '../lib/assertSafeBhUpstream'

function sendUpstream(res: Response, result: Awaited<ReturnType<typeof bhUpstreamFetch>>) {
  if (result.ok) {
    return res.status(result.status).json(result.data ?? { success: true })
  }
  const payload =
    result.data && typeof result.data === 'object'
      ? result.data
      : { success: false, message: result.error }
  return res.status(result.status || 502).json(payload)
}

async function proxy(
  res: Response,
  method: BhUpstreamMethod,
  path: string,
  body?: unknown,
  timeoutMs = 30_000,
) {
  const auth = await getBhAdminAuthorization()
  if (!auth.ok) {
    return res.status(auth.status).json({ success: false, message: auth.error })
  }
  const result = await bhUpstreamFetch(method, path, body, {
    authorization: auth.authorization,
    timeoutMs,
  })
  return sendUpstream(res, result)
}

/** Local writes always; remote GET when BH_ALLOW_REMOTE_READ (campaigns/bars). */
async function proxyRemoteReadGet(res: Response, path: string, timeoutMs = 30_000) {
  if (!isBhRemoteReadAllowed()) {
    return proxy(res, 'GET', path, undefined, timeoutMs)
  }
  const auth = await getBhRemoteAdminAuthorization()
  if (!auth.ok) {
    return res.status(auth.status).json({ success: false, message: auth.error })
  }
  const result = await bhUpstreamRemoteReadGet(path, {
    authorization: auth.authorization,
    timeoutMs,
  })
  return sendUpstream(res, result)
}

/**
 * Admin GET reads: prefer remote (BH_ALLOW_REMOTE_READ) so local Admin works
 * even when localhost BH webapi is down; fall back to local BH_WEBAPI_URL.
 * Mutations continue to use `proxy()` (local-only writes).
 */
async function proxyReadGet(res: Response, path: string, timeoutMs = 30_000) {
  if (isBhRemoteReadAllowed()) {
    const auth = await getBhRemoteAdminAuthorization()
    if (auth.ok) {
      const remote = await bhUpstreamRemoteReadGet(path, {
        authorization: auth.authorization,
        timeoutMs,
      })
      if (remote.ok) {
        return sendUpstream(res, remote)
      }
      // Fall through to local (e.g. remote 404 for routes not yet deployed).
    }
  }
  return proxy(res, 'GET', path, undefined, timeoutMs)
}

function qs(req: Request): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(req.query)) {
    if (v == null) continue
    if (Array.isArray(v)) {
      for (const item of v) sp.append(k, String(item))
    } else {
      sp.set(k, String(v))
    }
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

function unwrapCampaignList(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== 'object') return []
  const body = data as {
    data?: unknown
    campaigns?: unknown
    items?: unknown
  }
  const candidates = [body.data, body.campaigns, body.items, data]
  for (const c of candidates) {
    if (Array.isArray(c)) {
      return c.filter((row) => row && typeof row === 'object') as Record<string, unknown>[]
    }
    if (c && typeof c === 'object') {
      const nested = c as { campaigns?: unknown; items?: unknown; data?: unknown }
      if (Array.isArray(nested.campaigns)) {
        return nested.campaigns.filter((row) => row && typeof row === 'object') as Record<
          string,
          unknown
        >[]
      }
      if (Array.isArray(nested.items)) {
        return nested.items.filter((row) => row && typeof row === 'object') as Record<
          string,
          unknown
        >[]
      }
      if (Array.isArray(nested.data)) {
        return nested.data.filter((row) => row && typeof row === 'object') as Record<
          string,
          unknown
        >[]
      }
    }
  }
  return []
}

function tagCampaigns(
  rows: Record<string, unknown>[],
  flags: { liveData: boolean; readOnly: boolean },
): Record<string, unknown>[] {
  return rows.map((row) => ({
    ...row,
    liveData: flags.liveData,
    readOnly: flags.readOnly,
  }))
}

/** Composed overview from BH analytics + campaign stats (dashboard parity). */
export async function getBhAdminOverview(_req: Request, res: Response) {
  type UpstreamPair = Awaited<ReturnType<typeof bhUpstreamFetch>>

  async function fetchOverviewPair(): Promise<{ analytics: UpstreamPair; campaignStats: UpstreamPair }> {
    if (isBhRemoteReadAllowed()) {
      const remoteAuth = await getBhRemoteAdminAuthorization()
      if (remoteAuth.ok) {
        const headers = { authorization: remoteAuth.authorization }
        const [analytics, campaignStats] = await Promise.all([
          bhUpstreamRemoteReadGet('/api/admin/analytics/stats?period=7', headers),
          bhUpstreamRemoteReadGet('/api/campaigns/stats', headers),
        ])
        if (analytics.ok || campaignStats.ok) {
          return { analytics, campaignStats }
        }
      }
    }

    const auth = await getBhAdminAuthorization()
    if (!auth.ok) {
      const fail: UpstreamPair = { ok: false, status: auth.status, error: auth.error }
      return { analytics: fail, campaignStats: fail }
    }
    const headers = { authorization: auth.authorization }
    const [analytics, campaignStats] = await Promise.all([
      bhUpstreamFetch('GET', '/api/admin/analytics/stats?period=7', undefined, headers),
      bhUpstreamFetch('GET', '/api/campaigns/stats', undefined, headers),
    ])
    return { analytics, campaignStats }
  }

  const { analytics, campaignStats } = await fetchOverviewPair()

  let analyticsData: unknown = null
  if (analytics.ok && analytics.data && typeof analytics.data === 'object') {
    const body = analytics.data as { data?: unknown }
    analyticsData = body.data ?? null
  }

  let campaignRows: unknown[] = []
  let campaignSummary: { totalCount?: number; activeCount?: number; totalUsage?: number } | null =
    null
  if (campaignStats.ok && campaignStats.data && typeof campaignStats.data === 'object') {
    const body = campaignStats.data as {
      data?: unknown
      summary?: { totalCount?: number; activeCount?: number; totalUsage?: number }
    }
    if (Array.isArray(body.data)) campaignRows = body.data
    if (body.summary && typeof body.summary === 'object') campaignSummary = body.summary
  }

  // Derive summary when BH returns only row list (campaigns/stats).
  if (!campaignSummary && campaignRows.length) {
    const rows = campaignRows as Array<{ isActive?: boolean; usageCount?: number }>
    campaignSummary = {
      totalCount: rows.length,
      activeCount: rows.filter((r) => r.isActive !== false).length,
      totalUsage: rows.reduce((s, r) => s + Number(r.usageCount || 0), 0),
    }
  }

  return res.json({
    success: true,
    data: {
      analytics: analyticsData,
      campaignStats: {
        summary: campaignSummary,
        rows: campaignRows,
      },
      upstreamErrors: {
        analytics: analytics.ok ? null : analytics.error,
        campaignStats: campaignStats.ok ? null : campaignStats.error,
      },
    },
  })
}

export async function getBhAdminProduct(_req: Request, res: Response) {
  return proxyReadGet(res, '/api/admin/product')
}

export async function postBhAdminProduct(req: Request, res: Response) {
  return proxy(res, 'POST', '/api/admin/product', req.body)
}

/**
 * Campaign list:
 * - Mutations always use local BH (BH_WEBAPI_URL).
 * - When BH_ALLOW_REMOTE_READ=true: GET production via HTTPS API only (no DB).
 */
export async function getBhAdminCampaigns(req: Request, res: Response) {
  const query = qs(req)

  if (!isBhRemoteReadAllowed()) {
    return proxy(res, 'GET', `/api/campaigns/admin${query}`)
  }

  const remoteAuth = await getBhRemoteAdminAuthorization()
  if (!remoteAuth.ok) {
    return res.status(remoteAuth.status).json({
      success: false,
      message: remoteAuth.error,
    })
  }

  const remoteResult = await bhUpstreamRemoteReadGet(`/api/campaigns/admin${query}`, {
    authorization: remoteAuth.authorization,
  })
  if (!remoteResult.ok) {
    return res.status(remoteResult.status || 502).json({
      success: false,
      message: remoteResult.error,
      ...(remoteResult.data && typeof remoteResult.data === 'object' ? remoteResult.data : {}),
    })
  }

  const liveRows = tagCampaigns(unwrapCampaignList(remoteResult.data), {
    liveData: true,
    readOnly: true,
  })

  let localRows: Record<string, unknown>[] = []
  const localAuth = await getBhAdminAuthorization()
  if (localAuth.ok) {
    const localResult = await bhUpstreamFetch(
      'GET',
      `/api/campaigns/admin${query}`,
      undefined,
      { authorization: localAuth.authorization },
    )
    if (localResult.ok) {
      localRows = tagCampaigns(unwrapCampaignList(localResult.data), {
        liveData: false,
        readOnly: false,
      })
    }
  }

  const liveIds = new Set(liveRows.map((r) => String(r.id || '')))
  const localOnly = localRows.filter((r) => !liveIds.has(String(r.id || '')))

  return res.json({
    success: true,
    data: [...liveRows, ...localOnly],
    meta: {
      liveCount: liveRows.length,
      localCount: localOnly.length,
      remoteRead: true,
      liveSource: 'api',
    },
  })
}

export async function getBhAdminCampaignById(req: Request, res: Response) {
  const id = encodeURIComponent(String(req.params.id || ''))
  return proxy(res, 'GET', `/api/campaigns/admin/${id}`)
}

export async function postBhAdminCampaign(req: Request, res: Response) {
  return proxy(res, 'POST', '/api/campaigns/', req.body)
}

export async function putBhAdminCampaign(req: Request, res: Response) {
  const id = encodeURIComponent(String(req.params.id || ''))
  return proxy(res, 'PUT', `/api/campaigns/admin/${id}`, req.body)
}

export async function deleteBhAdminCampaign(req: Request, res: Response) {
  const id = encodeURIComponent(String(req.params.id || ''))
  return proxy(res, 'DELETE', `/api/campaigns/admin/${id}`)
}

export async function getBhAdminBarPerformance(_req: Request, res: Response) {
  return proxyRemoteReadGet(res, '/api/campaigns/admin/bar-performance')
}

export async function getBhAdminBarPerformanceDetails(req: Request, res: Response) {
  const key = encodeURIComponent(String(req.params.barAssociationKey || ''))
  return proxyRemoteReadGet(res, `/api/campaigns/admin/bar-performance/${key}`)
}

export async function getBhAdminDemoRequests(req: Request, res: Response) {
  return proxyReadGet(res, `/api/admin/demo-requests${qs(req)}`)
}

export async function getBhAdminOrders(req: Request, res: Response) {
  return proxyReadGet(res, `/api/admin/orders${qs(req)}`)
}

export async function getBhAdminOrderDetail(req: Request, res: Response) {
  const oid = encodeURIComponent(String(req.params.merchantOid || ''))
  return proxyReadGet(res, `/api/admin/orders/${oid}`)
}

export async function getBhAdminBankTransfers(req: Request, res: Response) {
  return proxyReadGet(res, `/api/admin/bank-transfer-payments${qs(req)}`)
}

export async function getBhAdminBankTransferDetail(req: Request, res: Response) {
  const oid = encodeURIComponent(String(req.params.merchantOid || ''))
  return proxyReadGet(res, `/api/admin/bank-transfer-payments/${oid}`)
}

export async function postBhAdminBankTransferApprove(req: Request, res: Response) {
  const oid = encodeURIComponent(String(req.params.merchantOid || ''))
  return proxy(res, 'POST', `/api/admin/bank-transfer-payments/${oid}/approve`, req.body, 60_000)
}

export async function postBhAdminBankTransferReject(req: Request, res: Response) {
  const oid = encodeURIComponent(String(req.params.merchantOid || ''))
  return proxy(res, 'POST', `/api/admin/bank-transfer-payments/${oid}/reject`, req.body, 60_000)
}

export async function getBhAdminLegalArchives(req: Request, res: Response) {
  return proxyReadGet(res, `/api/admin/legal-archives${qs(req)}`)
}

export async function getBhAdminLegalArchiveDetail(req: Request, res: Response) {
  const id = encodeURIComponent(String(req.params.id || ''))
  return proxyReadGet(res, `/api/admin/legal-archives/${id}`)
}

/** Snapshot PDF for a legal archive document (never live template). */
export async function getBhAdminLegalArchiveDocumentDownload(req: Request, res: Response) {
  const docId = encodeURIComponent(String(req.params.docId || ''))
  const auth = await getBhAdminAuthorization()
  if (!auth.ok) {
    return res.status(auth.status).json({ success: false, message: auth.error })
  }
  const result = await bhUpstreamBinaryFetch(
    'GET',
    `/api/admin/legal-archives/documents/${docId}/download`,
    { authorization: auth.authorization, timeoutMs: 60_000 },
  )
  if (!result.ok) {
    return res.status(result.status || 502).json({
      success: false,
      message: result.error || 'Belge indirilemedi',
      ...(result.data && typeof result.data === 'object' ? result.data : {}),
    })
  }
  res.setHeader('Content-Type', result.contentType)
  if (result.contentDisposition) {
    res.setHeader('Content-Disposition', result.contentDisposition)
  }
  return res.status(result.status).send(result.buffer)
}

/** Bar lookup — same source as old BH admin: GET /api/campaigns/admin/bar-associations */
export async function getBhAdminBarAssociations(_req: Request, res: Response) {
  return proxyRemoteReadGet(res, '/api/campaigns/admin/bar-associations')
}
