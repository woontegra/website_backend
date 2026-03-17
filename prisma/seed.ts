import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  await prisma.faq.deleteMany()
  await prisma.sectionItem.deleteMany()
  await prisma.section.deleteMany()
  await prisma.page.deleteMany()
  await prisma.user.deleteMany()

  const passwordHash = await bcrypt.hash('Admin123!', 10)
  await prisma.user.create({
    data: { email: 'admin@woontegra.com', passwordHash, role: 'admin' },
  })

  /* ——— HOME ——— */
  await prisma.page.create({
    data: {
      slug: 'home',
      title: 'Ana Sayfa',
      sections: {
        create: [
          {
            type: 'hero',
            order: 0,
            content: {
              headlinePrefix: 'Woontegra ile ',
              headlineGradient: 'Yazılım, Dijital Ticaret ve Teknoloji Çözümleri',
              subtitle:
                'Yazılım geliştirme, SaaS ürünleri, e-ticaret altyapıları, dijital hizmetler ve marka danışmanlığını tek çatı altında sunan modern teknoloji şirketi.',
              primaryCta: { label: 'Hizmetleri İncele', href: '/hizmetler' },
              secondaryCta: { label: 'İletişime Geç', href: '/iletisim' },
              showMockup: true,
              badges: [
                { label: 'Modern altyapı', icon: 'infra' },
                { label: 'Çok yönlü dijital üretim', icon: 'multi' },
                { label: 'Kurumsal çözüm ortağı', icon: 'partner' },
              ],
            },
          },
          {
            type: 'trust_grid',
            order: 1,
            title: 'Güven ve yetkinlik',
            content: { subtitle: 'Teknolojide çok yönlü üretim, tek sorumlu çözüm ortağı.' },
            items: {
              create: [
                {
                  title: 'Çok yönlü dijital yapı',
                  description: 'Yazılımdan e-ticarete, marka vekilliğinden oyun geliştirmeye tek ekosistem.',
                  order: 0,
                },
                {
                  title: 'Farklı sektörlerde üretim',
                  description: 'Kurumsal, startup ve bireysel müşterilere özelleştirilmiş çözümler.',
                  order: 1,
                },
                {
                  title: 'Modern altyapı',
                  description: 'Güncel teknolojiler, güvenli ve ölçeklenebilir mimari.',
                  order: 2,
                },
              ],
            },
          },
          {
            type: 'card_grid',
            order: 2,
            title: 'Hizmetlerimiz',
            content: {
              subtitle: 'Yazılımdan marka vekilliğine, e-ticaretten oyun geliştirmeye geniş bir hizmet yelpazesi.',
              footerCta: { label: 'Tüm hizmetleri görüntüle', href: '/hizmetler' },
            },
            items: {
              create: [
                { title: 'Yazılım Geliştirme', description: 'Kurumsal yazılım, masaüstü ve web uygulamaları.', icon: 'code', extraData: { href: '/hizmetler/yazilim-gelistirme' }, order: 0 },
                { title: 'Web Tasarım', description: 'Modern, hızlı ve dönüşüm odaklı kurumsal web siteleri.', icon: 'globe', extraData: { href: '/hizmetler/web-tasarim' }, order: 1 },
                { title: 'E-Ticaret', description: 'WooCommerce ve ödeme entegrasyonları.', icon: 'cart', extraData: { href: '/hizmetler/e-ticaret' }, order: 2 },
                { title: 'SaaS', description: 'Abonelik tabanlı ürünler ve bulut uygulamaları.', icon: 'cloud', extraData: { href: '/hizmetler/saas' }, order: 3 },
                { title: 'Marka & Patent', description: 'Marka başvurusu ve fikri mülkiyet danışmanlığı.', icon: 'scale', extraData: { href: '/hizmetler/marka-patent-vekilligi' }, order: 4 },
                { title: 'Dijital Danışmanlık', description: 'Dijital dönüşüm ve teknoloji stratejisi.', icon: 'lightbulb', extraData: { href: '/hizmetler/dijital-danismanlik' }, order: 5 },
                { title: 'Oyun Geliştirme', description: 'Mobil ve web oyun projeleri.', icon: 'gamepad', extraData: { href: '/hizmetler/oyun-gelistirme' }, order: 6 },
                { title: 'Dijital Altyapı', description: 'API, entegrasyon ve sistem mimarileri.', icon: 'server', extraData: { href: '/hizmetler/dijital-altyapi' }, order: 7 },
              ],
            },
          },
          {
            type: 'sub_brands',
            order: 3,
            title: 'Çözümler ve alt markalar',
            content: {
              subtitle: 'Woontegra çatısı altında ürünler ve markalar.',
              footerCta: { label: 'Tüm çözümleri görüntüle', href: '/cozumler' },
            },
            items: {
              create: [
                { title: 'Bilirkişi Hesaplama Programı', description: 'Bilirkişi raporları için hesaplama süreçlerini dakikalar içinde tamamlayan profesyonel yazılım.', extraData: { href: '/cozumler/bilirkisi-hesaplama' }, order: 0 },
                { title: 'Datça Topikal', description: 'Doğal ve topikal ürünler e-ticaret markası.', extraData: { href: '/cozumler/datca-topikal' }, order: 1 },
                { title: 'Dijital Ürünler & Oyun Projeleri', description: 'Geliştirmekte olduğumuz oyun ve dijital ürün projeleri.', extraData: { href: '/hizmetler/oyun-gelistirme' }, order: 2 },
              ],
            },
          },
          {
            type: 'why_grid',
            order: 4,
            title: 'Neden Woontegra?',
            content: { subtitle: 'Teknolojide çok yönlü yetkinlik ve kurumsal güveni bir arada sunuyoruz.' },
            items: {
              create: [
                { title: 'Tek çatı, çok alan', description: 'Yazılım, e-ticaret, marka ve dijital ürün ihtiyaçlarınızı tek adreste topluyoruz.', icon: 'layers', order: 0 },
                { title: 'Teknoloji odaklı üretim', description: 'Güncel stack, temiz kod ve sürdürülebilir altyapı ile projeler üretiyoruz.', icon: 'code', order: 1 },
                { title: 'Kurumsal güven', description: 'Süreçler şeffaf, iletişim düzenli; teslimatta tutarlılık önceliğimiz.', icon: 'shield', order: 2 },
                { title: 'Büyüme odaklı yaklaşım', description: 'Projelerinizi sadece teslim etmiyoruz; ölçeklenebilir büyüme için tasarlıyoruz.', icon: 'growth', order: 3 },
              ],
            },
          },
          {
            type: 'process_steps',
            order: 5,
            title: 'Süreç nasıl işliyor?',
            content: { subtitle: 'Şeffaf ve düzenli bir iş birliği süreciyle projelerinizi hayata geçiriyoruz.' },
            items: {
              create: [
                { title: 'İhtiyaç analizi', description: 'Hedeflerinizi ve gereksinimlerinizi birlikte netleştiriyoruz.', icon: '01', order: 0 },
                { title: 'Teklif ve planlama', description: 'Kapsam, süre ve bütçe çerçevesinde teklif sunuyoruz.', icon: '02', order: 1 },
                { title: 'Geliştirme ve tasarım', description: 'Süreç boyunca düzenli paylaşım ve revizyon imkânı.', icon: '03', order: 2 },
                { title: 'Teslim ve destek', description: 'Teslim sonrası eğitim, bakım ve destek sunuyoruz.', icon: '04', order: 3 },
              ],
            },
          },
          {
            type: 'stats_row',
            order: 6,
            items: {
              create: [
                { title: '50+', description: 'Tamamlanan proje', order: 0 },
                { title: '8+', description: 'Hizmet alanı', order: 1 },
                { title: '100%', description: 'Müşteri odaklı süreç', order: 2 },
              ],
            },
          },
          {
            type: 'cta',
            order: 7,
            content: {
              title: 'Projenizi birlikte hayata geçirelim',
              subtitle: 'Hangi alanda destek almak istediğinizi söyleyin, size özel teklif hazırlayalım.',
              primaryCta: { label: 'İletişime Geç', href: '/iletisim' },
              secondaryCta: { label: 'Teklif Al', href: '/teklif-al' },
            },
          },
        ],
      },
    },
  })

  /* ——— HİZMETLER ——— */
  await prisma.page.create({
    data: {
      slug: 'hizmetler',
      title: 'Hizmetlerimiz',
      sections: {
        create: [
          {
            type: 'page_hero',
            order: 0,
            content: {
              title: 'İşinizi Büyüten Teknoloji Hizmetleri',
              subtitle:
                'Yazılım geliştirmeden e-ticarete, SaaS ürünlerden marka danışmanlığına kadar tüm dijital süreçlerinizi tek çatı altında yönetiyoruz.',
              badges: ['Tek ekip', 'Uçtan uca çözüm', 'Modern altyapı'],
            },
          },
          {
            type: 'service_cards',
            order: 1,
            content: { filterCategories: ['tumu', 'yazilim', 'e-ticaret', 'danismanlik', 'marka-patent'] },
            items: {
              create: [
                { title: 'Yazılım Geliştirme', description: 'Kurumsal yazılım, masaüstü ve web uygulamaları ile ölçeklenebilir altyapılar.', icon: 'code', extraData: { category: 'yazilim', features: ['Ölçeklenebilir altyapı', 'Modern teknoloji stack', 'Performans odaklı yapı'], href: '/hizmetler/yazilim-gelistirme' }, order: 0 },
                { title: 'Web Tasarım', description: 'Modern, hızlı ve dönüşüm odaklı kurumsal web siteleri ve dijital çözümler.', icon: 'globe', extraData: { category: 'yazilim', features: ['Responsive ve SEO uyumlu', 'Hızlı ve güvenli altyapı', 'Kullanıcı odaklı arayüz'], href: '/hizmetler/web-tasarim' }, order: 1 },
                { title: 'E-Ticaret Çözümleri', description: 'WooCommerce altyapıları, ödeme sistemleri ve dijital ticaret altyapıları.', icon: 'cart', extraData: { category: 'e-ticaret', features: ['Ödeme ve kargo entegrasyonu', 'Stok ve sipariş yönetimi', 'Dönüşüm odaklı mağaza'], href: '/hizmetler/e-ticaret' }, order: 2 },
                { title: 'SaaS Ürün Geliştirme', description: 'Abonelik tabanlı yazılım ürünleri ve bulut tabanlı iş uygulamaları.', icon: 'cloud', extraData: { category: 'yazilim', features: ['Çok kiracılı mimari', 'Abonelik ve faturalandırma', 'Bulut tabanlı altyapı'], href: '/hizmetler/saas' }, order: 3 },
                { title: 'Marka & Patent Vekilliği', description: 'Marka başvurusu, takip, itiraz süreçleri ve fikri mülkiyet danışmanlığı.', icon: 'scale', extraData: { category: 'marka-patent', features: ['Resmi marka vekili desteği', 'Başvuru ve süreç takibi', 'Fikri mülkiyet danışmanlığı'], href: '/hizmetler/marka-patent-vekilligi' }, order: 4 },
                { title: 'Dijital Danışmanlık', description: 'Dijital dönüşüm, süreç iyileştirme ve teknoloji stratejisi danışmanlığı.', icon: 'lightbulb', extraData: { category: 'danismanlik', features: ['Süreç analizi ve strateji', 'Teknoloji seçimi', 'Roadmap ve uygulama desteği'], href: '/hizmetler/dijital-danismanlik' }, order: 5 },
                { title: 'Oyun Geliştirme', description: 'Mobil ve web tabanlı oyun projeleri ile dijital ürün geliştirme.', icon: 'gamepad', extraData: { category: 'diger', features: ['Mobil ve web oyun', 'Prototip ve MVP', 'Yayın ve monetizasyon'], href: '/hizmetler/oyun-gelistirme' }, order: 6 },
                { title: 'Dijital Ürün ve Sistem Altyapıları', description: 'API, entegrasyon ve ölçeklenebilir sistem mimarileri.', icon: 'server', extraData: { category: 'yazilim', features: ['API ve entegrasyon', 'Mikroservis mimarisi', 'Güvenlik ve performans'], href: '/hizmetler/dijital-altyapi' }, order: 7 },
              ],
            },
          },
          {
            type: 'cta',
            order: 2,
            content: {
              title: 'Projenizi birlikte hayata geçirelim',
              subtitle: 'Kısa bir brief ile size en uygun çözümü sunalım.',
              primaryCta: { label: 'Teklif Al', href: '/teklif-al' },
              secondaryCta: { label: 'İletişime Geç', href: '/iletisim' },
              variant: 'gradient_blue',
            },
          },
        ],
      },
    },
  })

  /* ——— YAZILIM GELİŞTİRME ——— */
  await prisma.page.create({
    data: {
      slug: 'yazilim-gelistirme',
      title: 'Yazılım Geliştirme',
      faqs: {
        create: [
          { question: 'Hangi teknolojiler kullanılıyor?', answer: 'Proje ihtiyacına göre React, Node.js, .NET, Python ve uygun veritabanları kullanıyoruz.', order: 0 },
          { question: 'Teslim süresi ne kadar?', answer: 'Kapsam ve karmaşıklığa göre değişir; net süre teklif aşamasında belirlenir.', order: 1 },
        ],
      },
      sections: {
        create: [
          {
            type: 'service_hero',
            order: 0,
            content: {
              title: 'Ölçeklenebilir ve Güçlü Yazılım Çözümleri',
              subtitle: 'Kurumunuza özel, modern teknolojilerle geliştirilen, performans ve sürdürülebilirlik odaklı yazılım çözümleri sunuyoruz.',
              showMockup: true,
              primaryCta: { label: 'Teklif Al', href: '/teklif-al' },
              secondaryCta: { label: 'İletişime Geç', href: '/iletisim' },
            },
          },
          {
            type: 'overview',
            order: 1,
            title: 'Genel Bakış',
            content: {
              body: 'Kurumsal yazılım, masaüstü ve web uygulamaları ile ölçeklenebilir altyapılar geliştiriyoruz. Modern teknolojiler ve temiz kod prensipleriyle sürdürülebilir projeler üretiyoruz.',
            },
          },
          {
            type: 'target_audience',
            order: 2,
            title: 'Kimler için uygun?',
            items: {
              create: [
                { title: 'Kurumsal firmalar', description: 'Büyük ölçekli projeler için özelleştirilmiş yazılım çözümleri.', icon: 'building', order: 0 },
                { title: "Startup'lar", description: 'Hızlı büyüme ve MVP’den ürün ölçeklemeye teknik ortaklık.', icon: 'rocket', order: 1 },
                { title: "KOBİ'ler", description: 'İş süreçlerinize uygun, uygun maliyetli yazılım geliştirme.', icon: 'kobi', order: 2 },
                { title: 'Kamu ve özel sektör', description: 'Kamu ve özel sektör projeleri için güvenilir altyapı.', icon: 'gov', order: 3 },
              ],
            },
          },
          {
            type: 'features_list',
            order: 3,
            title: 'Neler sunuyoruz?',
            items: {
              create: [
                { title: 'Özelleştirilmiş yazılım geliştirme', order: 0 },
                { title: 'API ve entegrasyon', order: 1 },
                { title: 'Bakım ve destek', order: 2 },
                { title: 'Teknik danışmanlık', order: 3 },
              ],
            },
          },
          {
            type: 'process_timeline',
            order: 4,
            title: 'Süreç',
            items: {
              create: [
                { title: 'İhtiyaç analizi', order: 0 },
                { title: 'Mimari ve planlama', order: 1 },
                { title: 'Geliştirme', order: 2 },
                { title: 'Test & teslim', order: 3 },
              ],
            },
          },
          { type: 'faq_block', order: 5, title: 'Sık sorulan sorular', content: {} },
          {
            type: 'cta',
            order: 6,
            content: {
              title: 'Projenizi birlikte hayata geçirelim',
              subtitle: 'Kısa bir görüşme ile ihtiyacınızı analiz edelim ve size en doğru çözümü sunalım.',
              primaryCta: { label: 'Teklif Al', href: '/teklif-al' },
              secondaryCta: { label: 'İletişime Geç', href: '/iletisim' },
              variant: 'gradient_blue',
            },
          },
        ],
      },
    },
  })

  /* ——— Diğer hizmet detayları (minimal: service_hero + overview + cta) ——— */
  const otherServices: { slug: string; title: string; overview: string }[] = [
    { slug: 'web-tasarim', title: 'Web Tasarım', overview: 'Modern, hızlı ve dönüşüm odaklı kurumsal web siteleri ve dijital çözümler tasarlıyoruz. Responsive, SEO uyumlu ve kullanıcı odaklı arayüzler sunuyoruz.' },
    { slug: 'e-ticaret', title: 'E-Ticaret Çözümleri', overview: 'WooCommerce ve modern e-ticaret altyapıları ile mağaza kurulumu, ödeme sistemleri entegrasyonu ve ürün/kategori yönetimi sunuyoruz.' },
    { slug: 'saas', title: 'SaaS Ürün Geliştirme', overview: 'Abonelik tabanlı yazılım ürünleri ve bulut tabanlı iş uygulamaları geliştiriyoruz.' },
    { slug: 'marka-patent-vekilligi', title: 'Marka & Patent Vekilliği', overview: 'Resmi marka vekili desteğiyle marka başvurusu, takip, itiraz süreçleri ve fikri mülkiyet danışmanlığı sunuyoruz.' },
    { slug: 'dijital-danismanlik', title: 'Dijital Danışmanlık', overview: 'Dijital dönüşüm, süreç iyileştirme ve teknoloji stratejisi danışmanlığı veriyoruz.' },
    { slug: 'oyun-gelistirme', title: 'Oyun Geliştirme', overview: 'Mobil ve web tabanlı oyun projeleri ile dijital ürün geliştirme yapıyoruz.' },
    { slug: 'dijital-altyapi', title: 'Dijital Ürün ve Sistem Altyapıları', overview: 'API, entegrasyon ve ölçeklenebilir sistem mimarileri kuruyoruz.' },
  ]
  for (const s of otherServices) {
    await prisma.page.create({
      data: {
        slug: s.slug,
        title: s.title,
        sections: {
          create: [
            {
              type: 'service_hero',
              order: 0,
              content: {
                title: s.title,
                subtitle: s.overview.slice(0, 120) + '…',
                showMockup: true,
                primaryCta: { label: 'Teklif Al', href: '/teklif-al' },
                secondaryCta: { label: 'İletişime Geç', href: '/iletisim' },
              },
            },
            { type: 'overview', order: 1, title: 'Genel Bakış', content: { body: s.overview } },
            {
              type: 'cta',
              order: 2,
              content: {
                title: 'Projenizi birlikte hayata geçirelim',
                subtitle: 'Kısa bir görüşme ile ihtiyacınızı analiz edelim.',
                primaryCta: { label: 'Teklif Al', href: '/teklif-al' },
                secondaryCta: { label: 'İletişime Geç', href: '/iletisim' },
                variant: 'gradient_blue',
              },
            },
          ],
        },
      },
    })
  }

  /* ——— Hakkımızda ——— */
  await prisma.page.create({
    data: {
      slug: 'hakkimizda',
      title: 'Hakkımızda',
      sections: {
        create: [
          {
            type: 'page_hero',
            order: 0,
            content: {
              title: 'Hakkımızda',
              subtitle: 'Woontegra; yazılım, dijital ticaret ve teknoloji çözümlerinde çok yönlü üretim yapan bir teknoloji şirketidir.',
            },
          },
          {
            type: 'rich_text',
            order: 1,
            content: {
              html: `<p class="text-lg text-slate-600 mb-6">Vizyonumuz, farklı sektörlerdeki ihtiyaçları tek çatı altında karşılayan, güvenilir ve modern bir teknoloji ortağı olmaktır. Yazılım geliştirme, SaaS ürünleri, e-ticaret altyapıları, web tasarım, marka ve patent vekilliği, oyun ve dijital ürün geliştirme alanlarında hizmet veriyoruz.</p>
<p class="text-slate-600">Teknoloji, üretim ve büyüme odaklı bir yaklaşımla projeleri sadece teslim etmiyor; ölçeklenebilir, sürdürülebilir ve müşteri odaklı çözümler sunuyoruz.</p>`,
            },
          },
          {
            type: 'trust_grid',
            order: 2,
            title: '',
            content: { subtitle: '' },
            items: {
              create: [
                { title: 'Misyon', description: 'Dijital dönüşüm ihtiyaçlarını tek adreste, güvenilir ve modern çözümlerle karşılamak.', order: 0 },
                { title: 'Vizyon', description: "Türkiye'de çok yönlü teknoloji şirketi olarak tanınan, güven veren bir marka olmak.", order: 1 },
                { title: 'Değerler', description: 'Şeffaflık, kalite, müşteri odaklılık ve sürekli gelişim.', order: 2 },
              ],
            },
          },
        ],
      },
    },
  })

  const stubSlugs = [
    { slug: 'cozumler', title: 'Çözümler' },
    { slug: 'bilirkisi-hesaplama', title: 'Bilirkişi Hesaplama' },
    { slug: 'marka-patent', title: 'Marka & Patent' },
    { slug: 'eticaret', title: 'E-Ticaret' },
    { slug: 'oyun-ve-dijital-urunler', title: 'Oyun ve Dijital Ürünler' },
    { slug: 'kvkk', title: 'KVKK' },
    { slug: 'gizlilik', title: 'Gizlilik' },
    { slug: 'cerez-politikasi', title: 'Çerez Politikası' },
    { slug: 'kullanim-sartlari', title: 'Kullanım Şartları' },
  ]
  for (const st of stubSlugs) {
    await prisma.page.create({
      data: {
        slug: st.slug,
        title: st.title,
        sections: {
          create: [
            {
              type: 'page_hero',
              order: 0,
              content: { title: st.title, subtitle: 'İçeriği yönetim panelinden düzenleyebilirsiniz.' },
            },
            {
              type: 'rich_text',
              order: 1,
              content: {
                html: `<p class="text-slate-600 max-w-3xl">Bu sayfa CMS ile yönetilmektedir. Admin panelinden <strong>Sayfalar</strong> bölümünden detaylı içerik ekleyin.</p>`,
              },
            },
          ],
        },
      },
    })
  }

  await prisma.page.create({
    data: {
      slug: 'sss',
      title: 'Sık Sorulan Sorular',
      faqs: {
        create: [
          { question: 'Hangi hizmetleri sunuyorsunuz?', answer: 'Yazılım geliştirme, web tasarım, e-ticaret, SaaS, marka ve patent vekilliği, oyun geliştirme ve dijital danışmanlık hizmetleri sunuyoruz.', order: 0 },
          { question: 'Proje süreci nasıl işliyor?', answer: 'İhtiyaç analizi, teklif ve planlama, geliştirme ve teslim aşamalarıyla ilerliyoruz.', order: 1 },
          { question: 'Marka başvurusu ne kadar sürer?', answer: "Resmi süreç TPE'ye bağlıdır. Başvuru hazırlığı ve takip hizmetimizle süreci yönetiyoruz.", order: 2 },
          { question: 'Yazılım projelerinde hangi teknolojiler kullanılıyor?', answer: 'Proje ihtiyacına göre React, Node.js, .NET, Python ve uygun veritabanları kullanıyoruz.', order: 3 },
          { question: 'Teslim sonrası bakım ve destek var mı?', answer: 'Evet. Bakım, güncelleme ve teknik destek paketleri sunuyoruz.', order: 4 },
        ],
      },
      sections: {
        create: [
          {
            type: 'page_hero',
            order: 0,
            content: { title: 'Sık Sorulan Sorular', subtitle: 'Merak ettiklerinize kısa yanıtlar.' },
          },
          { type: 'faq_block', order: 1, title: 'Sorular', content: {} },
        ],
      },
    },
  })

  await prisma.page.create({
    data: {
      slug: 'blog',
      title: 'Blog',
      sections: {
        create: [
          { type: 'page_hero', order: 0, content: { title: 'Blog', subtitle: 'Teknoloji ve dijital üretim üzerine notlar.' } },
          { type: 'blog_api', order: 1, title: 'Yazılar', content: { emptyMessage: 'Henüz yayınlanmış yazı yok.' } },
        ],
      },
    },
  })

  await prisma.page.create({
    data: {
      slug: 'iletisim',
      title: 'İletişim',
      sections: {
        create: [
          {
            type: 'page_hero',
            order: 0,
            content: { title: 'İletişim', subtitle: 'Sorularınız veya proje talepleriniz için bize ulaşın.' },
          },
          {
            type: 'contact_form',
            order: 1,
            content: {
              nameLabel: 'Ad Soyad',
              emailLabel: 'E-posta',
              messageLabel: 'Mesaj',
              namePlaceholder: 'Adınız Soyadınız',
              emailPlaceholder: 'ornek@email.com',
              messagePlaceholder: 'Mesajınız...',
              submitLabel: 'Gönder',
              successMessage: 'Mesajınız alındı. En kısa sürede dönüş yapacağız.',
              sidebarTitleWhatsapp: 'WhatsApp',
              sidebarWhatsapp: '+90 XXX XXX XX XX',
              sidebarWhatsappHref: 'https://wa.me/90XXXXXXXXXX',
              sidebarTitleEmail: 'E-posta',
              sidebarEmail: 'info@woontegra.com',
              sidebarTitlePhone: 'Telefon',
              sidebarPhone: '+90 XXX XXX XX XX',
              sidebarTitleAddress: 'Adres',
              sidebarAddress: 'Örnek Mah. Örnek Sok. No: X, İstanbul',
              mapCaption: 'Harita alanı',
            },
          },
        ],
      },
    },
  })

  await prisma.page.create({
    data: {
      slug: 'teklif-al',
      title: 'Teklif Al',
      sections: {
        create: [
          {
            type: 'page_hero',
            order: 0,
            content: {
              title: 'Teklif Al',
              subtitle: 'Proje türü ve hizmet seçiminizi yapın, kısa brief ve iletişim bilgilerinizi paylaşın.',
            },
          },
          {
            type: 'quote_form',
            order: 1,
            content: {
              projectTypes: ['Web sitesi', 'E-ticaret', 'Yazılım / SaaS', 'Marka tescil', 'Oyun / Dijital ürün', 'Danışmanlık', 'Diğer'],
              serviceOptions: ['Yazılım Geliştirme', 'Web Tasarım', 'E-Ticaret', 'SaaS', 'Marka & Patent', 'Oyun Geliştirme', 'Dijital Danışmanlık'],
              projectTypeLabel: 'Proje türü',
              serviceLabel: 'Hizmet',
              servicePlaceholder: 'Seçin',
              briefLabel: 'Kısa brief / ihtiyaç',
              briefPlaceholder: 'Projenizi kısaca anlatın...',
              nameLabel: 'Ad Soyad',
              emailLabel: 'E-posta',
              phoneLabel: 'Telefon',
              nextLabel: 'İleri',
              backLabel: 'Geri',
              submitLabel: 'Gönder',
              successTitle: 'Talebiniz alındı',
              successMessage: 'En kısa sürede sizinle iletişime geçeceğiz.',
            },
          },
        ],
      },
    },
  })

  await prisma.page.create({
    data: {
      slug: 'datca-topikal',
      title: 'Datça Topikal',
      sections: {
        create: [
          {
            type: 'page_hero',
            order: 0,
            content: { title: 'Datça Topikal', subtitle: 'Doğal ve topikal ürünler.' },
          },
          {
            type: 'rich_text',
            order: 1,
            content: { html: '<p class="text-slate-600">Çözüm detayı CMS üzerinden düzenlenebilir.</p>' },
          },
        ],
      },
    },
  })

  console.log('Seed OK. Admin: admin@woontegra.com / Admin123!')
  console.log('Pages:', await prisma.page.count())
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
