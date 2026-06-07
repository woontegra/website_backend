import { prisma } from '../lib/prisma'
import { sanitizeImageUrl } from '../utils/sanitizeImageFields'

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
      data: {
        ...data,
        image: sanitizeImageUrl(data.image),
      },
    })
  },

  async update(id: string, data: { name?: string; description?: string; image?: string; url?: string }) {
    const patch = { ...data }
    if (data.image !== undefined) patch.image = sanitizeImageUrl(data.image)
    return await prisma.brand.update({
      where: { id },
      data: patch,
    })
  },

  async delete(id: string) {
    return await prisma.brand.delete({
      where: { id },
    })
  },
}
