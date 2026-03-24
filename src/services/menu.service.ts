import { prisma } from '../lib/prisma'

export async function ensureMenus() {
  await prisma.menu.upsert({
    where: { location: 'header' },
    create: { name: 'Üst menü', location: 'header' },
    update: {},
  })
  await prisma.menu.upsert({
    where: { location: 'footer' },
    create: { name: 'Alt menü', location: 'footer' },
    update: {},
  })
}

function resolveHref(url: string | null, slug: string | null): string {
  if (url && url.trim()) {
    const u = url.trim()
    if (u.startsWith('http') || u.startsWith('/')) return u
    return `/${u}`
  }
  if (slug) return `/${slug}`
  return '#'
}

export async function getPublicMenu(location: string) {
  await ensureMenus()
  const menu = await prisma.menu.findUnique({
    where: { location },
    include: {
      items: {
        where: { parentId: null },
        orderBy: { order: 'asc' },
        include: {
          page: { select: { slug: true } },
        },
      },
    },
  })
  if (!menu) return { location, items: [] as { id: string; label: string; href: string }[] }
  return {
    location: menu.location,
    items: menu.items.map((it) => ({
      id: it.id,
      label: it.label,
      href: resolveHref(it.url, it.page?.slug ?? null),
    })),
  }
}

export async function adminListMenus() {
  await ensureMenus()
  return prisma.menu.findMany({ orderBy: { location: 'asc' } })
}

export async function adminGetMenuItems(location: string) {
  await ensureMenus()
  const menu = await prisma.menu.findUnique({
    where: { location },
    include: {
      items: {
        where: { parentId: null },
        orderBy: { order: 'asc' },
        include: { page: { select: { id: true, title: true, slug: true } } },
      },
    },
  })
  return menu
}

export async function adminSetMenuItems(
  location: string,
  rows: Array<{ label: string; url?: string | null; pageId?: string | null; order: number }>
) {
  const menu = await prisma.menu.findUnique({ where: { location } })
  if (!menu) return null
  const sorted = [...rows].sort((a, b) => a.order - b.order)
  await prisma.$transaction(async (tx) => {
    await tx.menuItem.deleteMany({ where: { menuId: menu.id } })
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i]
      await tx.menuItem.create({
        data: {
          menuId: menu.id,
          label: r.label,
          url: r.url?.trim() || null,
          pageId: r.pageId || null,
          order: i,
        },
      })
    }
  })
  return adminGetMenuItems(location)
}
