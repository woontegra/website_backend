import { prisma } from '../lib/prisma'

export const servicesService = {
  async getAll() {
    return await prisma.service.findMany({
      orderBy: { createdAt: 'desc' },
    })
  },

  async getById(id: string) {
    return await prisma.service.findUnique({
      where: { id },
    })
  },

  async create(data: { title: string; description: string; icon: string }) {
    return await prisma.service.create({
      data,
    })
  },

  async update(id: string, data: { title?: string; description?: string; icon?: string }) {
    return await prisma.service.update({
      where: { id },
      data,
    })
  },

  async delete(id: string) {
    return await prisma.service.delete({
      where: { id },
    })
  },
}
