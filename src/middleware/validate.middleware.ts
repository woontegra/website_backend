import { Request, Response, NextFunction } from 'express'

export function validateBody(schema: { parse: (data: unknown) => unknown }) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body)
      next()
    } catch (err) {
      return res.status(400).json({ success: false, message: 'Geçersiz veri', errors: err })
    }
  }
}
