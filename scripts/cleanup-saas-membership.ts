/**
 * Öksüz (orphan) SaaS üyelik kaydı temizliği.
 *
 * MK SaaS panelinden büro/kullanıcı kalıcı silindiğinde Website'teki
 * CustomerSaasMembership kaydı kalır ve "Hesabım → Üyelikler" ekranında
 * hâlâ aktif lisans gösterir. Bu script o kaydı bulup temizler.
 *
 * İlişki: OrderItem.saasMembershipId onDelete=SetNull → silme sipariş
 * geçmişini bozmaz, yalnızca ilgili satırların membership bağı null olur.
 *
 * Varsayılan DRY-RUN'dır; hiçbir değişiklik yapılmaz. Uygulamak için --apply ekleyin.
 *
 * Kullanım (önce dry-run ile eşleşmeyi doğrulayın):
 *   npm run cleanup:saas-membership -- --email woontegra@hotmail.com
 *   npm run cleanup:saas-membership -- --slug serdar-topal
 *   npm run cleanup:saas-membership -- --license B20P-8615-41PN-NJ71
 *   npm run cleanup:saas-membership -- --id <membershipId>
 *
 * Uygulama:
 *   npm run cleanup:saas-membership -- --email woontegra@hotmail.com --apply
 *   npm run cleanup:saas-membership -- --slug serdar-topal --action cancel --apply
 *
 * Seçenekler:
 *   --email <e-posta>     Müşteri hesabı e-postasına göre eşleştir (customer.email)
 *   --owner <e-posta>     Üyelik sahip e-postasına göre eşleştir (ownerEmail)
 *   --slug <buroKodu>     tenantSlug'a göre eşleştir
 *   --license <anahtar>   licenseKey'e göre eşleştir
 *   --id <membershipId>   Üyelik id'sine göre eşleştir
 *   --action delete|cancel  delete: kaydı sil (varsayılan). cancel: status=SUSPENDED yap.
 *   --apply               Değişikliği gerçekten uygula (yoksa dry-run)
 */
import 'dotenv/config'
import { PrismaClient, Prisma, CustomerSaasMembershipStatus } from '@prisma/client'

const prisma = new PrismaClient()

type Action = 'delete' | 'cancel'

function getFlag(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1) return undefined
  const val = process.argv[idx + 1]
  if (!val || val.startsWith('--')) return ''
  return val.trim()
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

async function main() {
  const email = getFlag('email')
  const owner = getFlag('owner')
  const slug = getFlag('slug')
  const license = getFlag('license')
  const id = getFlag('id')
  const apply = hasFlag('apply')
  const actionRaw = (getFlag('action') ?? 'delete').toLowerCase()
  const action: Action = actionRaw === 'cancel' ? 'cancel' : 'delete'

  const where: Prisma.CustomerSaasMembershipWhereInput = {}
  if (id) where.id = id
  if (slug) where.tenantSlug = slug
  if (license) where.licenseKey = license
  if (owner) where.ownerEmail = { equals: owner.toLowerCase(), mode: 'insensitive' }
  if (email) where.customer = { email: { equals: email.toLowerCase(), mode: 'insensitive' } }

  if (Object.keys(where).length === 0) {
    console.error(
      'En az bir eşleştirme kriteri verin: --email / --owner / --slug / --license / --id\n' +
        'Örnek: npm run cleanup:saas-membership -- --email woontegra@hotmail.com',
    )
    process.exitCode = 1
    return
  }

  const rows = await prisma.customerSaasMembership.findMany({
    where,
    include: {
      customer: { select: { email: true, name: true } },
      _count: { select: { renewalOrderItems: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (rows.length === 0) {
    console.log('Eşleşen SaaS üyelik kaydı bulunamadı. Kriterler:', {
      email,
      owner,
      slug,
      license,
      id,
    })
    return
  }

  console.log(`\nEşleşen ${rows.length} üyelik kaydı:`)
  for (const r of rows) {
    console.log(
      JSON.stringify(
        {
          id: r.id,
          musteri: r.customer?.email ?? '(yok)',
          musteriAd: r.customer?.name ?? '(yok)',
          productCode: r.productCode,
          tenantSlug: r.tenantSlug,
          licenseKey: r.licenseKey,
          ownerEmail: r.ownerEmail,
          status: r.status,
          licenseEndDate: r.licenseEndDate.toISOString(),
          bagliSiparisKalemi: r._count.renewalOrderItems,
        },
        null,
        2,
      ),
    )
  }

  if (!apply) {
    console.log(
      `\n[DRY-RUN] Değişiklik yapılmadı. Uygulamak için --apply ekleyin.\n` +
        `Seçilen işlem: ${action === 'delete' ? 'SİL (kaydı kaldır)' : 'İPTAL (status=SUSPENDED)'}\n`,
    )
    return
  }

  const ids = rows.map((r) => r.id)

  if (action === 'cancel') {
    const res = await prisma.customerSaasMembership.updateMany({
      where: { id: { in: ids } },
      data: { status: CustomerSaasMembershipStatus.SUSPENDED },
    })
    console.log(`\n[UYGULANDI] ${res.count} üyelik askıya alındı (status=SUSPENDED).`)
    return
  }

  const res = await prisma.customerSaasMembership.deleteMany({
    where: { id: { in: ids } },
  })
  console.log(
    `\n[UYGULANDI] ${res.count} üyelik silindi. Bağlı sipariş kalemlerinin membership bağı null yapıldı (sipariş geçmişi korunur).`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => void prisma.$disconnect())
