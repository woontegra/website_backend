/**
 * Hoş geldin şifre belirleme token akışı — DB + resetPassword doğrulaması (SMTP yok).
 * Kullanım: node scripts/test-welcome-password-token.cjs
 */
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const { createHash, randomBytes } = require('node:crypto')

const prisma = new PrismaClient()
const WELCOME_EXPIRES_MIN = 24 * 60

function hashToken(plain) {
  return createHash('sha256').update(plain.trim(), 'utf8').digest('hex')
}

async function issueToken(customerId) {
  const plainToken = randomBytes(32).toString('base64url')
  const tokenHash = hashToken(plainToken)
  const expiresAt = new Date(Date.now() + WELCOME_EXPIRES_MIN * 60 * 1000)
  await prisma.$transaction(async (tx) => {
    await tx.customerPasswordResetToken.deleteMany({ where: { customerId, usedAt: null } })
    await tx.customerPasswordResetToken.create({ data: { customerId, tokenHash, expiresAt } })
  })
  return plainToken
}

async function resetPassword(plainToken, password) {
  const tokenHash = hashToken(plainToken)
  const now = new Date()
  const row = await prisma.customerPasswordResetToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
    include: { customer: { select: { id: true, isActive: true } } },
  })
  if (!row || !row.customer.isActive) throw new Error('INVALID_TOKEN')
  const passwordHash = await bcrypt.hash(password, 10)
  await prisma.$transaction([
    prisma.customer.update({ where: { id: row.customerId }, data: { passwordHash } }),
    prisma.customerPasswordResetToken.update({ where: { id: row.id }, data: { usedAt: now } }),
  ])
}

async function main() {
  const email = `welcome-token-test+${Date.now()}@woontegra.local`
  const customer = await prisma.customer.create({
    data: {
      name: 'Token Test',
      email,
      passwordHash: await bcrypt.hash('placeholder-only', 10),
    },
  })

  try {
    const plain = await issueToken(customer.id)
    const newPass = 'TestPass123!'
    await resetPassword(plain, newPass)

    const loginOk = await bcrypt.compare(newPass, (await prisma.customer.findUnique({ where: { id: customer.id } })).passwordHash)
    if (!loginOk) throw new Error('LOGIN_FAIL')

    let secondUseFailed = false
    try {
      await resetPassword(plain, 'AnotherPass1!')
    } catch {
      secondUseFailed = true
    }
    if (!secondUseFailed) throw new Error('TOKEN_REUSE_ALLOWED')

    console.log('OK welcome-password-token flow')
  } finally {
    await prisma.customerPasswordResetToken.deleteMany({ where: { customerId: customer.id } })
    await prisma.customer.delete({ where: { id: customer.id } })
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('FAIL', err)
  process.exit(1)
})
