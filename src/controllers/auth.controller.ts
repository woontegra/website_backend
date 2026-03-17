import { Request, Response } from 'express'
import { authService } from '../services/auth.service'
import { JwtPayload } from '../middleware/auth.middleware'

export const authController = {
  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body
      if (!email || !password) {
        return res.status(400).json({ success: false, message: 'E-posta ve şifre gerekli' })
      }
      const result = await authService.login(email, password)
      return res.json(result)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Giriş başarısız'
      return res.status(401).json({ success: false, message })
    }
  },

  async register(req: Request, res: Response) {
    try {
      const { email, password, fullName } = req.body
      if (!email || !password) {
        return res.status(400).json({ success: false, message: 'E-posta ve şifre gerekli' })
      }
      const result = await authService.register({ email, password, fullName: fullName ?? email })
      return res.status(201).json(result)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Kayıt başarısız'
      return res.status(400).json({ success: false, message })
    }
  },

  async forgotPassword(req: Request, res: Response) {
    const { email } = req.body
    if (!email) return res.status(400).json({ success: false, message: 'E-posta gerekli' })
    await authService.forgotPassword(email)
    return res.json({ success: true, message: 'Şifre sıfırlama bağlantısı e-posta ile gönderildi (mock)' })
  },

  async resetPassword(req: Request, res: Response) {
    const { token, newPassword } = req.body
    if (!token || !newPassword) return res.status(400).json({ success: false, message: 'Token ve yeni şifre gerekli' })
    await authService.resetPassword(token, newPassword)
    return res.json({ success: true, message: 'Şifre güncellendi' })
  },

  async refresh(req: Request, res: Response) {
    const { refreshToken } = req.body
    if (!refreshToken) return res.status(400).json({ success: false, message: 'Refresh token gerekli' })
    const result = await authService.refresh(refreshToken)
    return res.json(result)
  },

  async profile(req: Request & { user?: JwtPayload }, res: Response) {
    if (!req.user) return res.status(401).json({ success: false, message: 'Yetkisiz' })
    const profile = await authService.getProfile(req.user.userId)
    return res.json(profile)
  },
}
