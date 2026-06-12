import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-in-production'

export type CustomerJwtPayload = {
  customerId: string
  email: string
}

export function optionalCustomerAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return next()
  }
  const token = authHeader.slice(7)
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { audience: 'customer' }) as CustomerJwtPayload
    if (decoded.customerId && decoded.email) {
      req.customer = { id: decoded.customerId, email: decoded.email }
    }
  } catch {
    /* misafir veya admin token — yoksay */
  }
  next()
}

export function customerAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Giriş gerekli' })
  }
  const token = authHeader.slice(7)
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { audience: 'customer' }) as CustomerJwtPayload
    if (!decoded.customerId || !decoded.email) {
      return res.status(401).json({ success: false, message: 'Geçersiz müşteri oturumu' })
    }
    req.customer = { id: decoded.customerId, email: decoded.email }
    next()
  } catch {
    return res.status(401).json({ success: false, message: 'Oturum süresi doldu veya geçersiz' })
  }
}
