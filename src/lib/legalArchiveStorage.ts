import fs from 'fs'
import path from 'path'

/** Yerel depolama kökü — ileride S3/R2 adaptörü bu arayüzü implemente edebilir. */
export type LegalArchiveStorageAdapter = {
  resolveAbsolutePath(storageKey: string): string
  writeFile(storageKey: string, data: Buffer): Promise<{ size: number }>
  readFile(storageKey: string): Promise<Buffer>
  deleteFile(storageKey: string): Promise<void>
  deleteOrderDirectory(orderNo: string): Promise<void>
}

function storageRoot(): string {
  return path.resolve(process.cwd(), 'storage', 'legal-archives')
}

function orderDir(orderNo: string): string {
  const safe = orderNo.replace(/[^a-zA-Z0-9._-]/g, '_')
  return path.join(storageRoot(), safe)
}

export function buildArchiveStorageKey(orderNo: string, fileName: string): string {
  const safeOrder = orderNo.replace(/[^a-zA-Z0-9._-]/g, '_')
  const safeFile = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `legal-archives/${safeOrder}/${safeFile}`
}

export const legalArchiveStorage: LegalArchiveStorageAdapter = {
  resolveAbsolutePath(storageKey: string): string {
    const normalized = storageKey.replace(/\\/g, '/').replace(/^\/+/, '')
    if (normalized.includes('..')) {
      throw new Error('Geçersiz storage key')
    }
    const parts = normalized.split('/')
    if (parts[0] !== 'legal-archives') {
      throw new Error('Geçersiz storage key')
    }
    return path.join(process.cwd(), 'storage', ...parts)
  },

  async writeFile(storageKey: string, data: Buffer): Promise<{ size: number }> {
    const abs = this.resolveAbsolutePath(storageKey)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, data)
    return { size: data.length }
  },

  async readFile(storageKey: string): Promise<Buffer> {
    const abs = this.resolveAbsolutePath(storageKey)
    return fs.readFileSync(abs)
  },

  async deleteFile(storageKey: string): Promise<void> {
    const abs = this.resolveAbsolutePath(storageKey)
    if (fs.existsSync(abs)) fs.unlinkSync(abs)
  },

  async deleteOrderDirectory(orderNo: string): Promise<void> {
    const dir = orderDir(orderNo)
    if (!fs.existsSync(dir)) return
    fs.rmSync(dir, { recursive: true, force: true })
  },
}

export function ensureOrderArchiveDir(orderNo: string): string {
  const dir = orderDir(orderNo)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}
