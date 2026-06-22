/** Sipariş snapshot ve checkout önizlemesi için HTML yasal metin şablonları ({{placeholder}}). */

export const SELLER_BLOCK = `<p class="legal-block"><strong>Satıcı / Hizmet sağlayıcı:</strong> {{sellerTitle}}<br/><strong>Adres:</strong> {{sellerAddress}}<br/><strong>E-posta:</strong> {{sellerEmail}}<br/><strong>Telefon:</strong> {{sellerPhone}}<br/><strong>Vergi dairesi:</strong> {{sellerTaxOffice}}<br/><strong>Vergi no:</strong> {{sellerTaxNumber}}<br/><strong>MERSİS no:</strong> {{sellerMersis}}<br/><strong>Web:</strong> {{sellerWebsite}}</p>`

const ELECTRONIC_RECORD = `<h2>Elektronik onay, kayıt ve delil</h2>
<p>İşbu metin elektronik ortamda onaylanmıştır. Onay anındaki IP adresi, tarayıcı bilgisi (user-agent), onay zamanı, sözleşme metni sürümü ve sipariş bilgileri {{sellerTitle}} sistemlerinde saklanır; 6098 sayılı Türk Borçlar Kanunu ve ilgili mevzuat uyarınca delil olarak kullanılabilir.</p>`

const DISPUTE = `<h2>Uyuşmazlık çözümü</h2>
<p>İşbu sözleşmeden doğan uyuşmazlıklarda Türkiye Cumhuriyeti kanunları uygulanır. Tüketici işlemlerinde, parasal sınırlara tabi olarak Tüketici Hakem Heyetleri ile Tüketici Mahkemeleri yetkilidir. Şikâyet ve başvurular için {{sellerEmail}} adresi ve {{sellerPhone}} numarası kullanılabilir.</p>`

export const PRE_INFORMATION = `<div class="legal-doc">
<h2>Ön Bilgilendirme Formu</h2>
<p>Bu form, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği uyarınca, mesafeli sözleşme kurulmadan önce tüketicinin bilgilendirilmesi amacıyla sunulmaktadır.</p>
<h2>1. Sağlayıcı bilgileri</h2>
${SELLER_BLOCK}
<h2>2. Alıcı / müşteri bilgileri</h2>
{{buyerInfoBlock}}
<h2>3. Ürün veya hizmetin temel nitelikleri</h2>
{{productList}}
<p>Sepette yer alan kalemler; masaüstü yazılım (indirilebilir kurulum dosyası ve lisans) ve/veya web tabanlı yazılım hizmeti (SaaS abonelik) niteliğindedir. Ürün adı, tipi ve plan bilgisi yukarıdaki listede gösterilir.</p>
<h2>4. Ürün tipi ve plan</h2>
<ul>
<li><strong>Masaüstü (DOWNLOAD):</strong> Kurulum dosyası ve lisans anahtarı ile kullanım; plan: <strong>Ömür Boyu Lisans</strong> (süreli güncelleme/destek koşulları sözleşmede belirtilir).</li>
<li><strong>SaaS:</strong> İnternet üzerinden erişilen web tabanlı yazılım; plan: <strong>Yıllık Abonelik</strong> (siparişte belirtilen yıl süresi).</li>
</ul>
<h2>5. Toplam fiyat ve ödeme bilgisi</h2>
<p><strong>Sipariş numarası:</strong> {{orderNo}}<br/><strong>Ödenecek toplam tutar:</strong> {{orderTotal}} {{currency}}<br/>Fiyatlara KDV dahildir (aksi açıkça belirtilmedikçe). Ödeme; güvenli ödeme altyapısı (kart) veya Havale/EFT ile yapılabilir.</p>
<h2>6. Teslimat / hizmetin ifası</h2>
<p><strong>Masaüstü ürünler:</strong> Ödeme onayından sonra kurulum dosyası bağlantısı ve lisans bilgileri kayıtlı e-posta adresine iletilir.<br/><strong>SaaS hizmetleri:</strong> Ödeme onayından sonra abonelik aktif edilir; kullanıcı hesabı ve giriş bilgileri e-posta ile paylaşılır.</p>
<h2>7. Cayma hakkı bilgilendirmesi</h2>
<p>Tüketici, mesafeli sözleşmelerde yasal süre içinde cayma hakkına sahiptir. Ancak dijital içerik ve anında ifa edilen hizmetlerde, onayınızla ifaya başlanması hâlinde cayma hakkı kullanılamayabilir (aşağıdaki istisna maddesi).</p>
<h2>8. Dijital ürün / hizmet istisnası</h2>
<p>6502 sayılı Kanun’un 15/1-ğ ve Mesafeli Sözleşmeler Yönetmeliği’nin 15. maddesi uyarınca; dijital içeriğin anında teslimi veya dijital hizmetin ifasına ödeme sonrası derhâl başlanması ve bu konuda ayrıca onay vermeniz hâlinde cayma hakkı istisnası uygulanabilir. Bu onay checkout aşamasında ayrı kutucukla alınır.</p>
<h2>9. İptal, iade ve yenilememe</h2>
<p>Cayma hakkının kullanılamadığı hâllerde, yasal zorunluluklar ve sözleşme hükümleri saklı kalmak kaydıyla bedel iadesi yapılmaz. SaaS abonelikleri süre sonunda otomatik yenilenmez; yenileme ayrıca satın alma veya bildirim ile yapılır.</p>
<h2>10. Şikâyet ve başvuru yolları</h2>
<p>Şikâyetlerinizi {{sellerEmail}} adresine iletebilirsiniz. Tüketici Hakem Heyeti ve Tüketici Mahkemelerine başvuru hakkınız saklıdır.</p>
<h2>11. KVKK kısa bilgilendirme</h2>
<p>Kişisel verileriniz siparişin kurulması ve ifası, ödeme, destek ve yasal yükümlülükler kapsamında işlenir. Ayrıntılar KVKK Aydınlatma Metni’nde yer alır.</p>
${ELECTRONIC_RECORD}
<h2>12. Onay bilgileri</h2>
<p>Bu formu okuduğunuzu ve sipariş öncesi bilgilendirildiğinizi onaylarsınız. Sipariş no: {{orderNo}}.</p>
</div>`

