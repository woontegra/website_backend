import type { LegalDocumentType } from '@prisma/client'
import {
  DIGITAL_PRODUCT_WAIVER,
  DIGITAL_SERVICE_WAIVER,
  DISTANCE_SALES,
  KVKK_CLARIFICATION,
  PRE_INFORMATION,
  SAAS_SUBSCRIPTION,
  SELLER_BLOCK,
  SOFTWARE_LICENSE,
} from './legalDocumentTemplates'

export const DEFAULT_LEGAL_TITLES: Partial<Record<LegalDocumentType, string>> = {
  PRE_INFORMATION: 'Ön Bilgilendirme Formu',
  DISTANCE_SALES: 'Mesafeli Satış Sözleşmesi',
  KVKK_CLARIFICATION: 'KVKK Aydınlatma Metni',
  EXPLICIT_CONSENT: 'Açık Rıza Metni',
  COMMERCIAL_ELECTRONIC_MESSAGE: 'Ticari Elektronik İleti Bilgilendirmesi',
  SOFTWARE_LICENSE: 'Yazılım Lisans ve Kullanım Sözleşmesi',
  SAAS_SUBSCRIPTION: 'Woontegra SaaS Abonelik ve Kullanım Sözleşmesi',
  DIGITAL_IMMEDIATE_DELIVERY_WAIVER: 'Dijital Teslim ve Cayma Hakkı İstisnası Onayı',
}

export type LegalDocumentVariant = 'DOWNLOAD' | 'SAAS'

const EXPLICIT_CONSENT = `<div class="legal-doc">
<h2>Pazarlama Amaçlı Kişisel Veri İşleme Açık Rıza Metni</h2>
<p>6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") kapsamında, aşağıda belirtilen kişisel verilerinizin pazarlama amaçlı işlenmesine ilişkin bilgilendirilmektesiniz.</p>
<h2>1. Veri sorumlusu</h2>
${SELLER_BLOCK}
<h2>2. İşlenecek kişisel veriler</h2>
<p>Ad soyad, e-posta adresi, telefon numarası, sipariş ve müşteri işlem bilgileri.</p>
<h2>3. İşleme amacı</h2>
<ul>
<li>Ürün ve hizmet tanıtımları, kampanya duyuruları</li>
<li>Müşteri memnuniyeti iletişimleri</li>
<li>Pazarlama faaliyetleri kapsamında iletişim</li>
</ul>
<h2>4. Aktarım durumu</h2>
<p>Yukarıdaki amaçlarla sınırlı olmak kaydıyla, kişisel verileriniz yalnızca e-posta gönderim ve iletişim altyapısı sağlayıcılarına, hizmetin gerektirdiği ölçüde aktarılabilir. Yurt dışı aktarımda KVKK m.9'a uyulur.</p>
<h2>5. Açık rızanın kapsamı</h2>
<p>Yukarıda belirtilen kişisel verilerimin; {{sellerTitle}} tarafından ürün/hizmet tanıtımları, kampanya duyuruları, müşteri memnuniyeti iletişimleri ve pazarlama faaliyetleri kapsamında işlenmesine <strong>açık rıza veriyorum</strong>.</p>
<h2>6. Rızanın geri çekilmesi</h2>
<p>Açık rızanızı dilediğiniz zaman {{sellerEmail}} adresine başvurarak ücretsiz olarak geri çekebilirsiniz. Geri çekme, o ana kadar yapılmış işleme faaliyetlerinin hukuka uygunluğunu etkilemez.</p>
<h2>7. Onayın zorunlu olmadığı</h2>
<p>Bu açık rıza, satın alma işleminizi tamamlamak için <strong>zorunlu değildir</strong>. Rıza vermemeniz hâlinde dahi siparişinizi tamamlayabilirsiniz. Sözleşmenin ifası, meşru menfaat ve hukuki yükümlülük kapsamındaki veri işleme faaliyetleri bu metinden bağımsız olarak sürdürülür.</p>
<h2>8. Elektronik kayıt ve ispat</h2>
<p>Bu onay, sipariş kaydıyla birlikte onay tarihi, IP adresi, tarayıcı bilgisi (user-agent) ve belge sürümü ile birlikte elektronik ortamda saklanır; KVKK ve ilgili mevzuat uyarınca delil olarak kullanılabilir.</p>
</div>`

