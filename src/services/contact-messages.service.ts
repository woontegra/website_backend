import { prisma } from '../lib/prisma'

export const contactMessagesService = {
  async getAll() {
    return await prisma.contactMessage.findMany({
      orderBy: { createdAt: 'desc' },
    })
  },

  async getById(id: string) {
    return await prisma.contactMessage.findUnique({
      where: { id },
    })
  },

  async create(data: { 
    name: string
    email: string
    message: string
    phone?: string
    company?: string
  }) {
    return await prisma.contactMessage.create({
      data,
    })
  },

  async markAsRead(id: string) {
    return await prisma.contactMessage.update({
      where: { id },
      data: { read: true },
    })
  },

  async delete(id: string) {
    return await prisma.contactMessage.delete({
      where: { id },
    })
  },
}
