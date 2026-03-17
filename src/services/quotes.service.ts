import crypto from 'crypto'

const store: Array<{
  id: string
  projectType?: string
  service?: string
  brief?: string
  contactName: string
  contactEmail: string
  contactPhone?: string
  status: string
  createdAt: Date
}> = []

export const quotesService = {
  async create(data: {
    projectType?: string
    service?: string
    brief?: string
    contactName: string
    contactEmail: string
    contactPhone?: string
  }) {
    const id = crypto.randomUUID()
    const record = { id, ...data, status: 'pending', createdAt: new Date() }
    store.push(record)
    return record
  },
  async list() {
    return store
  },
  async getByUser(_userId: string) {
    return store
  },
}
