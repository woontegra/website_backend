import path from 'path'
import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

config({ path: path.resolve(process.cwd(), '.env') })
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(path.join(process.cwd(), 'scripts/resolve-database-url.cjs')).applyToProcessEnv()
} catch {
  /* */
}

const dbUrl = process.env.DATABASE_URL?.trim() ?? ''
if (
  !dbUrl ||
  (!dbUrl.toLowerCase().startsWith('postgresql://') && !dbUrl.toLowerCase().startsWith('postgres://'))
) {
  console.error('Geçerli Postgres URL yok. backend/.env içinde DATABASE_URL ayarlayın.')
  process.exit(1)
}

const prisma = new PrismaClient()

// Builder JSON format for pages
function getBuilderContent(heroTitle: string, heroSubtitle: string, buttonText = 'Başlayın', buttonLink = '#') {
  return JSON.stringify({
    ROOT: {
      type: { resolvedName: 'Container' },
      isCanvas: true,
      props: {},
      displayName: 'Container',
      custom: {},
      hidden: false,
      nodes: ['hero-1'],
      linkedNodes: {},
    },
    'hero-1': {
      type: { resolvedName: 'Hero' },
      isCanvas: false,
      props: {
        title: heroTitle,
        subtitle: heroSubtitle,
        buttonText,
        buttonLink,
        backgroundImage: '',
      },
      displayName: 'Hero',
      custom: {},
      parent: 'ROOT',
      hidden: false,
      nodes: [],
      linkedNodes: {},
    },
  })
}

function stub(title: string) {
  return `<h1 class="text-3xl font-bold text-slate-900">${title}</h1><p class="mt-4 text-slate-600">İçeriği <strong>Admin → Sayfalar</strong> üzerinden düzenleyin.</p>`
}

