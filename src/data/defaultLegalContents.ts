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
<h2>Açık rıza</h2>
<p>Aşağıdaki kutuyu işaretlemeniz hâlinde, kimlik ve iletişim verilerinizin; pazarlama, profilleme veya kişiselleştirilmiş teklifler sunulması gibi amaçlarla işlenmesine ilişkin <strong>açık rızanız</strong> oluşturulur.</p>
<p>Rızanızı dilediğiniz zaman geri çekebilirsiniz. Rıza gerektirmeyen işlemler (sözleşmenin ifası, meşru menfaat, hukuki yükümlülük) bu metinden bağımsız olarak sürdürülebilir.</p>
${SELLER_BLOCK}
</div>`

const COMMERCIAL_ELECTRONIC_MESSAGE = `<div class="legal-doc">
<h2>Ticari elektronik ileti</h2>
<p>6563 sayılı Kanun kapsamında; tanıtım, kampanya ve bülten gibi ticari elektronik iletiler için <strong>onay vermeniz</strong> hâlinde iletişim bilgileriniz bu amaçla işlenebilir.</p>
<p>Onayınızı dilediğiniz zaman ücretsiz geri çekebilirsiniz: {{sellerEmail}}</p>
${SELLER_BLOCK}
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
