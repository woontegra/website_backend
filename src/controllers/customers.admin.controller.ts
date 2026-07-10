import { Request, Response } from 'express'
import { customersAdminService } from '../services/customers.admin.service'

function readQueryString(q: Request['query'], key: string): string | undefined {
  const v = q[key]
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  return s === '' ? undefined : s
}

export async function adminListCustomers(req: Request, res: Response) {
  try {
    const q = readQueryString(req.query, 'q')
    const filter = readQueryString(req.query, 'filter')
    const takeRaw = readQueryString(req.query, 'take')
    const skipRaw = readQueryString(req.query, 'skip')
    const take = takeRaw ? Number.parseInt(takeRaw, 10) : undefined
    const skip = skipRaw ? Number.parseInt(skipRaw, 10) : undefined
    const data = await customersAdminService.list({
      q,
      filter,
      take: Number.isFinite(take) ? take : undefined,
      skip: Number.isFinite(skip) ? skip : undefined,
    })
    return res.json({ success: true, data })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ success: false, message: 'Müşteriler yüklenemedi' })
  }
}

export async function adminGetCustomer(req: Request, res: Response) {
  try {
    const id = String(req.params.id ?? '').trim()
    if (!id) return res.status(400).json({ success: false, message: 'Geçersiz id' })
    const data = await customersAdminService.getById(id)
    if (!data) return res.status(404).json({ success: false, message: 'Müşteri bulunamadı' })
    return res.json({ success: true, data })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ success: false, message: 'Müşteri detayı yüklenemedi' })
  }
}

export async function adminCustomerSummary(_req: Request, res: Response) {
  try {
    const data = await customersAdminService.getSummary()
    return res.json({ success: true, data })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ success: false, message: 'Müşteri özeti yüklenemedi' })
  }
}

function readBodyString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key]
  if (value == null) return undefined
  const text = String(value).trim()
  return text || undefined
}

function readBodyNullableString(body: Record<string, unknown>, key: string): string | null | undefined {
  if (!(key in body)) return undefined
  const value = body[key]
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

function readBodyBool(body: Record<string, unknown>, key: string): boolean | undefined {
  if (!(key in body)) return undefined
  const value = body[key]
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

export async function adminPatchCustomer(req: Request, res: Response) {
  const id = String(req.params.id ?? '').trim()
  if (!id) return res.status(400).json({ success: false, message: 'Geçersiz id' })
  const body = req.body as Record<string, unknown>
  const defaultAddressRaw = body.defaultAddress
  const defaultAddress =
    defaultAddressRaw && typeof defaultAddressRaw === 'object'
      ? {
          fullName: readBodyString(defaultAddressRaw as Record<string, unknown>, 'fullName'),
          phone: readBodyNullableString(defaultAddressRaw as Record<string, unknown>, 'phone'),
          city: readBodyString(defaultAddressRaw as Record<string, unknown>, 'city'),
          district: readBodyNullableString(defaultAddressRaw as Record<string, unknown>, 'district'),
          addressLine: readBodyString(defaultAddressRaw as Record<string, unknown>, 'addressLine'),
          postalCode: readBodyNullableString(defaultAddressRaw as Record<string, unknown>, 'postalCode'),
          companyName: readBodyNullableString(defaultAddressRaw as Record<string, unknown>, 'companyName'),
          taxOffice: readBodyNullableString(defaultAddressRaw as Record<string, unknown>, 'taxOffice'),
          taxNumber: readBodyNullableString(defaultAddressRaw as Record<string, unknown>, 'taxNumber'),
        }
      : undefined

  try {
    const data = await customersAdminService.update(id, {
      name: readBodyString(body, 'name'),
      phone: readBodyNullableString(body, 'phone'),
      isActive: readBodyBool(body, 'isActive'),
      defaultAddress,
    })
    return res.json({ success: true, data })
  } catch (e) {
    const err = e as Error & { status?: number }
    return res.status(err.status ?? 500).json({ success: false, message: err.message || 'Müşteri güncellenemedi' })
  }
}

export async function adminPatchCustomerStatus(req: Request, res: Response) {
  const id = String(req.params.id ?? '').trim()
  if (!id) return res.status(400).json({ success: false, message: 'Geçersiz id' })
  const body = req.body as Record<string, unknown>
  const isActive = readBodyBool(body, 'isActive')
  if (isActive === undefined) {
    return res.status(400).json({ success: false, message: 'isActive alanı zorunludur' })
  }
  try {
    const data = await customersAdminService.patchStatus(id, isActive)
    return res.json({ success: true, data })
  } catch (e) {
    const err = e as Error & { status?: number }
    return res.status(err.status ?? 500).json({ success: false, message: err.message || 'Müşteri durumu güncellenemedi' })
  }
}

export async function adminDeleteCustomer(req: Request, res: Response) {
  const id = String(req.params.id ?? '').trim()
  if (!id) return res.status(400).json({ success: false, message: 'Geçersiz id' })
  try {
    const data = await customersAdminService.delete(id)
    return res.json({ success: true, data })
  } catch (e) {
    const err = e as Error & { status?: number }
    return res.status(err.status ?? 500).json({ success: false, message: err.message || 'Müşteri silinemedi' })
  }
}
