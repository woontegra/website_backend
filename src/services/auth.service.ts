import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-in-production'
const SALT_ROUNDS = 10

function uuid() {
  return crypto.randomUUID()
}

function signUser(user: { id: string; email: string; role: string }) {
  const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '1h' })
  const refreshToken = jwt.sign({ userId: user.id, type: 'refresh' }, JWT_SECRET, { expiresIn: '7d' })
  return { success: true, token, refreshToken, user: { id: user.id, email: user.email, role: user.role } }
}

// In-memory fallback when DB yok
const usersStore: Map<string, { id: string; email: string; passwordHash: string; role: string }> = new Map()

export const authService = {
  async login(email: string, password: string) {
    try {
      const dbUser = await prisma.user.findUnique({ where: { email } })
      if (dbUser && (await bcrypt.compare(password, dbUser.passwordHash))) {
        return signUser({ id: dbUser.id, email: dbUser.email, role: dbUser.role })
      }
    } catch {
      /* DATABASE_URL yok */
    }
    const user = Array.from(usersStore.values()).find((u) => u.email === email)
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new Error('E-posta veya şifre hatalı')
    }
    return signUser(user)
  },

  async register(data: { email: string; password: string; fullName?: string }) {
    if (Array.from(usersStore.values()).some((u) => u.email === data.email)) {
      throw new Error('Bu e-posta adresi zaten kayıtlı')
    }
    const id = uuid()
    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS)
    usersStore.set(id, { id, email: data.email, passwordHash, role: 'user' })
    const token = jwt.sign(
      { userId: id, email: data.email, role: 'user' },
      JWT_SECRET,
      { expiresIn: '1h' }
    )
    return { success: true, token, user: { id, email: data.email, role: 'user' } }
  },

  async forgotPassword(_email: string) {
    // Mock: send email with reset link
  },

  async resetPassword(_token: string, _newPassword: string) {
    // Mock: validate token and update password in DB
  },

  async refresh(refreshToken: string) {
    const decoded = jwt.verify(refreshToken, JWT_SECRET) as { userId: string; type: string }
    if (decoded.type !== 'refresh') throw new Error('Geçersiz token')
    try {
      const dbUser = await prisma.user.findUnique({ where: { id: decoded.userId } })
      if (dbUser) {
        const token = jwt.sign(
          { userId: dbUser.id, email: dbUser.email, role: dbUser.role },
          JWT_SECRET,
          { expiresIn: '1h' }
        )
        return { success: true, token }
      }
    } catch {
      /* */
    }
    const user = usersStore.get(decoded.userId)
    if (!user) throw new Error('Kullanıcı bulunamadı')
    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '1h' })
    return { success: true, token }
  },

  async getProfile(userId: string) {
    try {
      const dbUser = await prisma.user.findUnique({ where: { id: userId } })
      if (dbUser) return { id: dbUser.id, email: dbUser.email, role: dbUser.role }
    } catch {
      /* */
    }
    const user = usersStore.get(userId)
    if (!user) throw new Error('Kullanıcı bulunamadı')
    return { id: user.id, email: user.email, role: user.role }
  },
}