export const DISTANCE_SALES = `<div class="legal-doc">
<h2>Mesafeli Satış Sözleşmesi</h2>
<p>İşbu Mesafeli Satış Sözleşmesi (“Sözleşme”), aşağıda bilgileri yer alan Satıcı ile Alıcı arasında elektronik ortamda kurulmuştur.</p>
<h2>1. Taraflar</h2>
${SELLER_BLOCK}
{{buyerInfoBlock}}
<h2>2. Tanımlar</h2>
<ul>
<li><strong>Satıcı:</strong> {{sellerTitle}}</li>
<li><strong>Alıcı:</strong> Sözleşmeyi elektronik ortamda onaylayan gerçek veya tüzel kişi.</li>
<li><strong>Dijital ürün:</strong> Masaüstü yazılım kurulum dosyası ve lisansı.</li>
<li><strong>Dijital hizmet (SaaS):</strong> İnternet üzerinden sunulan abonelikli yazılım hizmeti.</li>
</ul>
<h2>3. Sözleşmenin konusu</h2>
<p>Alıcının Satıcı’ya ait internet sitesi üzerinden seçtiği dijital ürün ve/veya hizmetlerin satışı, bedelin ödenmesi, teslimat/erişimin sağlanması ve tarafların hak ve yükümlülüklerinin belirlenmesidir.</p>
<h2>4. Ürün / hizmet bilgileri</h2>
{{productList}}
<p><strong>Sipariş no:</strong> {{orderNo}} — <strong>Toplam bedel:</strong> {{orderTotal}} {{currency}}</p>
<h2>5. Fiyat ve ödeme</h2>
<p>Sözleşme bedeli yukarıda gösterilmiştir. Ödeme onayı alınmadan teslimat veya hizmet aktivasyonu yapılmaz. Ödeme aracına ilişkin güvenlik önlemleri ödeme kuruluşu tarafından sağlanır.</p>
<h2>6. Dijital teslimat / hizmetin ifası</h2>
<p>Masaüstü ürünlerde kurulum dosyası ve lisans; SaaS’ta kullanıcı hesabı ve erişim bilgileri, ödeme onayından sonra Alıcının bildirdiği e-posta adresine iletilir veya sistemde aktif edilir.</p>
<h2>7. Cayma hakkı</h2>
<p>Alıcı, yasal süre içinde herhangi bir gerekçe göstermeksizin cayma hakkına sahiptir; dijital içerik ve anında ifa edilen hizmetlerde istisnalar aşağıda düzenlenmiştir.</p>
<h2>8. Cayma hakkının istisnası</h2>
<p>Alıcının açık onayı ile dijital içeriğin teslimine veya dijital hizmetin ifasına ödeme sonrası başlanması hâlinde, ilgili mevzuat uyarınca cayma hakkı kullanılamayabilir. Bu onay checkout’ta ayrıca alınır.</p>
<h2>9. İade koşulları</h2>
<p>Cayma hakkının geçerli olduğu hâllerde iade, ödeme yapılan yönteme uygun şekilde yasal süreler içinde gerçekleştirilir. Cayma istisnası uygulanan dijital teslim/aktivasyon sonrası bedel iadesi yapılmaz.</p>
<h2>10. Alıcının yükümlülükleri</h2>
<ul>
<li>Doğru iletişim ve fatura bilgisi vermek.</li>
<li>Lisans ve hesap bilgilerini gizli tutmak.</li>
<li>Yazılımı/hizmeti hukuka ve sözleşmeye uygun kullanmak.</li>
</ul>
<h2>11. Satıcının yükümlülükleri</h2>
<ul>
<li>Ödeme onayı sonrası teslimat/erişim bilgilerini iletmek.</li>
<li>Makul teknik destek sağlamak.</li>
<li>Yasal saklama ve bilgilendirme yükümlülüklerini yerine getirmek.</li>
</ul>
<h2>12. Fikri mülkiyet</h2>
<p>Yazılım ve hizmete ilişkin tüm fikri mülkiyet hakları Satıcı’ya veya lisans verenlerine aittir; Alıcı’ya yalnızca kullanım hakkı tanınır.</p>
<h2>13. KVKK</h2>
<p>Kişisel veriler KVKK Aydınlatma Metni kapsamında işlenir.</p>
${ELECTRONIC_RECORD}
${DISPUTE}
<h2>Yürürlük</h2>
<p>Alıcının elektronik onayı ile yürürlüğe girer.</p>
</div>`

