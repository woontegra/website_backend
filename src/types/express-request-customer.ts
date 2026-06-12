/**
 * `req.customer` (optionalCustomerAuth / customerAuthMiddleware).
 * .ts + index import: ts-node-dev bazen yalnızca .d.ts birleştirmesini yüklemediği için burada tutuluyor.
 */
import type {} from 'express-serve-static-core'

declare module 'express-serve-static-core' {
  interface Request {
    customer?: { id: string; email: string }
  }
}

export {}
