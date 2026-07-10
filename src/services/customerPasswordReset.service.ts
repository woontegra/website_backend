import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { mailService } from './mail.service'

export const CUSTOMER_FORGOT_PASSWORD_SUCCESS_MESSAGE =
  'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.'

export const FORGOT_PASSWORD_TOKEN_EXPIRES_MIN = 60
export const WELCOME_PASSWORD_SET_EXPIRES_MIN = 24 * 60
const RESET_COOLDOWN_MIN = 5
const SALT_ROUNDS = 10

const GENERIC_RESET_FAILURE =
  'Geçersiz veya süresi dolmuş sıfırlama bağlantısı. Lütfen yeni bir talep oluşturun.'

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function hashCustomerResetToken(plainToken: string): string {
  return createHash('sha256').update(plainToken.trim(), 'utf8').digest('hex')
}

function generatePlainResetToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Tek kullanımlık şifre belirleme/sıfırlama token'ı oluşturur (hash DB'de saklanır). */
export async function issueCustomerPasswordSetToken(
  customerId: string,
  expiresMinutes: number,
  options?: { replaceExisting?: boolean },
): Promise<string> {
  const plainToken = generatePlainResetToken()
  const tokenHash = hashCustomerResetToken(plainToken)
  const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000)

  await prisma.$transaction(async (tx) => {
    if (options?.replaceExisting !== false) {
      await tx.customerPasswordResetToken.deleteMany({
        where: { customerId, usedAt: null },
      })
    }
    await tx.customerPasswordResetToken.create({
      data: {
        customerId,
        tokenHash,
        expiresAt,
      },
    })
  })

  return plainToken
}

export const customerPasswordResetService = {
  async forgotPassword(email: string): Promise<{ ok: true; message: string }> {
    const normalized = normalizeEmail(email)
    if (!normalized || !isValidEmail(normalized)) {
      return { ok: true, message: CUSTOMER_FORGOT_PASSWORD_SUCCESS_MESSAGE }
    }

    const customer = await prisma.customer.findUnique({
      where: { email: normalized },
      select: { id: true, email: true, name: true, isActive: true },
    })

    if (!customer?.isActive) {
      return { ok: true, message: CUSTOMER_FORGOT_PASSWORD_SUCCESS_MESSAGE }
    }

    const cooldownSince = new Date(Date.now() - RESET_COOLDOWN_MIN * 60 * 1000)
    const recentToken = await prisma.customerPasswordResetToken.findFirst({
      where: {
        customerId: customer.id,
        usedAt: null,
        createdAt: { gt: cooldownSince },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (recentToken) {
      return { ok: true, message: CUSTOMER_FORGOT_PASSWORD_SUCCESS_MESSAGE }
    }

    const plainToken = await issueCustomerPasswordSetToken(
      customer.id,
      FORGOT_PASSWORD_TOKEN_EXPIRES_MIN,
      { replaceExisting: true },
    )

    void mailService
      .sendCustomerPasswordResetEmail({
        customerName: customer.name,
        customerEmail: customer.email,
        plainToken,
        expiresMinutes: FORGOT_PASSWORD_TOKEN_EXPIRES_MIN,
      })
      .catch((err) => {
        console.error('[customers] Şifre sıfırlama e-postası gönderilemedi', {
          email: customer.email,
          error: err instanceof Error ? err.message : err,
        })
      })

    return { ok: true, message: CUSTOMER_FORGOT_PASSWORD_SUCCESS_MESSAGE }
  },

  async resetPassword(token: string, password: string): Promise<{ ok: true; message: string }> {
    const trimmedToken = token.trim()
    if (!trimmedToken) {
      throw new Error(GENERIC_RESET_FAILURE)
    }
    if (!password || password.length < 8) {
      throw new Error('Şifre en az 8 karakter olmalıdır')
    }

    const tokenHash = hashCustomerResetToken(trimmedToken)
    const now = new Date()

    const row = await prisma.customerPasswordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: now },
      },
      include: {
        customer: { select: { id: true, isActive: true } },
      },
    })

    if (!row || !row.customer.isActive) {
      throw new Error(GENERIC_RESET_FAILURE)
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

    await prisma.$transaction([
      prisma.customer.update({
        where: { id: row.customerId },
        data: { passwordHash },
      }),
      prisma.customerPasswordResetToken.update({
        where: { id: row.id },
        data: { usedAt: now },
      }),
    ])

    return { ok: true, message: 'Şifreniz güncellendi.' }
  },
}