export const KVKK_CLARIFICATION = `<div class="legal-doc">
<h2>KVKK Aydınlatma Metni</h2>
<p>6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) uyarınca veri sorumlusu sıfatıyla {{sellerTitle}} tarafından bilgilendirilmektesiniz.</p>
<h2>Veri sorumlusu</h2>
${SELLER_BLOCK}
<h2>İşlenen veri kategorileri</h2>
<p>Kimlik (ad), iletişim (e-posta, telefon), müşteri işlem (sipariş, ödeme, ürün, fatura), finans (ödeme durumu), işlem güvenliği (IP, log, user-agent), pazarlama tercihleri (açık rıza varsa).</p>
<h2>İşleme amaçları</h2>
<p>Siparişin kurulması ve ifası, ödeme tahsilatı, dijital teslim/aktivasyon, müşteri desteği, faturalandırma, yasal yükümlülükler, güvenlik, sözleşme arşivi ve hizmet kalitesi.</p>
<h2>Hukuki sebepler</h2>
<p>Sözleşmenin kurulması veya ifası (KVKK m.5/2-c), hukuki yükümlülük (m.5/2-ç), meşru menfaat (m.5/2-f) ve gerektiğinde açık rıza (m.5/1).</p>
<h2>Aktarım</h2>
<p>Ödeme kuruluşu, e-posta/barındırma sağlayıcıları ve teknik hizmet sağlayıcılarına, hizmetin gerektirdiği ölçüde aktarım yapılabilir. Yurt dışı aktarımda KVKK m.9’a uyulur.</p>
<h2>Saklama süresi</h2>
<p>Veriler işleme amacının gerektirdiği süre ve zamanaşımı süreleri boyunca saklanır; sözleşme arşivi ve sipariş kayıtları mevzuat gereği muhafaza edilir.</p>
<h2>İlgili kişi hakları (KVKK m.11)</h2>
<p>Verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltme, silme, itiraz ve zararın giderilmesini talep etme haklarına sahipsiniz.</p>
<h2>Başvuru</h2>
<p>{{sellerEmail}} adresine kimlik teyidi ile başvurabilirsiniz; başvurular en geç 30 gün içinde sonuçlandırılır.</p>
</div>`

