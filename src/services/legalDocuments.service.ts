import { LegalDocumentType, Prisma } from '@prisma/client'
import { getDefaultLegalDocument } from '../data/defaultLegalContents'
import { buildSellerVars, escapeHtml } from '../lib/legalSeller'
import { prisma } from '../lib/prisma'
import { renderLegalTemplate } from './legalTemplate.service'

export type LegalDocumentDto = {
  id: string
  type: LegalDocumentType
  title: string
  content: string
  version: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

function mapDoc(d: { id: string; type: LegalDocumentType; title: string; content: string; version: number; isActive: boolean; createdAt: Date; updatedAt: Date }): LegalDocumentDto {
  return {
    id: d.id,
    type: d.type,
    title: d.title,
    content: d.content,
    version: d.version,
    isActive: d.isActive,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }
}

export const legalDocumentsService = {
  async listPublicActive() {
    const rows = await prisma.legalDocument.findMany({
      where: { isActive: true },
      orderBy: [{ type: 'asc' }, { version: 'desc' }],
    })
    const seen = new Set<string>()
    const out: typeof rows = []
    for (const r of rows) {
      if (seen.has(r.type)) continue
      seen.add(r.type)
      out.push(r)
    }
    return out.map((d) => ({ type: d.type, title: d.title, version: d.version }))
  },

  async getPublicByType(type: LegalDocumentType) {
    const doc = await prisma.legalDocument.findFirst({
      where: { type, isActive: true },
      orderBy: { updatedAt: 'desc' },
    })
    return doc ? { type: doc.type, title: doc.title, content: doc.content, version: doc.version } : null
  },

  async listAdmin() {
    const rows = await prisma.legalDocument.findMany({ orderBy: [{ type: 'asc' }, { updatedAt: 'desc' }] })
    return rows.map(mapDoc)
  },

  async getAdminById(id: string) {
    const d = await prisma.legalDocument.findUnique({ where: { id } })
    return d ? mapDoc(d) : null
  },

  async createAdmin(data: { type: LegalDocumentType; title: string; content: string; version?: number; isActive?: boolean }) {
    const row = await prisma.legalDocument.create({
      data: {
        type: data.type,
        title: data.title.trim(),
        content: data.content,
        version: typeof data.version === 'number' && data.version > 0 ? data.version : 1,
        isActive: data.isActive !== false,
      },
    })
    return mapDoc(row)
  },

  async patchAdmin(id: string, data: Partial<{ title: string; content: string; version: number; isActive: boolean }>) {
    const patch: Prisma.LegalDocumentUpdateInput = {}
    if (data.title !== undefined) patch.title = data.title.trim()
    if (data.content !== undefined) patch.content = data.content
    if (data.version !== undefined) patch.version = data.version
    if (data.isActive !== undefined) patch.isActive = data.isActive
    const row = await prisma.legalDocument.update({ where: { id }, data: patch })
    return mapDoc(row)
  },

  async deactivateAdmin(id: string) {
    await prisma.legalDocument.update({ where: { id }, data: { isActive: false } })
  },

  /** Checkout önizlemesi: aktif belge + değişkenlerle render; ham {{}} kalmaz. */
  async getRenderedPreview(type: LegalDocumentType, variables: Record<string, unknown>) {
    const seller = buildSellerVars()
    const sellerEscaped: Record<string, string> = Object.fromEntries(
      Object.entries(seller).map(([k, v]) => [k, escapeHtml(v)]),
    )
    const client = sanitizePreviewVariables(variables)
    const merged: Record<string, string> = { ...client, ...sellerEscaped }

    const doc = await prisma.legalDocument.findFirst({
      where: { type, isActive: true },
      orderBy: { updatedAt: 'desc' },
    })

    const useDefault = !doc?.content?.trim()
    if (useDefault && doc?.title) {
      console.warn(`[legal] Active ${type} document has empty content; using built-in default body.`)
    }

    const fallback = getDefaultLegalDocument(type)
    const base = useDefault
      ? { title: doc?.title?.trim() ? doc!.title : fallback.title, content: fallback.content }
      : { title: doc!.title, content: doc!.content }
    const version = doc?.version ?? 0

    return {
      type,
      title: base.title,
      content: renderLegalTemplate(base.content, merged),
      version,
    }
  },
}

function sanitizeProductListHtml(html: string): string {
  const s = html.slice(0, 200_000)
  if (/<\s*script/i.test(s) || /\son\w+\s*=/i.test(s) || /<iframe/i.test(s)) {
    return '<p>Ürün listesi güvenlik denetiminden geçemedi.</p>'
  }
  return s
}

function sanitizePreviewVariables(variables: unknown): Record<string, string> {
  if (!variables || typeof variables !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(variables as Record<string, unknown>)) {
    if (typeof v !== 'string') continue
    if (k.startsWith('seller')) continue
    const raw = v.slice(0, 50_000)
    out[k] = k === 'productList' ? sanitizeProductListHtml(raw) : escapeHtml(raw)
  }
  return out
}
