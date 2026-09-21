import fs from 'fs/promises'
import path from 'path'
import { replaceExactUrlsInText, urlAliases } from './imageBackfill.urls'

const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.json', '.md'])

async function walkFiles(dir: string, out: string[]): Promise<void> {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, String(entry.name))
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.git'].includes(String(entry.name))) continue
      await walkFiles(full, out)
      continue
    }
    if (TEXT_EXT.has(path.extname(String(entry.name)).toLowerCase())) out.push(full)
  }
}

export async function replaceFrontendImageRefs(
  srcRoot: string,
  oldUrl: string,
  newUrl: string,
  siteBase = 'https://www.woontegra.com',
): Promise<number> {
  const aliases = urlAliases(oldUrl, siteBase)
  const nextPath = newUrl.startsWith('/')
    ? newUrl
    : newUrl.replace(/^https?:\/\/(www\.)?woontegra\.com/i, '')
  if (!nextPath.startsWith('/images/')) return 0
  const files: string[] = []
  await walkFiles(srcRoot, files)
  let changed = 0
  for (const file of files) {
    const raw = await fs.readFile(file, 'utf8')
    const rewritten = replaceExactUrlsInText(raw, aliases, nextPath)
    if (rewritten.count === 0 || rewritten.text === raw) continue
    await fs.writeFile(file, rewritten.text, 'utf8')
    changed += rewritten.count
  }
  return changed
}