export const SOFTWARE_LICENSE = `<div class="legal-doc">
<h2>Yazılım Lisans ve Kullanım Sözleşmesi</h2>
<p>İşbu Sözleşme; {{sellerTitle}} (“Lisans Veren”) ile {{customerName}} (“Lisans Alan”) arasında, aşağıdaki masaüstü yazılım ürünlerinin lisanslanması ve kullanımına ilişkin hak ve yükümlülükleri düzenler.</p>
<h2>1. Taraflar</h2>
${SELLER_BLOCK}
{{buyerInfoBlock}}
<h2>2. Tanımlar</h2>
<ul>
<li><strong>Yazılım:</strong> Siparişte belirtilen masaüstü program ve güncellemeleri.</li>
<li><strong>Lisans Anahtarı:</strong> Yazılımın aktivasyonu için verilen benzersiz kod.</li>
<li><strong>Kurulum Dosyası:</strong> Elektronik ortamda sunulan indirilebilir yazılım paketi.</li>
</ul>
<h2>3. Sözleşmenin konusu</h2>
<p>Lisans Veren’in geliştirdiği veya dağıttığı yazılımın, işbu Sözleşme koşullarında Lisans Alan tarafından kullanılmasına izin verilmesidir. Mülkiyet devri yapılmaz; yalnızca kullanım lisansı verilir.</p>
<h2>4. Ürün / lisans bilgileri</h2>
<p><strong>Sipariş no:</strong> {{orderNo}}</p>
{{productList}}
<h2>5. Ömür boyu kullanım hakkının kapsamı</h2>
<p>Lisans Alan, satın aldığı yazılımı <strong>ömür boyu kullanım</strong> lisansı kapsamında, kişisel veya kurumsal iç işlerinde, siparişte belirtilen cihaz/adet sınırı içinde kullanabilir. “Ömür boyu” ifadesi; Lisans Veren’in ticari faaliyetini sürdürdüğü sürece ve yazılımın desteklenebilir teknik ortamda kalması koşuluyla geçerlidir. Güncelleme ve destek kapsamı aşağıda belirtilmiştir.</p>
<h2>6. Lisansın devredilemezliği</h2>
<p>Lisans kişiseldir; üçüncü kişilere devredilemez, kiralanamaz veya alt lisanslanamaz. Şirket unvanı değişikliği gibi istisnalar yazılı bildirim ile değerlendirilir.</p>
<h2>7. Kurulum dosyası / dijital teslimat</h2>
<p>Kurulum dosyası bağlantısı ve lisans bilgileri, ödeme onayından sonra {{customerEmail}} adresine iletilir. Teslim elektronik ortamda gerçekleşir; fiziki mal gönderilmez.</p>
<h2>8. Aktivasyon ve lisans anahtarı</h2>
<p>Lisans Alan, iletilen lisans anahtarı ve varsa aktivasyon şifresini yazılım arayüzüne girerek kullanıma başlar. Anahtarların gizliliğinden Lisans Alan sorumludur.</p>
<h2>9. Güncelleme ve destek kapsamı</h2>
<p>Lisans Veren, makul ölçüde hata düzeltme ve sürüm güncellemeleri sunabilir; bu yükümlülük zorunlu bakım taahhüdü oluşturmaz. Teknik destek {{sellerEmail}} üzerinden sağlanır.</p>
<h2>10. Yedekleme sorumluluğu</h2>
<p>Lisans Alan, yazılım ile oluşturduğu verilerin yedeklenmesinden, güvenliğinden ve cihaz uyumluluğundan kendisi sorumludur.</p>
<h2>11. Kullanıcının yükümlülükleri</h2>
<ul>
<li>Yazılımı yalnızca hukuka ve işbu Sözleşmeye uygun kullanmak.</li>
<li>Lisans bilgilerini üçüncü kişilerle paylaşmamak.</li>
<li>Güncel ve desteklenen işletim sistemi kullanmak.</li>
</ul>
<h2>12. Yasak kullanımlar</h2>
<p>Yazılımın yetkisiz çoğaltılması, paylaşılması, ticari yeniden satışı, zararlı amaçla kullanılması veya lisans sınırlarının aşılması yasaktır.</p>
<h2>13. Tersine mühendislik / çoğaltma / dağıtım yasağı</h2>
<p>Kaynak koda erişim, tersine mühendislik, dekompilasyon, türev eser oluşturma ve lisans anahtarının kırılması kesinlikle yasaktır.</p>
<h2>14. Fikri mülkiyet hakları</h2>
<p>Yazılımın tüm fikri ve sınai mülkiyet hakları Lisans Veren’e aittir. İhlal hâlinde hukuki ve cezai yollara başvurulabilir.</p>
<h2>15. Cayma hakkı ve dijital ürün istisnası</h2>
<p>Alıcı, dijital içeriğin ödeme sonrası elektronik ortamda sunulmasını ve ifaya başlanmasını onaylamıştır. Bu kapsamda ilgili mevzuat uyarınca cayma hakkı istisnası uygulanabilir.</p>
<h2>16. İade koşulları</h2>
<p>Cayma istisnası uygulanan teslimat sonrası bedel iadesi yapılmaz. Mevzuatın zorunlu kıldığı haller saklıdır.</p>
<h2>17. Garanti verilmeyen haller</h2>
<p>Yazılım “olduğu gibi” sunulur. Lisans Alan’ın donanım uyumsuzluğu, yanlış kurulum, yetkisiz müdahale veya üçüncü taraf yazılımlardan kaynaklanan sorunlar garanti kapsamı dışındadır.</p>
<h2>18. Sorumluluk sınırı</h2>
<p>Mevzuatın izin verdiği ölçüde Lisans Veren’in sorumluluğu, ilgili ürün için ödenen lisans bedeli ile sınırlıdır; dolaylı zararlar hariçtir.</p>
<h2>19. Kişisel veriler</h2>
<p>KVKK Aydınlatma Metni geçerlidir.</p>
${ELECTRONIC_RECORD}
${DISPUTE}
<h2>20. Yürürlük</h2>
<p>Elektronik onay ile yürürlüğe girer. Sipariş: {{orderNo}}.</p>
</div>`

