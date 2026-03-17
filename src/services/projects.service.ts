import crypto from 'crypto'

const store: Array<{ id: string; userId: string; title: string; status: string; createdAt: Date }> = []

export const projectsService = {
  async list(userId?: string, isAdmin?: boolean) {
    if (isAdmin) return store
    return store.filter((p) => p.userId === userId)
  },
  async getById(id: string) {
    return store.find((p) => p.id === id) ?? null
  },
  async create(data: { title: string; userId?: string }) {
    const id = crypto.randomUUID()
    const record = {
      id,
      userId: data.userId ?? '',
      title: data.title,
      status: 'active',
      createdAt: new Date(),
    }
    store.push(record)
    return record
  },
}
