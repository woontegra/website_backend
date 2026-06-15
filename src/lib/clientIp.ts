import type { Request } from 'express'

export function getClientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for']
  if (typeof xf === 'string' && xf.length > 0) {
    return xf.split(',')[0].trim().slice(0, 39)
  }
  const raw = req.socket.remoteAddress || '127.0.0.1'
  return String(raw).replace(/^::ffff:/, '').slice(0, 39)
}