export const SAAS_SUBSCRIPTION = `<div class="legal-doc">
<h2>Woontegra SaaS Abonelik ve Kullanım Sözleşmesi</h2>
<p>İşbu Sözleşme; {{sellerTitle}} (“Hizmet Sağlayıcı”) ile {{customerName}} (“Abone”) arasında, web tabanlı yazılım hizmetinin (SaaS) abonelik esasına göre sunulmasına ilişkin koşulları düzenler.</p>
<h2>1. Taraflar</h2>
${SELLER_BLOCK}
{{buyerInfoBlock}}
<h2>2. Tanımlar</h2>
<ul>
<li><strong>SaaS Hizmeti:</strong> İnternet üzerinden erişilen web tabanlı yazılım.</li>
<li><strong>Abonelik:</strong> Belirli süre için hizmete erişim hakkı.</li>
<li><strong>Kullanıcı Hesabı:</strong> Hizmete giriş için oluşturulan kimlik bilgileri.</li>
</ul>
<h2>3. Sözleşmenin konusu</h2>
<p>Abone’nin seçtiği SaaS ürününe, işbu Sözleşme hükümlerinde belirtilen süre ve kapsamda erişmesinin sağlanmasıdır.</p>
<h2>4. Hizmetin kapsamı</h2>
{{productList}}
<p><strong>Sipariş no:</strong> {{orderNo}} — <strong>Toplam bedel:</strong> {{orderTotal}} {{currency}}</p>
<h2>5. SaaS abonelik modeli</h2>
<p>Hizmet, abonelik (subscription) modeli ile sunulur; kullanım hakkı süreli olup mülkiyet devri yapılmaz.</p>
<h2>6. Yıllık abonelik süresi</h2>
<p>Abonelik süresi siparişte belirtilen yıl (kullanım süresi) kadardır. Süre bitiminde erişim sona erer; yenileme ayrıca satın alma veya bildirim ile yapılır.</p>
<h2>7. Aboneliğin başlaması</h2>
<p>Ödeme onayından sonra abonelik aktif edilir; kullanıcı hesabı ve giriş bilgileri Abone’nin e-posta adresine iletilir.</p>
<h2>8. Ödeme ve fiyat</h2>
<p>Bedel sipariş özetinde gösterilmiştir. Ödeme alınmadan hizmet aktif edilmez.</p>
<h2>9. Hizmetin elektronik ortamda ifası</h2>
<p>Hizmet tamamen elektronik ortamda sunulur; fiziki teslimat yapılmaz.</p>
<h2>10. Kullanıcı hesabı ve erişim bilgileri</h2>
<p>Giriş bilgileri kişiseldir; Abone bu bilgilerin gizliliğinden sorumludur. Yetkisiz kullanım derhâl bildirilmelidir.</p>
<h2>11. Yetkisiz paylaşım yasağı</h2>
<p>Hesap bilgilerinin üçüncü kişilerle paylaşılması, eş zamanlı çoklu kullanıcı ihlali veya lisans sınırının aşılması yasaktır.</p>
<h2>12. Abonenin yükümlülükleri</h2>
<ul>
<li>Doğru bilgi vermek ve hesabı güvenli tutmak.</li>
<li>Hizmeti hukuka ve sözleşmeye uygun kullanmak.</li>
<li>Verilerinin yedeklenmesinden sorumlu olmak.</li>
</ul>
<h2>13. Hizmet Sağlayıcının yükümlülükleri</h2>
<ul>
<li>Ödeme sonrası erişimi sağlamak.</li>
<li>Makul ölçüde teknik destek sunmak.</li>
<li>Güvenlik ve yasal yükümlülüklere uymak.</li>
</ul>
<h2>14. Bakım, güncelleme ve kesintiler</h2>
<p>Planlı bakım ve güncellemeler önceden mümkün olduğunca bildirilir. Mücbir sebep ve altyapı kesintilerinde hizmet geçici olarak durabilir.</p>
<h2>15. Destek hizmetleri</h2>
<p>Destek {{sellerEmail}} ve {{sellerPhone}} üzerinden sağlanır; yanıt süreleri iş yoğunluğuna bağlıdır.</p>
<h2>16. Veri saklama ve abonelik sonrası erişim</h2>
<p>Abonelik süresi sonunda erişim sona erer. Veriler, yasal saklama süreleri ve Abone’nin talebi doğrultusunda mevzuata uygun şekilde muhafaza veya silinir.</p>
<h2>17. Fikri mülkiyet hakları</h2>
<p>Hizmet, arayüz ve yazılımın tüm hakları Hizmet Sağlayıcı’ya aittir.</p>
<h2>18. Cayma hakkı ve dijital hizmet istisnası</h2>
<p>Abone, ödeme sonrası hizmetin derhâl aktif edilmesini ve ifaya başlanmasını onaylamıştır; cayma hakkı istisnası uygulanabilir.</p>
<h2>19. İade koşulları</h2>
<p>İstisna kapsamındaki aktivasyon sonrası bedel iadesi yapılmaz.</p>
<h2>20. Sorumluluk sınırı</h2>
<p>Mevzuatın izin verdiği ölçüde sorumluluk, ilgili abonelik bedeli ile sınırlıdır.</p>
<h2>21. Mücbir sebep</h2>
<p>Doğal afet, savaş, genel internet kesintisi, yasal düzenleme gibi mücbir sebeplerde ifa askıya alınabilir.</p>
<h2>22. Kişisel veriler ve KVKK</h2>
<p>KVKK Aydınlatma Metni geçerlidir.</p>
<h2>23. Elektronik onay ve sözleşme arşivi</h2>
<p>Onay anı, IP, user-agent ve metin sürümü sistemde arşivlenir.</p>
${DISPUTE}
<h2>24. Yürürlük</h2>
<p>Elektronik onay ile yürürlüğe girer.</p>
</div>`

