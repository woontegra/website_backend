import jwt from 'jsonwebtoken'

const TOKEN_AUDIENCE = 'order-download'
const TOKEN_TTL = '90d'

export type OrderDownloadTokenPayload = {
  orderId: string
  orderItemId: string
  productId?: string
  licenseId?: string
}

function downloadTokenSecret(): string {
  return (process.env.DOWNLOAD_TOKEN_SECRET || process.env.JWT_SECRET || 'change-me-in-production').trim()
}

export function signOrderDownloadToken(payload: OrderDownloadTokenPayload): string {
  return jwt.sign(
    {
      orderId: payload.orderId,
      orderItemId: payload.orderItemId,
      productId: payload.productId ?? undefined,
      licenseId: payload.licenseId ?? undefined,
    },
    downloadTokenSecret(),
    { audience: TOKEN_AUDIENCE, expiresIn: TOKEN_TTL },
  )
}

export function verifyOrderDownloadToken(token: string): OrderDownloadTokenPayload | null {
  try {
    const decoded = jwt.verify(token, downloadTokenSecret(), {
      audience: TOKEN_AUDIENCE,
    }) as jwt.JwtPayload & OrderDownloadTokenPayload
    const orderId = String(decoded.orderId ?? '').trim()
    const orderItemId = String(decoded.orderItemId ?? '').trim()
    if (!orderId || !orderItemId) return null
    return {
      orderId,
      orderItemId,
      productId: decoded.productId ? String(decoded.productId) : undefined,
      licenseId: decoded.licenseId ? String(decoded.licenseId) : undefined,
    }
  } catch {
    return null
  }
}
