import type { LegalDocumentType } from '@prisma/client'

/** Aktif LegalDocument yoksa veya içerik boşsa kullanılan, gerçek Türkçe yasal metinler (ham {{}} içermez; şablon alanları render ile doldurulur). */
const SELLER_BLOCK = `<p class="legal-block"><strong>Satıcı / Hizmet sağlayıcı:</strong> {{sellerTitle}}<br/><strong>E-posta:</strong> {{sellerEmail}}<br/><strong>Telefon:</strong> {{sellerPhone}}<br/><strong>Adres:</strong> {{sellerAddress}}</p>`

export const DEFAULT_LEGAL_TITLES: Partial<Record<LegalDocumentType, string>> = {
  PRE_INFORMATION: 'Ön Bilgilendirme',
  DISTANCE_SALES: 'Mesafeli Satış Sözleşmesi',
  KVKK_CLARIFICATION: 'KVKK Aydınlatma Metni',
  EXPLICIT_CONSENT: 'Açık Rıza Metni',
  COMMERCIAL_ELECTRONIC_MESSAGE: 'Ticari Elektronik İleti Bilgilendirmesi',
}

const PRE_INFORMATION = `<div class="legal-doc">
<h2>Ön bilgilendirme</h2>
<p>Bu metin, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği uyarınca sipariş öncesi bilgilendirme amacıyla sunulmaktadır.</p>
${SELLER_BLOCK}
<h2>Alıcı bilgileri</h2>
<p><strong>Ad Soyad:</strong> {{customerName}}<br/><strong>E-posta:</strong> {{customerEmail}}</p>
<h2>Sipariş özeti</h2>
<p><strong>Sipariş numarası:</strong> {{orderNo}}<br/><strong>Ödenecek tutar:</strong> {{orderTotal}} {{currency}}</p>
<h2>Ürün ve hizmetler</h2>
{{productList}}
<p>Dijital içerik teslimi, ödeme onayından sonra e-posta ile paylaşılan indirme bağlantıları üzerinden yapılır. Fiyatlara KDV dahildir (aksi belirtilmedikçe).</p>
<h2>Cayma hakkı</h2>
<p>Dijital içerik ve anında ifa edilen hizmetlerde, teslimata başlanmış veya onayınızla ifaya başlanmış ise cayma hakkı kullanılamayabilir. Ayrıntılar mesafeli satış sözleşmesinde yer alır.</p>
</div>`

const DISTANCE_SALES = `<div class="legal-doc">
<h2>Mesafeli satış sözleşmesi</h2>
<p>İşbu sözleşme, aşağıdaki taraflar arasında elektronik ortamda kurulmuştur.</p>
${SELLER_BLOCK}
<h2>Alıcı</h2>
<p><strong>Ad Soyad:</strong> {{customerName}}<br/><strong>E-posta:</strong> {{customerEmail}}</p>
<h2>Sözleşme konusu</h2>
<p>Alıcı tarafından seçilen dijital ürünlerin satışı ve teslimi.</p>
<h2>Ürünler ve bedel</h2>
{{productList}}
<p><strong>Sipariş numarası:</strong> {{orderNo}}<br/><strong>Toplam bedel:</strong> {{orderTotal}} {{currency}}</p>
<h2>Ödeme ve teslimat</h2>
<p>Ödeme, güvenli ödeme altyapısı üzerinden tahsil edilir. Dijital ürünlerin kullanımına ilişkin bağlantılar, ödeme başarılı olduktan sonra alıcının bildirdiği e-posta adresine iletilir.</p>
<h2>Cayma ve istisnalar</h2>
<p>Mevzuat kapsamında dijital içerik ve anında ifa edilen hizmetlere ilişkin cayma hakkı istisnaları saklıdır. Alıcı, sipariş öncesinde ön bilgilendirme ve işbu metni onaylamıştır.</p>
<h2>Uyuşmazlık</h2>
<p>Uyuşmazlıklarda Türkiye Cumhuriyeti kanunları uygulanır; yetkili merciler ve Tüketici Hakem Heyetleri / Tüketici Mahkemeleri gözetilir.</p>
</div>`