export const DIGITAL_PRODUCT_WAIVER = `<div class="legal-doc">
<h2>Dijital Ürün Hemen Teslim ve Cayma Hakkı İstisnası Onayı</h2>
<p>6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği uyarınca bilgilendirme ve onay metnidir.</p>
${SELLER_BLOCK}
<h2>Alıcı bilgileri</h2>
{{buyerInfoBlock}}
<p><strong>Sipariş:</strong> {{orderNo}}</p>
<h2>Ürünler</h2>
{{productList}}
<h2>Bilgilendirme</h2>
<p>Mesafeli sözleşmelerde tüketicinin 14 gün içinde herhangi bir gerekçe göstermeksizin cayma hakkı bulunmaktadır. Ancak 6502 sayılı Kanun’un 15/1-ğ bendi ve Mesafeli Sözleşmeler Yönetmeliği’nin 15. maddesi uyarınca; <strong>elektronik ortamda anında ifa edilen hizmetler</strong> ile <strong>anında teslim edilen dijital içerikler</strong> bakımından, tüketicinin onayı ile ifaya başlanması hâlinde cayma hakkı kullanılamayabilir.</p>
<h2>Açık onay beyanı</h2>
<p>Alıcı olarak;</p>
<ul>
<li>Ödeme sonrasında <strong>dijital ürünün / kurulum dosyasının</strong> tarafıma elektronik ortamda sunulmasını,</li>
<li>Lisans anahtarı ve aktivasyon bilgilerinin iletilmesini,</li>
<li>Bu kapsamda <strong>dijital ürünün teslimatına / ifasına başlanmasını</strong> talep ettiğimi,</li>
<li>Cayma hakkına ilişkin <strong>istisna hakkında bilgilendirildiğimi</strong> ve bu kapsamda cayma hakkımın kullanılamayabileceğini,</li>
</ul>
<p><strong>açıkça kabul ve beyan ederim.</strong></p>
${ELECTRONIC_RECORD}
</div>`

