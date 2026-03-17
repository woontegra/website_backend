import crypto from 'crypto'

const store: Array<{ id: string; userId: string; subject: string; message?: string; status: string; createdAt: Date }> = []

export const supportService = {
  async list(userId?: string, isAdmin?: boolean) {
    if (isAdmin) return store
    return store.filter((t) => t.userId === userId)
  },
  async getById(id: string) {
    return store.find((t) => t.id === id) ?? null
  },
  async create(data: { userId: string; subject: string; message?: string }) {
    const id = crypto.randomUUID()
    const record = { id, ...data, status: 'open', createdAt: new Date() }
    store.push(record)
    return record
  },
}