const COMMERCIAL_ELECTRONIC_MESSAGE = `<div class="legal-doc">
<h2>Ticari Elektronik İleti Onay Bilgilendirmesi</h2>
<p>6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun ve Ticari İletişim ve Ticari Elektronik İletiler Hakkında Yönetmelik kapsamında bilgilendirilmektesiniz.</p>
<h2>1. Gönderici bilgileri</h2>
${SELLER_BLOCK}
<h2>2. İletinin kapsamı</h2>
<p>Onay vermeniz hâlinde, aşağıdaki iletişim kanalları aracılığıyla tarafınıza ticari elektronik iletiler gönderilebilir:</p>
<ul>
<li><strong>E-posta:</strong> Ürün/hizmet tanıtımları, kampanya duyuruları, bültenler</li>
<li><strong>SMS:</strong> Kampanya ve bilgilendirme mesajları</li>
<li><strong>Telefon / arama:</strong> Müşteri bilgilendirme aramaları</li>
</ul>
<h2>3. İletişim bilgilerinin kullanımı</h2>
<p>E-posta adresiniz, telefon numaranız ve ad soyad bilgileriniz yalnızca yukarıda belirtilen ticari iletişim amaçlarıyla kullanılır.</p>
<h2>4. Onayın zorunlu olmadığı</h2>
<p>Bu onay, satın alma işleminizi tamamlamak için <strong>zorunlu değildir</strong>. Onay vermemeniz hâlinde dahi siparişinizi tamamlayabilirsiniz; yalnızca kampanya ve tanıtım iletileri gönderilmez.</p>
<h2>5. Onayın geri çekilmesi</h2>
<p>Onayınızı dilediğiniz zaman ücretsiz olarak geri çekebilirsiniz. Bunun için:</p>
<ul>
<li>{{sellerEmail}} adresine başvurabilirsiniz.</li>
<li>Gelen e-postalardaki "abonelikten çık" bağlantısını kullanabilirsiniz.</li>
</ul>
<p>Geri çekme talebi en geç 3 iş günü içinde işleme alınır.</p>
<h2>6. Elektronik kayıt</h2>
<p>Onay tarihi, IP adresi ve tarayıcı bilgisi sipariş kaydıyla birlikte elektronik ortamda saklanır.</p>
</div>`

const BY_TYPE: Partial<Record<LegalDocumentType, { title: string; content: string }>> = {
  PRE_INFORMATION: { title: DEFAULT_LEGAL_TITLES.PRE_INFORMATION!, content: PRE_INFORMATION },
  DISTANCE_SALES: { title: DEFAULT_LEGAL_TITLES.DISTANCE_SALES!, content: DISTANCE_SALES },
  KVKK_CLARIFICATION: { title: DEFAULT_LEGAL_TITLES.KVKK_CLARIFICATION!, content: KVKK_CLARIFICATION },
  SOFTWARE_LICENSE: { title: DEFAULT_LEGAL_TITLES.SOFTWARE_LICENSE!, content: SOFTWARE_LICENSE },
  SAAS_SUBSCRIPTION: { title: DEFAULT_LEGAL_TITLES.SAAS_SUBSCRIPTION!, content: SAAS_SUBSCRIPTION },
  EXPLICIT_CONSENT: { title: DEFAULT_LEGAL_TITLES.EXPLICIT_CONSENT!, content: EXPLICIT_CONSENT },
  COMMERCIAL_ELECTRONIC_MESSAGE: { title: DEFAULT_LEGAL_TITLES.COMMERCIAL_ELECTRONIC_MESSAGE!, content: COMMERCIAL_ELECTRONIC_MESSAGE },
}

const WAIVER_BY_VARIANT: Record<LegalDocumentVariant, { title: string; content: string }> = {
  DOWNLOAD: {
    title: 'Dijital Ürün Hemen Teslim ve Cayma Hakkı İstisnası Onayı',
    content: DIGITAL_PRODUCT_WAIVER,
  },
  SAAS: {
    title: 'Dijital Hizmet Hemen Aktivasyon ve Cayma Hakkı İstisnası Onayı',
    content: DIGITAL_SERVICE_WAIVER,
  },
}

export function getDefaultLegalDocument(
  type: LegalDocumentType,
  variant?: LegalDocumentVariant,
): { title: string; content: string } {
  if (type === 'DIGITAL_IMMEDIATE_DELIVERY_WAIVER' && variant) {
    return { ...WAIVER_BY_VARIANT[variant] }
  }
  const row = BY_TYPE[type]
  if (row) return { ...row }
  return {
    title: 'Yasal metin',
    content: '<p>Bu belge türü için varsayılan metin tanımlı değildir.</p>',
  }
}