async function main() {
  await prisma.menuItem.deleteMany()
  await prisma.menu.deleteMany()
  await prisma.post.deleteMany()
  await prisma.postCategory.deleteMany()
  await prisma.page.deleteMany()
  await prisma.contactMessage.deleteMany()
  await prisma.brand.deleteMany()
  await prisma.service.deleteMany()
  await prisma.user.deleteMany()

  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? 'Admin123!'
  const passwordHash = await bcrypt.hash(adminPassword, 10)
  await prisma.user.create({
    data: { email: 'info@woontegra.com', passwordHash, role: 'admin' },
  })

  await prisma.service.createMany({
    data: [
      {
        title: 'Web Geliştirme',
        description: 'Modern ve responsive web siteleri geliştiriyoruz. React, Vue, Angular gibi güncel teknolojilerle profesyonel çözümler sunuyoruz.',
        icon: 'Code',
      },
      {
        title: 'Mobil Uygulama',
        description: 'iOS ve Android platformları için native ve cross-platform mobil uygulamalar geliştiriyoruz.',
        icon: 'Smartphone',
      },
      {
        title: 'E-Ticaret',
        description: 'Güçlü e-ticaret platformları ile online satış yapmanızı sağlıyoruz. Ödeme entegrasyonları ve stok yönetimi dahil.',
        icon: 'ShoppingCart',
      },
      {
        title: 'SaaS Çözümleri',
        description: 'Bulut tabanlı yazılım hizmetleri geliştiriyoruz. Ölçeklenebilir ve güvenli SaaS ürünleri.',
        icon: 'Cloud',
      },
      {
        title: 'Dijital Danışmanlık',
        description: 'Dijital dönüşüm süreçlerinizde yanınızdayız. Strateji belirleme ve uygulama desteği.',
        icon: 'Lightbulb',
      },
      {
        title: 'Marka & Patent',
        description: 'Marka tescil ve patent başvuru süreçlerinizi yönetiyoruz. Fikri mülkiyet haklarınızı koruyoruz.',
        icon: 'Shield',
      },
    ],
  })

  await prisma.brand.createMany({
    data: [
      {
        name: 'Bilirkişi Hesaplama',
        description: 'Aktüerya ve bilirkişi hesaplama platformu. Fazla mesai, kıdem tazminatı ve ihbar tazminatı hesaplamaları.',
        image: '/images/brand-bilirkisi.jpg',
        url: 'https://bilirkisihesap.com',
      },
      {
        name: 'Optimoon',
        description: 'Dijital pazarlama ve SEO optimizasyon platformu. Web sitenizi arama motorlarında üst sıralara taşıyın.',
        image: '/images/brand-optimoon.jpg',
        url: 'https://optimoon.com',
      },
      {
        name: 'Datça Tropikal',
        description: 'Datça bölgesine özel turizm ve konaklama rezervasyon sistemi. Tatil villaları ve oteller.',
        image: '/images/brand-datca.jpg',
        url: 'https://datcatropikal.com',
      },
    ],
  })

  const pageSeeds: { slug: string; title: string; content: string }[] = [
    { 
      slug: 'home', 
      title: 'Ana Sayfa', 
      content: getBuilderContent(
        'Woontegra',
        'Yazılım, SaaS ve e-ticaret çözümleri ile dijital dönüşümünüzü gerçekleştirin',
        'Hizmetlerimiz',
        '/hizmetler'
      )
    },
    { 
      slug: 'hakkimizda', 
      title: 'Hakkımızda', 
      content: getBuilderContent(
        'Hakkımızda',
        'Dijital çözümler ve yazılım geliştirme konusunda uzman ekibimizle yanınızdayız',
        'İletişime Geç',
        '/iletisim'
      )
    },
    { 
      slug: 'iletisim', 
      title: 'İletişim', 
      content: getBuilderContent(
        'İletişim',
        'Projeleriniz için bizimle iletişime geçin',
        'Teklif Al',
        '/teklif-al'
      )
    },
    { slug: 'hizmetler', title: 'Hizmetlerimiz', content: stub('Hizmetlerimiz') },
    { slug: 'yazilim-gelistirme', title: 'Yazılım Geliştirme', content: stub('Yazılım Geliştirme') },
    { slug: 'web-tasarim', title: 'Web Tasarım', content: stub('Web Tasarım') },
    { slug: 'e-ticaret', title: 'E-Ticaret Çözümleri', content: stub('E-Ticaret Çözümleri') },
    { slug: 'saas', title: 'SaaS Ürün Geliştirme', content: stub('SaaS Ürün Geliştirme') },
    { slug: 'marka-patent-vekilligi', title: 'Marka & Patent Vekilliği', content: stub('Marka & Patent Vekilliği') },
    { slug: 'dijital-danismanlik', title: 'Dijital Danışmanlık', content: stub('Dijital Danışmanlık') },
    { slug: 'oyun-gelistirme', title: 'Oyun Geliştirme', content: stub('Oyun Geliştirme') },
    { slug: 'dijital-altyapi', title: 'Dijital Ürün ve Sistem Altyapıları', content: stub('Dijital Altyapı') },
    { slug: 'cozumler', title: 'Çözümler', content: stub('Çözümler') },
    { slug: 'bilirkisi-hesaplama', title: 'Bilirkişi Hesaplama', content: stub('Bilirkişi Hesaplama') },
    { slug: 'marka-patent', title: 'Marka & Patent', content: stub('Marka & Patent') },
    { slug: 'eticaret', title: 'E-Ticaret', content: stub('E-Ticaret') },
    { slug: 'oyun-ve-dijital-urunler', title: 'Oyun ve Dijital Ürünler', content: stub('Oyun ve Dijital Ürünler') },
    { slug: 'kvkk', title: 'KVKK', content: stub('KVKK') },
    { slug: 'gizlilik', title: 'Gizlilik', content: stub('Gizlilik') },
    { slug: 'cerez-politikasi', title: 'Çerez Politikası', content: stub('Çerez Politikası') },
    { slug: 'kullanim-sartlari', title: 'Kullanım Şartları', content: stub('Kullanım Şartları') },
    { slug: 'sss', title: 'Sık Sorulan Sorular', content: stub('Sık Sorulan Sorular') },
    { slug: 'blog', title: 'Blog', content: stub('Blog') },
    { slug: 'teklif-al', title: 'Teklif Al', content: stub('Teklif Al') },
    { slug: 'datca-topikal', title: 'Datça Topikal', content: stub('Datça Topikal') },
  ]

  for (const p of pageSeeds) {
    await prisma.page.create({
      data: { ...p, status: 'published' },
    })
  }

  await prisma.postCategory.createMany({
    data: [
      { slug: 'yazilim', name: 'Yazılım' },
      { slug: 'e-ticaret', name: 'E-Ticaret' },
      { slug: 'genel', name: 'Genel' },
    ],
  })
  await prisma.menu.createMany({
    data: [
      { name: 'Üst menü', location: 'header' },
      { name: 'Alt menü', location: 'footer' },
    ],
  })

  // PageContent - Mevcut sayfa içerikleri
  await prisma.pageContent.deleteMany()
  
  await prisma.pageContent.createMany({
    data: [
      {
        pageKey: 'home',
        content: JSON.stringify({
          heroTag: 'Teknoloji & Yazılım',
          heroTitle: 'Woontegra ile Yazılım, Dijital Hizmetler ve Ticaret Tek Yapıda',
          heroSubtitle: 'Woontegra, yazılım geliştirme, e-ticaret sistemleri ve SaaS ürünleri ile işletmeler için sürdürülebilir dijital altyapılar kurar.',
          heroButton1Text: 'Çözümleri İncele',
          heroButton2Text: 'İletişime Geç',
          
          introParagraph1: 'Modern işletmeler sadece bir web sitesine değil, doğru kurgulanmış bir dijital sisteme ihtiyaç duyar.',
          introParagraph2: 'Woontegra, fikir aşamasından canlı yayına kadar tüm süreci planlar, geliştirir ve yönetir.',
          
          servicesTitle: 'İşinizi Büyüten Dijital Çözümler',
          servicesSubtitle: 'Tam kapsamlı teknoloji hizmetleri',
          service1Title: 'Yazılım Geliştirme',
          service1Desc: 'İşletmenize özel, performans odaklı ve ölçeklenebilir yazılım sistemleri geliştiriyoruz.',
          service2Title: 'Web Tasarım',
          service2Desc: 'Modern, hızlı ve kullanıcı deneyimi yüksek web arayüzleri tasarımlıyoruz.',
          service3Title: 'E-Ticaret',
          service3Desc: 'Satış odaklı, yönetilebilir ve güçlü altyapılara sahip e-ticaret sistemleri kuruyoruz.',
          service4Title: 'SaaS',
          service4Desc: 'Kendi yazılım ürününüzü sıfırdan geliştirmeniz için altyapı sağlıyoruz.',
          service5Title: 'Marka & Patent',
          service5Desc: 'Marka tescil ve danışmanlık süreçlerini profesyonel şekilde yönetiyoruz.',
          service6Title: 'Danışmanlık',
          service6Desc: 'Dijital büyüme için doğru stratejileri birlikte oluşturuyoruz.',
          
          brandsTitle: 'Woontegra Çatısı Altında Geliştirilen Markalar',
          brandsSubtitle: 'Gerçek projelerle kanıtlanmış deneyim',
          brand1Name: 'Bilirkişi',
          brand1Desc: 'Hukuk ve aktüerya alanında kullanılan profesyonel hesaplama yazılımıdır.',
          brand2Name: 'Optimoon',
          brand2Desc: 'Doğal taş ve özel tasarım ürünlerin yer aldığı e-ticaret markamızdır.',
          brand3Name: 'Datça Tropikal',
          brand3Desc: 'Yerel üretim ve doğal ürünlerin satışını gerçekleştiren markamızdır.',
          brand4Name: 'Mercan Danışmanlık',
          brand4Desc: 'Marka tescil ve patent danışmanlık süreçlerini yöneten markamızdır.',
          
          whyTitle: 'Neden Woontegra?',
          whySubtitle: 'Gerçek projelerle kanıtlanmış uzmanlık',
          why1Title: 'Gerçek Ürün Deneyimi',
          why1Desc: 'Sadece hizmet sunmuyor, kendi ürünlerimizi de geliştiriyoruz.',
          why2Title: 'Uçtan Uca Sistem',
          why2Desc: 'Yazılım, satış ve operasyon süreçlerini tek yapı altında kuruyoruz.',
          why3Title: 'Performans',
          why3Desc: 'Hızlı, stabil ve sürdürülebilir sistemler geliştiriyoruz.',
          why4Title: 'Modern Teknoloji',
          why4Desc: 'Güncel yazılım teknolojileri ile çalışıyoruz.',
          why5Title: 'Aktif Markalar',
          why5Desc: 'Kendi markalarımızı aktif olarak yönetiyoruz.',
          why6Title: 'Sürekli Gelişim',
          why6Desc: 'Projeleri yayına almakla kalmıyor, sürekli geliştiriyoruz.',
          
          processTitle: 'Çalışma Sürecimiz',
          processSubtitle: 'Profesyonel ve şeffaf süreç yönetimi',
          process1Title: 'Analiz',
          process1Desc: 'İhtiyaçları doğru şekilde belirliyoruz.',
          process2Title: 'Planlama',
          process2Desc: 'Proje yapısını ve stratejisini oluşturuyoruz.',
          process3Title: 'Geliştirme',
          process3Desc: 'Sistemi modern teknolojilerle inşa ediyoruz.',
          process4Title: 'Yayın',
          process4Desc: 'Test süreçlerinden sonra canlıya alıyoruz.',
          
          ctaTitle: 'Projenizi Hayata Geçirmeye Hazır mısınız?',
          ctaSubtitle: 'İşinize en uygun dijital yapıyı birlikte kuralım.',
          ctaButtonText: 'İletişime Geç',
        }),
      },
      {
        pageKey: 'about',
        content: JSON.stringify({
          heroTitle: 'Woontegra\'yı Tanıyın',
          heroSubtitle: 'Yazılım, e-ticaret ve dijital sistemler alanında ürün geliştiren ve markalar yöneten bir teknoloji şirketiyiz.',
          
          whatIsTitle: 'Woontegra Nedir?',
          whatIsParagraph1: 'Woontegra, klasik bir ajans ya da yalnızca hizmet sunan bir yapı değildir.',
          whatIsParagraph2: 'Kendi markalarını kuran, ürünler geliştiren ve bu ürünleri aktif olarak yöneten bir teknoloji şirketidir.',
          whatIsParagraph3: 'Yazılım geliştirme, e-ticaret ve dijital sistemler alanında sadece müşteriler için değil, kendi projeleri için de üretim yapan bir yapı kurduk.',
          whatIsParagraph4: 'Bu sayede teorik değil, gerçek kullanım üzerinden deneyim kazanan ve bunu projelere yansıtan bir sistem oluşturduk.',
          whatIsParagraph5: 'Amacımız, işletmelere sadece bir hizmet sunmak değil, sürdürülebilir bir dijital yapı kurmalarını sağlamaktır.',
          
          storyTitle: 'Nasıl Başladık?',
          storyParagraph1: 'Woontegra, piyasadaki klasik ajans modelinin eksikliklerini gözlemleyerek ortaya çıktı.',
          storyParagraph2: 'Çoğu ajans, müşteri projeleri üzerinde çalışır ancak kendi ürünlerini geliştirmez. Bu durum, gerçek kullanıcı deneyimi ve operasyonel zorlukları anlamayı zorlaştırır.',
          storyParagraph3: 'Biz ise farklı bir yol seçtik: Kendi ürünlerimizi geliştiren, markalarımızı yöneten ve bu süreçte edindiğimiz deneyimi müşteri projelerine aktaran bir yapı kurmak.',
          storyParagraph4: 'Bugün, yazılım geliştirme, e-ticaret ve dijital sistemler alanında hem kendi markalarını yöneten hem de işletmelere çözümler sunan bir teknoloji yapısına dönüştük.',
          storyParagraph5: 'Farkımız şu: Sadece kod yazmıyoruz, sistem kuruyoruz. Sadece tasarım yapmıyoruz, marka oluşturuyoruz. Sadece danışmanlık vermiyor, gerçek projeler yönetiyoruz.',
          
          differenceTitle: 'Bizi Farklı Yapan Ne?',
          diff1Title: 'Sadece Hizmet Değil, Ürün',
          diff1Desc: 'Klasik ajanslar müşteri projeleri üzerinde çalışır. Biz ise kendi ürünlerimizi geliştiriyor, gerçek kullanıcılarla test ediyor ve piyasaya sunuyoruz. Bu deneyim, müşteri projelerinde de fark yaratıyor.',
          diff2Title: 'Gerçek Deneyim',
          diff2Desc: 'Kendi markalarımızı aktif olarak yönetiyoruz. E-ticaret, SaaS yazılım, danışmanlık gibi farklı sektörlerde operasyonel deneyime sahibiz. Teorik bilgi değil, gerçek iş deneyimi sunuyoruz.',
          diff3Title: 'Tek Yapı',
          diff3Desc: 'Yazılım geliştirme, satış süreçleri ve operasyonel yönetimi tek çatı altında birleştiriyoruz. Bu entegre yapı sayesinde projeler daha hızlı, daha verimli ve daha sürdürülebilir şekilde hayata geçiyor.',
          
          brandsIntro1: 'Woontegra, sadece hizmet sunan bir yapı değil, aynı zamanda kendi markalarını oluşturan ve yöneten bir sistemdir.',
          brandsIntro2: 'Aşağıdaki markalar aktif olarak geliştirilen ve yönetilen projelerdir.',
          brandsTitle: 'Aktif Olarak Yönettiğimiz Markalar',
          
          brand1Name: 'Bilirkişi',
          brand1Desc1: 'Hukuk ve aktüerya alanında kullanılan profesyonel hesaplama yazılımı. İşçi alacakları, kıdem-ihbar tazminatı, fazla mesai ve yıllık izin hesaplamalarını otomatik olarak gerçekleştirir.',
          brand1Desc2: 'Kullanım Alanı: İş hukuku davaları, bilirkişi raporları, tazminat hesaplamaları',
          brand1Desc3: 'Hedef Kullanıcı: Bilirkişiler, avukatlar, mahkemeler, hukuk büroları',
          
          brand2Name: 'Optimoon',
          brand2Desc1: 'Doğal taş takılar, kristaller ve özel tasarım ürünlerin satışını gerçekleştiren e-ticaret markası. Özgün tasarımlar, kaliteli malzemeler ve güvenilir teslimat ile müşterilerine ulaşıyor.',
          brand2Desc2: 'Kullanım Alanı: Online satış, doğal taş koleksiyonları, hediye ürünleri',
          brand2Desc3: 'Hedef Kullanıcı: Doğal taş severler, koleksiyonerler, hediye arayanlar',
          
          brand3Name: 'Datça Tropikal',
          brand3Desc1: 'Datça\'nın yerel üretim ve doğal ürünlerini satışa sunan e-ticaret markası. Organik zeytinyağı, badem, bal ve tropikal meyveler gibi bölgeye özgü ürünleri müşterilere ulaştırıyor.',
          brand3Desc2: 'Kullanım Alanı: Yerel ürün satışı, organik gıda, doğal ürünler',
          brand3Desc3: 'Hedef Kullanıcı: Organik ürün tüketicileri, sağlıklı yaşam severler',
          
          brand4Name: 'Mercan Danışmanlık',
          brand4Desc1: 'Marka tescil, patent başvuruları ve fikri mülkiyet haklarını profesyonel şekilde yöneten danışmanlık markası. İşletmelerin marka koruma süreçlerinde baştan sona rehberlik ediyor.',
          brand4Desc2: 'Kullanım Alanı: Marka tescil, patent başvuruları, fikri mülkiyet danışmanlığı',
          brand4Desc3: 'Hedef Kullanıcı: Girişimciler, işletmeler, marka sahipleri, patent başvuru sahipleri',
        }),
      },
      {
        pageKey: 'contact',
        content: JSON.stringify({
          heroTitle: 'İletişim',
          heroSubtitle: 'Projeleriniz için bizimle iletişime geçin. Size en kısa sürede dönüş yapacağız.',
          emailLabel: 'E-posta',
          email: 'info@woontegra.com',
          phoneLabel: 'Telefon',
          phone: '0532 317 17 55',
          addressLabel: 'Adres',
          address: 'İskele Mahallesi Bademli Caddesi 43/6 Datça-Muğla',
          formTitle: 'Mesaj Gönderin',
        }),
      },
      {
        pageKey: 'software-development',
        content: JSON.stringify({
          heroTitle: 'Yazılım Geliştirme',
          heroSubtitle: 'Modern teknolojilerle özel yazılım çözümleri',
          introText: 'İşletmenize özel, ölçeklenebilir ve güvenli yazılım çözümleri geliştiriyoruz. Web uygulamalarından mobil uygulamalara, kurumsal sistemlerden API entegrasyonlarına kadar geniş yelpazede hizmet sunuyoruz.',
          featuresTitle: 'Neler Sunuyoruz?',
          ctaTitle: 'Yazılım Projeniz İçin Teklif Alın',
          ctaSubtitle: 'Size özel çözümler geliştirmek için iletişime geçin',
        }),
      },
      {
        pageKey: 'web-design',
        content: JSON.stringify({
          heroTitle: 'Web Tasarım',
          heroSubtitle: 'Kullanıcı deneyimi odaklı modern web siteleri',
          introText: 'Responsive, hızlı ve SEO uyumlu web siteleri tasarlıyoruz. Modern tasarım trendleri ve kullanıcı deneyimi prensipleriyle markanızı dijitalde en iyi şekilde temsil ediyoruz.',
          featuresTitle: 'Web Tasarım Hizmetlerimiz',
          ctaTitle: 'Web Sitenizi Yenileyin',
          ctaSubtitle: 'Modern ve etkili bir web sitesi için iletişime geçin',
        }),
      },
      {
        pageKey: 'ecommerce',
        content: JSON.stringify({
          heroTitle: 'E-Ticaret Çözümleri',
          heroSubtitle: 'Online satış için güçlü e-ticaret platformları',
          introText: 'Ödeme entegrasyonları, stok yönetimi ve raporlama özellikleri ile tam donanımlı e-ticaret sistemleri kuruyoruz. Satışlarınızı artıracak, yönetimi kolaylaştıracak çözümler sunuyoruz.',
          featuresTitle: 'E-Ticaret Özelliklerimiz',
          ctaTitle: 'E-Ticaret Sitenizi Kurun',
          ctaSubtitle: 'Online satışa başlamak için iletişime geçin',
        }),
      },
      {
        pageKey: 'saas',
        content: JSON.stringify({
          heroTitle: 'Kendi Yazılım Ürününüzü Geliştirin',
          heroSubtitle: 'SaaS (Software as a Service) modeli ile çalışan, ölçeklenebilir ve sürdürülebilir yazılım ürünleri geliştiriyoruz.',
          heroButton1Text: 'Projeni Anlat',
          heroButton2Text: 'Teklif Al',
          
          problemTitle: 'Bir Fikriniz Var Ama Nasıl Ürüne Döneceğini Bilmiyor musunuz?',
          problemIntro: 'Birçok girişim:',
          problem1: 'Fikrini ürüne dönüştüremez',
          problem2: 'Teknik altyapı kuramaz',
          problem3: 'Yanlış sistemlerle başlar',
          problem4: 'Ölçeklenemez',
          problemConclusion: 'Bu yüzden doğru başlangıç kritik.',
          
          solutionTitle: 'Fikri Ürüne Dönüştürüyoruz',
          solutionIntro: 'Woontegra olarak SaaS projelerini sıfırdan ele alıyoruz.',
          solution1: 'Ürün planlama',
          solution2: 'Sistem mimarisi',
          solution3: 'Geliştirme',
          solution4: 'Yayına alma',
          solutionConclusion: 'Tüm süreci tek yapı içinde yönetiyoruz.',
          
          systemsTitle: 'Geliştirdiğimiz SaaS Sistemleri',
          system1Title: 'Üyelik Sistemleri',
          system1Desc: 'Çok kullanıcılı yapılar',
          system2Title: 'Yönetim Panelleri',
          system2Desc: 'Admin & dashboard sistemleri',
          system3Title: 'Çok Kullanıcılı Sistemler',
          system3Desc: 'Multi-tenant mimariler',
          system4Title: 'Abonelik Altyapıları',
          system4Desc: 'Ödeme & fatura sistemleri',
          system5Title: 'API Tabanlı Sistemler',
          system5Desc: 'RESTful & GraphQL',
          system6Title: 'Dashboard & Analiz Panelleri',
          system6Desc: 'Veri görselleştirme',
          
          techTitle: 'Nasıl Bir Sistem Kuruyoruz?',
          tech1Title: 'Multi-tenant yapı',
          tech1Desc: 'Her müşteri için izole veri yapısı',
          tech2Title: 'Güvenli veri yönetimi',
          tech2Desc: 'Şifreleme ve erişim kontrolü',
          tech3Title: 'Hızlı ve ölçeklenebilir backend',
          tech3Desc: 'Yüksek performans ve büyümeye hazır altyapı',
          tech4Title: 'Modern frontend mimarisi',
          tech4Desc: 'React, Vue veya Next.js tabanlı',
          tech5Title: 'API-first yaklaşım',
          tech5Desc: 'Entegrasyon odaklı mimari',
          
          whyTitle: 'Neden Woontegra?',
          why1: 'Kendi SaaS projelerimizi geliştiriyoruz',
          why2: 'Sadece kod değil, ürün geliştiriyoruz',
          why3: 'Ölçeklenebilir mimari kuruyoruz',
          why4: 'Uzun vadeli düşünerek geliştiriyoruz',
          
          ctaTitle: 'Fikrinizi Bir Ürüne Dönüştürelim',
          ctaSubtitle: 'Doğru altyapı ile güçlü bir SaaS ürünü oluşturalım.',
          ctaButtonText: 'Projeni Anlat',
        }),
      },
      {
        pageKey: 'trademark-patent',
        content: JSON.stringify({
          heroTitle: 'Marka & Patent Vekilliği',
          heroSubtitle: 'Fikri mülkiyet haklarınızı koruyun',
          introText: 'Marka tescil, patent başvuru ve fikri mülkiyet danışmanlığı hizmetleri sunuyoruz. Markanızı ve buluşlarınızı yasal olarak koruma altına alıyoruz.',
          featuresTitle: 'Hizmetlerimiz',
          ctaTitle: 'Markanızı Tescil Ettirin',
          ctaSubtitle: 'Fikri mülkiyet haklarınız için iletişime geçin',
        }),
      },
      {
        pageKey: 'game-development',
        content: JSON.stringify({
          heroTitle: 'Oyun Geliştirme',
          heroSubtitle: 'Eğlenceli ve bağımlılık yapan oyunlar',
          introText: 'Mobil ve web platformları için oyun geliştirme hizmetleri sunuyoruz. Casual oyunlardan karmaşık multiplayer sistemlere kadar geniş yelpazede deneyimimiz var.',
          featuresTitle: 'Oyun Geliştirme Hizmetlerimiz',
          ctaTitle: 'Oyun Projenizi Başlatın',
          ctaSubtitle: 'Oyun fikrinizi gerçeğe dönüştürmek için iletişime geçin',
        }),
      },
      {
        pageKey: 'digital-consulting',
        content: JSON.stringify({
          heroTitle: 'Dijital Danışmanlık',
          heroSubtitle: 'Dijital dönüşüm yolculuğunuzda yanınızdayız',
          introText: 'Strateji belirleme, teknoloji seçimi ve uygulama desteği sunuyoruz. İşletmenizin dijital dönüşüm sürecinde doğru kararlar almanıza yardımcı oluyoruz.',
          featuresTitle: 'Danışmanlık Hizmetlerimiz',
          ctaTitle: 'Dijital Stratejinizi Oluşturun',
          ctaSubtitle: 'Dijital dönüşüm için iletişime geçin',
        }),
      },
      {
        pageKey: 'solutions',
        content: JSON.stringify({
          heroTitle: 'Geliştirdiğimiz Dijital Yapılar',
          heroSubtitle: 'Woontegra sadece hizmet sunmaz, kendi ürünlerini geliştirir ve markalarını aktif olarak yönetir.',
          introParagraph1: 'Woontegra, yazılım geliştirme ve dijital sistem kurmanın ötesinde, kendi markalarını oluşturan ve yöneten bir yapı kurmuştur.',
          introParagraph2: 'Aşağıda yer alan projeler, aktif olarak geliştirilen ve yönetilen sistemlerdir.',
          
          bilirkisiTitle: 'Bilirkişi Hesaplama Programı',
          bilirkisiDesc1: 'Hukuk ve aktüerya alanında kullanılan profesyonel bir hesaplama yazılımıdır.',
          bilirkisiDesc2: 'İşçilik alacakları, tazminat hesaplamaları ve detaylı analiz süreçlerini hızlı ve doğru şekilde gerçekleştirmenizi sağlar.',
          bilirkisiDesc3: 'Hazır Excel çözümleri yerine, sistematik ve hatasız bir yapı sunar.',
          bilirkisiButtonText: 'Ürünü İncele',
          
          optimoonTitle: 'Optimoon',
          optimoonDesc1: 'Doğal taş ve özel tasarım ürünlerin yer aldığı e-ticaret markamızdır.',
          optimoonDesc2: 'Ürün yönetimi, satış süreçleri ve altyapı tamamen Woontegra tarafından geliştirilen sistemler ile yürütülmektedir.',
          optimoonButtonText: 'Mağazayı İncele',
          
          datcaTitle: 'Datça Tropikal',
          datcaDesc1: 'Datça bölgesine ait doğal ve yerel ürünlerin satışını gerçekleştiren e-ticaret markasıdır.',
          datcaDesc2: 'Üretimden satışa kadar tüm süreçler dijital altyapı ile desteklenmektedir.',
          datcaButtonText: 'Ürünleri İncele',
          
          mercanTitle: 'Mercan Danışmanlık',
          mercanDesc1: 'Marka tescil ve patent başvurularını profesyonel şekilde yöneten danışmanlık markasıdır.',
          mercanDesc2: 'Başvuru süreçleri ve takip işlemleri dijital sistemler ile desteklenmektedir.',
          mercanButtonText: 'Hizmetleri İncele',
          
          ctaTitle: 'Kendi Dijital Yapınızı Kurmak İster misiniz?',
          ctaSubtitle: 'Sizin için de özel çözümler geliştirebiliriz.',
          ctaButtonText: 'İletişime Geç',
        }),
      },
      {
        pageKey: 'blog',
        content: JSON.stringify({
          heroTitle: 'Bilgi, Deneyim ve Dijital İçerikler',
          heroSubtitle: 'Yazılım, e-ticaret ve dijital sistemler hakkında güncel içerikler ve rehberler.',
          categoriesTitle: 'Kategoriler',
          featuredTitle: 'Öne Çıkan Yazı',
          allPostsTitle: 'Tüm Yazılar',
        }),
      },
      {
        pageKey: 'faq',
        content: JSON.stringify({
          heroTitle: 'Sık Sorulan Sorular',
          heroSubtitle: 'Hizmetlerimiz ve süreçlerimiz hakkında en çok merak edilen sorular.',
          ctaTitle: 'Aklınıza Takılan Başka Bir Şey Mi Var?',
          ctaSubtitle: 'Sorularınız için bizimle iletişime geçebilirsiniz.',
          ctaButtonText: 'İletişime Geç',
        }),
      },
    ],
  })

  console.log('✅ Seed tamamlandı!')
  console.log('👤 Yönetici: info@woontegra.com / Şifre: Admin123!')
  console.log('📄 Sayfalar:', await prisma.page.count())
  console.log('🛠️  Hizmetler:', await prisma.service.count())
  console.log('🏢 Markalar:', await prisma.brand.count())
  console.log('📝 Kategoriler:', await prisma.postCategory.count())
  console.log('📝 Sayfa İçerikleri:', await prisma.pageContent.count())
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
