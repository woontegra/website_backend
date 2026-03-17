import crypto from 'crypto'

const store: Array<{ id: string; name: string; email: string; message: string; createdAt: Date }> = []

export const contactsService = {
  async create(data: { name: string; email: string; message: string }) {
    const id = crypto.randomUUID()
    const record = { id, ...data, createdAt: new Date() }
    store.push(record)
    return record
  },
  async list() {
    return store
  },
}