const KVKK_CLARIFICATION = `<div class="legal-doc">
<h2>KVKK Aydınlatma Metni</h2>
<p>6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) uyarınca, kişisel verilerinizin işlenmesine ilişkin olarak veri sorumlusu sıfatıyla {{sellerTitle}} tarafından aşağıda açıklanan kapsamda bilgilendirilmektesiniz.</p>
<h2>Veri sorumlusu</h2>
<p><strong>Unvan:</strong> {{sellerTitle}}<br/><strong>E-posta:</strong> {{sellerEmail}}<br/><strong>Adres:</strong> {{sellerAddress}}<br/><strong>Telefon:</strong> {{sellerPhone}}</p>
<h2>İşlenen veriler ve amaçlar</h2>
<p>Kimlik (ad), iletişim (e-posta, telefon), müşteri işlem (sipariş, ödeme durumu, ürün ve fatura bilgileri), işlem güvenliği (IP, tarayıcı bilgisi gibi log verileri) ve talep hâlinde pazarlama tercihleri; siparişin oluşturulması ve ifası, müşteri desteği, faturalandırma, yasal yükümlülüklerin yerine getirilmesi, güvenlik ve denetim, hizmet kalitesinin artırılması amaçlarıyla işlenir.</p>
<h2>Hukuki sebep ve toplama</h2>
<p>Verileriniz; sözleşmenin kurulması veya ifası, veri sorumlusunun hukuki yükümlülüğü, meşru menfaat veya açık rızanıza dayanarak; web sitesi, sipariş formu, ödeme sağlayıcı ve e-posta kanalları aracılığıyla otomatik veya kısmen otomatik yollarla toplanabilir.</p>
<h2>Aktarım</h2>
<p>Ödeme altyapısı, e-posta gönderimi, barındırma ve güvenlik hizmeti sağlayıcıları gibi iş ortaklarına, hizmetin gerektirdiği ölçüde ve mevzuata uygun şekilde aktarım yapılabilir. Yurt dışı aktarımı söz konusu ise KVKK’nın 9. maddesine uyulur.</p>
<h2>Saklama</h2>
<p>Verileriniz, işleme amacının gerektirdiği süre ile ilgili mevzuatta öngörülen zamanaşımı süreleri çerçevesinde saklanır.</p>
<h2>İlgili kişi hakları</h2>
<p>KVKK’nın 11. maddesi kapsamında; verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, amaçları öğrenme, eksik veya yanlış işlenmişse düzeltilmesini isteme, silinmesini veya yok edilmesini isteme, aktarılan üçüncü kişileri bilme ve kanuna aykırı işleme nedeniyle zararın giderilmesini talep etme haklarına sahipsiniz.</p>
<h2>Başvuru</h2>
<p>Haklarınızı kullanmak için kimliğinizi teyit edecek bilgilerle birlikte {{sellerEmail}} adresine başvurabilirsiniz. Başvurularınız, niteliğine göre en geç otuz gün içinde ücretsiz olarak sonuçlandırılır.</p>
</div>`

const EXPLICIT_CONSENT = `<div class="legal-doc">
<h2>Açık rıza</h2>
<p>Aşağıdaki kutuyu işaretlemeniz hâlinde, kimlik ve iletişim verilerinizin; pazarlama, profilleme veya kişiselleştirilmiş teklifler sunulması gibi amaçlarla işlenmesine ve bu kapsamda sınırlı paylaşıma tabi tutulmasına ilişkin <strong>açık rızanız</strong> oluşturulur.</p>
<p>Rızanızı dilediğiniz zaman geri çekebilirsiniz; geri çekme, geri çekme öncesine dayanmayan hukuki sonuçları doğurmaz. Rıza gerektirmeyen işlemler (sözleşmenin ifası, meşru menfaat, hukuki yükümlülük) bu metinden bağımsız olarak sürdürülebilir.</p>
${SELLER_BLOCK}
</div>`

const COMMERCIAL_ELECTRONIC_MESSAGE = `<div class="legal-doc">
<h2>Ticari elektronik ileti</h2>
<p>6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun ve ilgili mevzuat kapsamında; tanıtım, kampanya, bülten ve benzeri ticari elektronik iletilerin gönderilmesine <strong>onay vermeniz</strong> hâlinde, iletişim bilgileriniz bu amaçla işlenebilir ve size e-posta veya diğer elektronik kanallarla ileti gönderilebilir.</p>
<p>Onayınızı dilediğiniz zaman ücretsiz olarak geri çekebilirsiniz; her iletide yer alan abonelikten çık bağlantısını kullanabilir veya {{sellerEmail}} adresine başvurabilirsiniz.</p>
${SELLER_BLOCK}
</div>`

const BY_TYPE: Partial<Record<LegalDocumentType, { title: string; content: string }>> = {
  PRE_INFORMATION: { title: DEFAULT_LEGAL_TITLES.PRE_INFORMATION!, content: PRE_INFORMATION },
  DISTANCE_SALES: { title: DEFAULT_LEGAL_TITLES.DISTANCE_SALES!, content: DISTANCE_SALES },
  KVKK_CLARIFICATION: { title: DEFAULT_LEGAL_TITLES.KVKK_CLARIFICATION!, content: KVKK_CLARIFICATION },
  EXPLICIT_CONSENT: { title: DEFAULT_LEGAL_TITLES.EXPLICIT_CONSENT!, content: EXPLICIT_CONSENT },
  COMMERCIAL_ELECTRONIC_MESSAGE: { title: DEFAULT_LEGAL_TITLES.COMMERCIAL_ELECTRONIC_MESSAGE!, content: COMMERCIAL_ELECTRONIC_MESSAGE },
}

export function getDefaultLegalDocument(type: LegalDocumentType): { title: string; content: string } {
  const row = BY_TYPE[type]
  if (row) return { ...row }
  return {
    title: 'Yasal metin',
    content: '<p>Bu belge türü için varsayılan metin tanımlı değildir.</p>',
  }
}
