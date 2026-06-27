import { Request, Response } from 'express'
import { customersService } from '../services/customers.service'

function readString(body: Record<string, unknown>, key: string): string | undefined {
  const v = body[key]
  if (v === undefined || v === null) return undefined
  return String(v).trim()
}

export async function register(req: Request, res: Response) {
  const body = req.body as Record<string, unknown>
  const name = readString(body, 'name')
  const email = readString(body, 'email')
  const password = readString(body, 'password')
  const phone = readString(body, 'phone')
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'name, email ve password zorunludur' })
  }
  try {
    const data = await customersService.register({ name, email, password, phone: phone || null })
    return res.status(201).json({ success: true, data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Kayıt başarısız'
    const code = msg.includes('zaten') ? 409 : 400
    return res.status(code).json({ success: false, message: msg })
  }
}

export async function login(req: Request, res: Response) {
  const body = req.body as Record<string, unknown>
  const email = readString(body, 'email')
  const password = readString(body, 'password')
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'email ve password zorunludur' })
  }
  try {
    const data = await customersService.login(email, password)
    return res.json({ success: true, data })
  } catch {
    return res.status(401).json({ success: false, message: 'E-posta veya şifre hatalı' })
  }
}

export async function logout(_req: Request, res: Response) {
  return res.json({ success: true, message: 'Oturumu cihazınızdan kapatın (token silinir).' })
}

