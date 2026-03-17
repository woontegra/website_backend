import { prisma } from '../lib/prisma'
import type { Prisma } from '@prisma/client'

export async function getPublicPageBySlug(slug: string) {
  const page = await prisma.page.findFirst({
    where: { slug, isActive: true },
    include: {
      sections: {
        where: { isActive: true },
        orderBy: { order: 'asc' },
        include: {
          items: {
            where: { isActive: true },
            orderBy: { order: 'asc' },
          },
        },
      },
      faqs: { orderBy: { order: 'asc' } },
    },
  })
  if (!page) return null
  const { faqs, ...rest } = page
  return { ...rest, faqs }
}

export async function listPagesAdmin() {
  return prisma.page.findMany({
    orderBy: { updatedAt: 'desc' },
    select: { id: true, slug: true, title: true, isActive: true, createdAt: true, updatedAt: true },
  })
}

export async function getPageAdmin(id: string) {
  return prisma.page.findUnique({
    where: { id },
    include: {
      sections: {
        orderBy: { order: 'asc' },
        include: { items: { orderBy: { order: 'asc' } } },
      },
      faqs: { orderBy: { order: 'asc' } },
    },
  })
}

export async function createPage(data: { slug: string; title: string; isActive?: boolean }) {
  return prisma.page.create({ data: { slug: data.slug, title: data.title, isActive: data.isActive ?? true } })
}

export async function updatePage(id: string, data: { slug?: string; title?: string; isActive?: boolean }) {
  return prisma.page.update({ where: { id }, data })
}

export async function deletePage(id: string) {
  return prisma.page.delete({ where: { id } })
}

export async function createSection(data: {
  pageId: string
  type: string
  title?: string | null
  content?: Prisma.InputJsonValue
  order?: number
  isActive?: boolean
}) {
  const max = await prisma.section.aggregate({
    where: { pageId: data.pageId },
    _max: { order: true },
  })
  const order = data.order ?? (max._max.order ?? -1) + 1
  return prisma.section.create({
    data: {
      pageId: data.pageId,
      type: data.type,
      title: data.title ?? null,
      content: data.content === undefined ? undefined : data.content,
      order,
      isActive: data.isActive ?? true,
    },
  })
}

export async function updateSection(
  id: string,
  data: { type?: string; title?: string | null; content?: Prisma.InputJsonValue | null; order?: number; isActive?: boolean }
) {
  return prisma.section.update({ where: { id }, data })
}

export async function deleteSection(id: string) {
  return prisma.section.delete({ where: { id } })
}

export async function reorderSections(_pageId: string, orderedIds: string[]) {
  await prisma.$transaction(orderedIds.map((id, i) => prisma.section.update({ where: { id }, data: { order: i } })))
}

export async function createSectionItem(data: {
  sectionId: string
  title?: string | null
  description?: string | null
  icon?: string | null
  image?: string | null
  extraData?: Prisma.InputJsonValue
  order?: number
  isActive?: boolean
}) {
  const max = await prisma.sectionItem.aggregate({
    where: { sectionId: data.sectionId },
    _max: { order: true },
  })
  const order = data.order ?? (max._max.order ?? -1) + 1
  return prisma.sectionItem.create({
    data: {
      sectionId: data.sectionId,
      title: data.title ?? null,
      description: data.description ?? null,
      icon: data.icon ?? null,
      image: data.image ?? null,
      extraData: data.extraData === undefined ? undefined : data.extraData,
      order,
      isActive: data.isActive ?? true,
    },
  })
}

export async function updateSectionItem(
  id: string,
  data: {
    title?: string | null
    description?: string | null
    icon?: string | null
    image?: string | null
    extraData?: Prisma.InputJsonValue | null
    order?: number
    isActive?: boolean
  }
) {
  return prisma.sectionItem.update({ where: { id }, data })
}

export async function deleteSectionItem(id: string) {
  return prisma.sectionItem.delete({ where: { id } })
}

export async function reorderSectionItems(_sectionId: string, orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, i) => prisma.sectionItem.update({ where: { id }, data: { order: i } }))
  )
}

export async function createFaq(data: { pageId: string; question: string; answer: string; order?: number }) {
  const max = await prisma.faq.aggregate({
    where: { pageId: data.pageId },
    _max: { order: true },
  })
  const order = data.order ?? (max._max.order ?? -1) + 1
  return prisma.faq.create({
    data: { pageId: data.pageId, question: data.question, answer: data.answer, order },
  })
}

export async function updateFaq(id: string, data: { question?: string; answer?: string; order?: number }) {
  return prisma.faq.update({ where: { id }, data })
}

export async function deleteFaq(id: string) {
  return prisma.faq.delete({ where: { id } })
}

export async function reorderFaqs(_pageId: string, orderedIds: string[]) {
  await prisma.$transaction(orderedIds.map((id, i) => prisma.faq.update({ where: { id }, data: { order: i } })))
}
