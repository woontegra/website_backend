import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-in-production'

export interface JwtPayload {
  userId: string
  email: string
  role: string
}

export function authMiddleware(req: Request & { user?: JwtPayload }, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Yetkilendirme gerekli' })
  }
  const token = authHeader.slice(7)
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload
    req.user = decoded
    next()
  } catch {
    return res.status(401).json({ success: false, message: 'Geçersiz veya süresi dolmuş token' })
  }
}

export function adminOnly(req: Request & { user?: JwtPayload }, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Bu işlem için admin yetkisi gerekli' })
  }
  next()
}