export async function me(req: Request, res: Response) {
  if (!req.customer) return res.status(401).json({ success: false, message: 'Giriş gerekli' })
  try {
    const data = await customersService.getMe(req.customer.id)
    return res.json({ success: true, data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Hata'
    return res.status(404).json({ success: false, message: msg })
  }
}

export async function patchMe(req: Request, res: Response) {
  if (!req.customer) return res.status(401).json({ success: false, message: 'Giriş gerekli' })
  const body = req.body as Record<string, unknown>
  try {
    const data = await customersService.patchMe(req.customer.id, {
      name: readString(body, 'name'),
      phone: body.phone === null ? null : readString(body, 'phone'),
      email: readString(body, 'email'),
      currentPassword: readString(body, 'currentPassword'),
    })
    return res.json({ success: true, data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Güncellenemedi'
    return res.status(400).json({ success: false, message: msg })
  }
}

export async function patchPassword(req: Request, res: Response) {
  if (!req.customer) return res.status(401).json({ success: false, message: 'Giriş gerekli' })
  const body = req.body as Record<string, unknown>
  const currentPassword = readString(body, 'currentPassword')
  const newPassword = readString(body, 'newPassword')
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'currentPassword ve newPassword zorunludur' })
  }
  try {
    await customersService.changePassword(req.customer.id, currentPassword, newPassword)
    return res.json({ success: true, message: 'Şifre güncellendi' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Hata'
    return res.status(400).json({ success: false, message: msg })
  }
}

export async function listAddresses(req: Request, res: Response) {
  if (!req.customer) return res.status(401).json({ success: false, message: 'Giriş gerekli' })
  const data = await customersService.listAddresses(req.customer.id)
  return res.json({ success: true, data })
}

export async function createAddress(req: Request, res: Response) {
  if (!req.customer) return res.status(401).json({ success: false, message: 'Giriş gerekli' })
  const body = req.body as Record<string, unknown>
  const title = readString(body, 'title')
  const fullName = readString(body, 'fullName')
  const city = readString(body, 'city')
  const addressLine = readString(body, 'addressLine')
  if (!title || !fullName || !city || !addressLine) {
    return res.status(400).json({ success: false, message: 'title, fullName, city ve addressLine zorunludur' })
  }
  try {
    const row = await customersService.createAddress(req.customer.id, {
      title,
      fullName,
      phone: readString(body, 'phone'),
      city,
      district: readString(body, 'district'),
      addressLine,
      postalCode: readString(body, 'postalCode'),
      taxOffice: readString(body, 'taxOffice'),
      taxNumber: readString(body, 'taxNumber'),
      companyName: readString(body, 'companyName'),
      isDefault: body.isDefault === true,
    })
    return res.status(201).json({ success: true, data: { id: row.id } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Kayıt başarısız'
    return res.status(400).json({ success: false, message: msg })
  }
}

export async function patchAddress(req: Request, res: Response) {
  if (!req.customer) return res.status(401).json({ success: false, message: 'Giriş gerekli' })
  const id = String(req.params.id ?? '').trim()
  if (!id) return res.status(400).json({ success: false, message: 'Geçersiz adres' })
  const body = req.body as Record<string, unknown>
  try {
    await customersService.patchAddress(req.customer.id, id, {
      title: readString(body, 'title'),
      fullName: readString(body, 'fullName'),
      phone: body.phone === undefined ? undefined : body.phone === null ? null : readString(body, 'phone'),
      city: readString(body, 'city'),
      district: body.district === undefined ? undefined : body.district === null ? null : readString(body, 'district'),
      addressLine: readString(body, 'addressLine'),
      postalCode: body.postalCode === undefined ? undefined : body.postalCode === null ? null : readString(body, 'postalCode'),
      taxOffice: body.taxOffice === undefined ? undefined : body.taxOffice === null ? null : readString(body, 'taxOffice'),
      taxNumber: body.taxNumber === undefined ? undefined : body.taxNumber === null ? null : readString(body, 'taxNumber'),
      companyName: body.companyName === undefined ? undefined : body.companyName === null ? null : readString(body, 'companyName'),
      isDefault: typeof body.isDefault === 'boolean' ? body.isDefault : undefined,
    })
    return res.json({ success: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Hata'
    return res.status(400).json({ success: false, message: msg })
  }
}

export async function deleteAddress(req: Request, res: Response) {
  if (!req.customer) return res.status(401).json({ success: false, message: 'Giriş gerekli' })
  const id = String(req.params.id ?? '').trim()
  try {
    await customersService.deleteAddress(req.customer.id, id)
    return res.json({ success: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Hata'
    return res.status(404).json({ success: false, message: msg })
  }
}

export async function listOrders(req: Request, res: Response) {
  if (!req.customer) return res.status(401).json({ success: false, message: 'Giriş gerekli' })
  const data = await customersService.listOrders(req.customer.id)
  return res.json({ success: true, data })
}

export async function getOrder(req: Request, res: Response) {
  if (!req.customer) return res.status(401).json({ success: false, message: 'Giriş gerekli' })
  const orderNo = decodeURIComponent(String(req.params.orderNo ?? '').trim())
  try {
    const data = await customersService.getMyOrder(req.customer.id, orderNo)
    return res.json({ success: true, data })
  } catch (e) {
    const err = e as Error & { status?: number }
    return res.status(err.status ?? 500).json({ success: false, message: err.message || 'Hata' })
  }
}

export async function listLicenses(req: Request, res: Response) {
  if (!req.customer) return res.status(401).json({ success: false, message: 'Giriş gerekli' })
  const data = await customersService.listLicenses(req.customer.id)
  return res.json({ success: true, data })
}

export async function listFavorites(req: Request, res: Response) {
  if (!req.customer) return res.status(401).json({ success: false, message: 'Giriş gerekli' })
  const data = await customersService.listFavorites(req.customer.id)
  return res.json({ success: true, data })
}

export async function addFavorite(req: Request, res: Response) {
  if (!req.customer) return res.status(401).json({ success: false, message: 'Giriş gerekli' })
  const productId = String(req.params.productId ?? '').trim()
  if (!productId) return res.status(400).json({ success: false, message: 'productId gerekli' })
  try {
    await customersService.addFavorite(req.customer.id, productId)
    return res.status(201).json({ success: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Hata'
    return res.status(400).json({ success: false, message: msg })
  }
}

export async function removeFavorite(req: Request, res: Response) {
  if (!req.customer) return res.status(401).json({ success: false, message: 'Giriş gerekli' })
  const productId = String(req.params.productId ?? '').trim()
  await customersService.removeFavorite(req.customer.id, productId)
  return res.json({ success: true })
}
