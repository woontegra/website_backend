type CacheEntry<T> = { value: T; loadedAt: number }

const stores = new Map<string, Map<string, CacheEntry<unknown>>>()

function bucket(name: string): Map<string, CacheEntry<unknown>> {
  let store = stores.get(name)
  if (!store) {
    store = new Map()
    stores.set(name, store)
  }
  return store
}

/** Public GET yanıtları için kısa TTL bellek önbelleği */
export function getPublicCached<T>(
  cacheName: string,
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const store = bucket(cacheName)
  const hit = store.get(key) as CacheEntry<T> | undefined
  const now = Date.now()
  if (hit && now - hit.loadedAt < ttlMs) {
    return Promise.resolve(hit.value)
  }

  return loader().then((value) => {
    store.set(key, { value, loadedAt: Date.now() })
    return value
  })
}

export function invalidatePublicCache(cacheName: string, key?: string): void {
  const store = stores.get(cacheName)
  if (!store) return
  if (key) {
    store.delete(key)
    return
  }
  store.clear()
}

export const PUBLIC_PAGE_CONTENT_CACHE = 'page-content'
export const PUBLIC_NAV_MENU_CACHE = 'navigation-menu'
export const PUBLIC_PAGE_CONTENT_TTL_MS = 120_000
export const PUBLIC_NAV_MENU_TTL_MS = 120_000
