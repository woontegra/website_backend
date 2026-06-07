import path from 'path'
import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'

config({ path: path.resolve(process.cwd(), '.env') })
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(path.join(process.cwd(), 'scripts/resolve-database-url.cjs')).applyToProcessEnv()
} catch {
  /* */
}

const prisma = new PrismaClient()
const IMAGE_KEYS = new Set(['image', 'imageUrl', 'featuredImage', 'coverImage', 'heroImage', 'mediaUrl'])

function walk(source: string, id: string, value: unknown, fieldPath: string, out: { source: string; id: string; field: string; path: string }[]) {
  if (Array.isArray(value)) {
    value.forEach((item, i) => walk(source, id, item, `${fieldPath}[${i}]`, out))
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    const next = fieldPath ? `${fieldPath}.${key}` : key
    if (IMAGE_KEYS.has(key) && typeof child === 'string' && child.startsWith('/images/')) {
      out.push({ source, id, field: next, path: child })
    } else {
      walk(source, id, child, next, out)
    }
  }
}

async function main() {
  const paths: { source: string; id: string; field: string; path: string }[] = []
  for (const row of await prisma.pageContent.findMany()) {
    try {
      walk('pageContent', row.pageKey, JSON.parse(row.content), 'content', paths)
    } catch {
      /* */
    }
  }
  for (const row of await prisma.brand.findMany()) {
    if (row.image?.startsWith('/images/')) paths.push({ source: 'brand', id: row.name, field: 'image', path: row.image })
  }
  for (const row of await prisma.post.findMany()) {
    if (row.featuredImage?.startsWith('/images/')) {
      paths.push({ source: 'post', id: row.slug, field: 'featuredImage', path: row.featuredImage })
    }
  }

  const unique = [...new Map(paths.map((p) => [p.path, p])).values()]
  console.log('DB image paths:')
  for (const p of unique.sort((a, b) => a.path.localeCompare(b.path))) {
    console.log(`  ${p.path} (${p.source}/${p.id})`)
  }
}

main().finally(() => prisma.$disconnect())
