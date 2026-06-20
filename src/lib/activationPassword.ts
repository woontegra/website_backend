import bcrypt from 'bcryptjs'

const SEGMENT = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz'

function randomSegment(len: number): string {
  let s = ''
  for (let i = 0; i < len; i++) {
    s += SEGMENT[Math.floor(Math.random() * SEGMENT.length)]!
  }
  return s
}

/** Okunabilir aktivasyon şifresi: XXXX-XXXX-XXXX */
export function generateActivationPassword(): string {
  return `${randomSegment(4)}-${randomSegment(4)}-${randomSegment(4)}`
}

export async function hashActivationPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain.trim(), 10)
}

export async function verifyActivationPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash?.trim()) return false
  return bcrypt.compare(plain.trim(), hash)
}