export const DIGITAL_SERVICE_WAIVER = `<div class="legal-doc">
<h2>Dijital Hizmet Hemen Aktivasyon ve Cayma Hakkı İstisnası Onayı</h2>
<p>6502 sayılı Kanun ve Mesafeli Sözleşmeler Yönetmeliği uyarınca bilgilendirme ve onay metnidir.</p>
${SELLER_BLOCK}
<h2>Abone bilgileri</h2>
{{buyerInfoBlock}}
<p><strong>Sipariş:</strong> {{orderNo}}</p>
<h2>Hizmetler</h2>
{{productList}}
<h2>Bilgilendirme</h2>
<p>SaaS (web tabanlı yazılım) hizmetleri elektronik ortamda ifa edilir. Tüketicinin onayı ile ödeme sonrası hizmetin derhâl aktif edilmesi hâlinde, ilgili mevzuat uyarınca cayma hakkı istisnası uygulanabilir.</p>
<h2>Açık onay beyanı</h2>
<p>Abone olarak;</p>
<ul>
<li><strong>Aboneliğimin ödeme sonrası hemen aktif edilmesini</strong>,</li>
<li>Kullanıcı hesabımın oluşturulmasını ve dijital hizmetin <strong>ifasına başlanmasını</strong>,</li>
<li>Bu kapsamda cayma hakkı <strong>istisnası hakkında bilgilendirildiğimi</strong> ve cayma hakkımın kullanılamayabileceğini,</li>
</ul>
<p><strong>açıkça kabul ve beyan ederim.</strong></p>
${ELECTRONIC_RECORD}
</div>`
