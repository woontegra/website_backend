import { prisma } from '../lib/prisma'
import { invalidatePublicCache, PUBLIC_PAGE_CONTENT_CACHE } from '../lib/publicResponseCache'
import { replaceExactUrlsInValue, urlAliases } from './imageBackfill.urls'

export async function replaceCmsImageUrls(
  oldUrl: string,
  newUrl: string,
  siteBase = 'https://www.woontegra.com',
): Promise<{ updated: number; locations: string[] }> {
  const aliases = urlAliases(oldUrl, siteBase)
  const locations: string[] = []
  let updated = 0

  const pages = await prisma.pageContent.findMany()
  for (const row of pages) {
    let parsed: unknown
    try {
      parsed = JSON.parse(row.content)
    } catch {
      continue
    }
    const next = replaceExactUrlsInValue(parsed, aliases, newUrl)
    if (next.count === 0) continue
    await prisma.pageContent.update({
      where: { id: row.id },
      data: { content: JSON.stringify(next.value), updatedAt: new Date() },
    })
    invalidatePublicCache(PUBLIC_PAGE_CONTENT_CACHE, row.pageKey)
    updated += next.count
    locations.push(`pageContent:${row.pageKey}`)
  }

  const htmlPages = await prisma.page.findMany({ select: { id: true, slug: true, content: true } })
  for (const row of htmlPages) {
    const next = replaceExactUrlsInValue(row.content, aliases, newUrl)
    if (next.count === 0 || typeof next.value !== 'string') continue
    await prisma.page.update({
      where: { id: row.id },
      data: { content: next.value },
    })
    updated += next.count
    locations.push(`page:${row.slug}`)
  }

  const posts = await prisma.post.findMany({ select: { id: true, slug: true, featuredImage: true } })
  for (const row of posts) {
    if (!row.featuredImage || !aliases.includes(row.featuredImage)) continue
    await prisma.post.update({ where: { id: row.id }, data: { featuredImage: newUrl } })
    updated += 1
    locations.push(`post:${row.slug}`)
  }

  const products = await prisma.product.findMany({ select: { id: true, slug: true, coverImage: true } })
  for (const row of products) {
    if (!row.coverImage || !aliases.includes(row.coverImage)) continue
    await prisma.product.update({ where: { id: row.id }, data: { coverImage: newUrl } })
    updated += 1
    locations.push(`product:${row.slug}`)
  }

  const media = await prisma.catalogMedia.findMany({ select: { id: true, url: true, publicUrl: true, fileName: true } })
  for (const row of media) {
    const data: { url?: string; publicUrl?: string } = {}
    if (aliases.includes(row.url)) data.url = newUrl
    if (row.publicUrl && aliases.includes(row.publicUrl)) data.publicUrl = newUrl
    if (!data.url && !data.publicUrl) continue
    await prisma.catalogMedia.update({ where: { id: row.id }, data })
    updated += 1
    locations.push(`catalogMedia:${row.fileName}`)
  }

  const brands = await prisma.brand.findMany({ select: { id: true, name: true, image: true } })
  for (const row of brands) {
    if (!aliases.includes(row.image)) continue
    await prisma.brand.update({ where: { id: row.id }, data: { image: newUrl } })
    updated += 1
    locations.push(`brand:${row.name}`)
  }

  const settings = await prisma.siteSetting.findMany()
  for (const row of settings) {
    if (!aliases.includes(row.value) && !aliases.some((alias) => row.value.includes(alias))) continue
    const next = replaceExactUrlsInValue(row.value, aliases, newUrl)
    if (next.count === 0 || typeof next.value !== 'string') continue
    await prisma.siteSetting.update({ where: { id: row.id }, data: { value: next.value } })
    updated += next.count
    locations.push(`setting:${row.key}`)
  }

  const assets = await prisma.mediaAsset.findMany({ select: { id: true, url: true, filename: true } })
  for (const row of assets) {
    if (!aliases.includes(row.url)) continue
    await prisma.mediaAsset.update({ where: { id: row.id }, data: { url: newUrl } })
    updated += 1
    locations.push(`mediaAsset:${row.filename}`)
  }

  return { updated, locations }
}
