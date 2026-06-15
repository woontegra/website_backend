import { prisma } from './prisma'

/**
 * Sepet/checkout satırlarında gelen anahtar ürün `id` veya `slug` olabilir.
 * Aktif ürünler için tek sorguda eşleştirir; dönüş: ham anahtar → kanonik `id`.
 */
export async function resolveCartProductKeys(rawKeys: string[]): Promise<Map<string, string>> {
  const keys = [...new Set(rawKeys.map((k) => k.trim()).filter(Boolean))]
  if (keys.length === 0) return new Map()

  const rows = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [{ id: { in: keys } }, { slug: { in: keys } }],
    },
    select: { id: true, slug: true },
  })

  const out = new Map<string, string>()
  for (const k of keys) {
    const byId = rows.find((r) => r.id === k)
    if (byId) {
      out.set(k, byId.id)
      continue
    }
    const bySlug = rows.find((r) => r.slug === k)
    if (bySlug) out.set(k, bySlug.id)
  }
  return out
}
