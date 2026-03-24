import { prisma } from '../lib/prisma'

export const brandsService = {
  async getAll() {
    return await prisma.brand.findMany({
      orderBy: { createdAt: 'desc' },
    })
  },

  async getById(id: string) {
    return await prisma.brand.findUnique({
      where: { id },
    })
  },

  async create(data: { name: string; description?: string; image: string; url?: string }) {
    return await prisma.brand.create({
      data,
    })
  },

  async update(id: string, data: { name?: string; description?: string; image?: string; url?: string }) {
    return await prisma.brand.update({
      where: { id },
      data,
    })
  },

  async delete(id: string) {
    return await prisma.brand.delete({
      where: { id },
    })
  },
}
