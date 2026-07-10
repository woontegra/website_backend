export type TrackedDownloadProduct = {
  productKey: string
  name: string
  slug: string
  publicPath: string
  freeSetupPath: string
  freePortablePath: string
}

/** Admin panelde izlenen ücretsiz indirme ürünleri (DownloadStat.productKey ile eşleşir). */
export const ADMIN_TRACKED_DOWNLOAD_PRODUCTS: TrackedDownloadProduct[] = [
  {
    productKey: 'sifre-kasasi',
    name: 'Ücretsiz Woontegra Şifre Kasası',
    slug: 'sifre-kasasi',
    publicPath: '/yazilimlar/sifre-kasasi',
    freeSetupPath: '/api/downloads/free/sifre-kasasi/setup',
    freePortablePath: '/api/downloads/free/sifre-kasasi/portable',
  },
]
