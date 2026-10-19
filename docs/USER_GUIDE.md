# SprintBoard kullanıcı kılavuzu

18 Ekim 2026 sürümü. Bu kılavuz ilk ayarlardan sprint kapanışına kadar admin ve ekip üyesinin günlük işlemlerini anlatır. Örnek sayılar açıklama içindir; canlı kayıtları değiştirmez.

## İçindekiler

1. [İlk kurulum ve ilk giriş](#ilk-kurulum-ve-ilk-giris)
2. [İlk ayarlar](#ilk-ayarlar)
3. [Roller ve temel kavramlar](#roller-ve-temel-kavramlar)
4. [Roadmap oluşturma](#roadmap-olusturma)
5. [Backlog yönetimi](#backlog-yonetimi)
6. [Sprint oluşturma ve başlatma](#sprint-olusturma-ve-baslatma)
7. [Sprinte iş ekleme ve atama](#sprinte-is-ekleme-ve-atama)
8. [Kapasite ve efor](#kapasite-ve-efor)
9. [Pano ve sprint günlüğü](#pano-ve-sprint-gunlugu)
10. [İşi sprintten çıkarma](#isi-sprintten-cikarma)
11. [İzin girme ve onaylama](#izin-girme-ve-onaylama)
12. [Mesai planlama ve gerçekleşen mesai](#mesai-planlama-ve-gerceklesen-mesai)
13. [Defect ve Support rezervi](#defect-ve-support-rezervi)
14. [Review ve raporlar](#review-ve-raporlar)
15. [Sprint kapatma ve tekrar eden işler](#sprint-kapatma-ve-tekrar-eden-isler)
16. [Slack kullanımı](#slack-kullanimi)
17. [Yedekleme ve sorun giderme](#yedekleme-ve-sorun-giderme)

<a id="ilk-kurulum-ve-ilk-giris"></a>
## İlk kurulum ve ilk giriş

### Mevcut sistemi açma veya yeni bilgisayara taşıma

1. Özel hazır Windows x64 paketinde Java dahildir: ZIP’i tamamen çıkarın. Kaynaktan derleme için Java 21, Node.js 20.19+ ve Maven 3.9+ gerekir.
2. Yeni bilgisayara taşırken uyumlu uygulama paketini ve **tam ZIP yedeğini** kullanın. [README geri yükleme adımlarını](../README.md#tam-yedeği-geri-yükleme) izleyerek DB’yi ve eşleşen Slack anahtarını yerleştirin.
3. Proje klasöründe `start-sprintboard.cmd` çalıştırın. Varsayılan adres `http://127.0.0.1:4181/`.
4. Yedekten taşınan sistemde mevcut kullanıcı adı ve parolanızla giriş yapın. İlk admin oluşturma ekranını beklemeyin; hesaplar yedekte bulunur.
5. Genel bakışta sprintleri, Takım’da kişileri ve Ayarlar’da yedek/Slack durumunu kontrol edin.

### GitHub kaynaklarından boş kurulum

1. `master` kaynaklarını indirin ve [README derleme adımlarını](../README.md#kaynaktan-derleme) izleyin.
2. Windows’ta `first-install.cmd` çalıştırıp `EVET` yazın. Bu işlem yalnız DB yoksa yeni boş çalışma alanı oluşturur; mevcut DB’yi sıfırlamaz.
3. Tarayıcıda ilk admin hesabını oluşturun. Takım, roadmap, backlog ve sprintler boş başlar. BAU şablonları ve iş türleri hazır gelir.
4. Aşağıdaki ilk ayarları tamamlayın. Slack kullanacaksanız kendi çalışma alanınızı, kanalları ve tokenları girin.
5. Sonraki açılışlarda `start-sprintboard.cmd` kullanın.

Özel hazır paket güncel verileri ve hesapları içerir; ilk kurulum yapmayın, doğrudan normal başlatıcıyı kullanın. Aynı Slack uygulamasına bağlı eski servisi önce durdurun. Paketi GitHub’a yüklemeyin; kopyalar arasında sonradan yapılan değişiklikler otomatik taşınmaz.

### İlk admin hesabı

Henüz hesap açılmamışsa **Yönetici hesabını oluştur** ekranı gelir. Kullanıcı adı ve en az 12 karakterlik parola belirleyin. Hazır veya ortak varsayılan parola yoktur. Parolayı ekiple paylaşmak yerine her kullanıcı için ayrı hesap açın.

Üst sağdaki baş harflerinizden kendi parolanızı değiştirebilirsiniz. Admin parolası unutulduysa [yerel hesap kurtarma kılavuzunu](account-recovery.md) kullanın; canlı DB’yi sıfırlamayın.

<a id="ilk-ayarlar"></a>
## İlk ayarlar

Admin olarak aşağıdaki sırayı takip edin. Mevcut sistemi yedekten açtıysanız önce kayıtlı ayarları kontrol edin; aynı kişileri veya tatilleri yeniden oluşturmayın.

### 1 Ekip ve çalışma düzeni

**Ayarlar → Ekip ve çalışma düzeni** bölümünü açın. Ekip adı, çalışma haftası, günlük varsayılan saat ve odak ayarlarını kontrol edip kaydedin. Örneğin haftada beş çalışma günü ve günde 8 saat kullanılabilir. Kapasite bu kurallardan hesaplanır; takvimdeki her gün çalışma günü değildir.

### 2 Tahmin yöntemi

**Ayarlar → Tahmin yöntemi** bölümünden **Size + efor** veya **Story Point + efor** seçin. Bu ekip Size + efor kullanır. Size göreli büyüklük, saat kişi yüküdür; aralarında otomatik dönüşüm yapılmaz.

### 3 Takım ve kullanıcılar

1. **Takım → Üye ekle** ile kişiyi oluşturun veya mevcut kişinin **Profili düzenle** düğmesini kullanın.
2. Ad, unvan, uzmanlık/rol, çekirdek veya Support katılımı ve katılım tarihlerini kontrol edin. PO/Lead ve Architecture ekip sunumundaki rollerdir.
3. **Fotoğraf ekle/değiştir** ile PNG veya JPEG yükleyin. Fotoğraf DB’de ve yedekte tutulur. Review ekibinde çekirdek üyeler ve Architecture gösterilir; diğer Support üyelerinin de takımda fotoğrafı olabilir.
4. **Ayarlar → Kullanıcılar ve erişim** altında her kişiye ayrı hesap açın ve hesabı ilgili takım üyesiyle eşleştirin.
5. Normal kullanıcı için USER, ürün yöneticisi için ADMIN rolünü kullanın. Takımdaki PO/Lead unvanı ile uygulamanın ADMIN yetkisi birbirinden bağımsızdır.

Hesabı üyeye bağlanmamış kullanıcı kendi görev/izin/mesai işlemlerini yapamaz. Kişiyi pasifleştirmek geçmişi silmez; İzinler ve Fazla mesai kişi listelerinde pasif üyeler gösterilmez.

### 4 Çalışma takvimi

**Ayarlar → Çalışma takvimi** altında resmi tatil, şirket izni ve diğer çalışılmayan günleri girin. Tüm ekip veya ilgili kişi kapsamını doğru seçin. Bu ekibin kuralına göre yarım günlük resmi tatilleri de bir tam çalışılmayan gün olarak kaydedin.

Tüm ekibe verilen şirket tatilini takvimden girin; aynı günler için ayrıca herkese kişisel izin açmayın. Tarihi bilinen izin ve çalışılmayan günün çakışması hesaplamada dikkate alınır; tarihi belirsiz geçmiş izinleri elle kontrol etmek gerekir.

### 5 BAU varsayılanları ve iş türleri

**Ayarlar → BAU varsayılanları** altında yeni sprintte oluşacak şablonları ve kişi başı günleri düzenleyin. Team Meeting, Team Support, Training ve On Leave örneklerdir. Defect Support rezervini de planlama kararınıza göre kullanın.

Otomatik kişi eforu çekirdek ekip içindir; Support ve Architecture üyelerine otomatik saat yazılmaz. Şablon değişikliği geçmiş sprintleri yeniden hesaplamaz. Tatilli kısa sprintte Meeting/Support günlerini o sprintin kişi atamalarından gözden geçirin.

**Ayarlar → İş türleri** altında ihtiyaç duyulan alt kırılımları yönetin. DEV, DESIGN, ANALYZE, TEST, DEFECT ve BAU kategorilerini; TEST için fonksiyonel/E2E/regresyon/performance, DEFECT için TEST DEFECT/PROD DEFECT ayrımlarını kullanın.

### 6 Slack ve yedekleme

Slack isteğe bağlıdır; [Slack bölümündeki](#slack-kullanimi) ayarları tamamlayın. **Ayarlar → Yedekleme ve veri güvenliği → Şimdi yedek al** ile ilk ayarlarınızdan sonra tam yedek oluşturun. Sonucun başarılı olduğunu ve sonraki otomatik zamanı kontrol edin.

<a id="roller-ve-temel-kavramlar"></a>
## Roller ve temel kavramlar

| Kavram | Anlamı |
| --- | --- |
| Roadmap | Proje, feature set veya genel hedef; birçok işi gruplar. |
| Backlog havuzu | Henüz sprintte olmayan, planlanabilir işler. |
| Sprint görevi | Bir backlog işinin sprintte planlanan görevi ve kişi atamaları. |
| BAU | Düzenli operasyon işleri; durum takibi yerine otomatik Done kabul edilir. |
| X destek | Kişinin destek katılımı; sayısal saat ve kapasite yükü değildir. |
| ADMIN | Plan, atama, hesap ve ayar yönetir; herkes için doğrudan izin/mesai girebilir ve talepleri onaylar. |
| Bağlı USER | Kendi atanmış işlerini ilerletir ve günlük ekler; kendi izin/mesai taleplerini admin onayına yollar. |

Temel akış: **Roadmap hedefi → Backlog işi → Sprint görevi → Review ve kapanış**. Her işin roadmap bağlantısı zorunlu değildir. Genel BAU işlerini proje/feature set yerine **Genel türündeki BAU** hedefine bağlayın.

<a id="roadmap-olusturma"></a>
## Roadmap oluşturma

1. **Roadmap** ekranında yeni hedef oluşturma düğmesini açın.
2. Başlık ve açıklama girin; türü **Proje**, **Feature set** veya **Genel** seçin.
3. Varsa **Referans ID** alanına TC kodunu veya kurum içi referansı girin. Bu alan sistemin iç kimliğinden ayrıdır.
4. Durum, öncelik ve hedef tarihini belirleyip kaydedin.
5. Hedefi açıp **Backlog işi ekle** ile doğrudan o hedefe bağlı iş oluşturun. Mevcut backlog işlerinin roadmap seçimini de değiştirebilirsiniz.

Roadmap durumu elle yönetilir. Bir hedefi tamamlandı yapmak bağlı işleri veya sprinti otomatik kapatmaz. Proje eforunu **Raporlar → Roadmap eforu** bölümünden izleyin.

<a id="backlog-yonetimi"></a>
## Backlog yönetimi

### Yeni iş

1. **Backlog → Yeni iş** düğmesini açın.
2. İş adı, kabul kriterleri/kapsam, iş tipi ve gerekli alt türü girin.
3. Roadmap seçin veya **Roadmap hedefine bağlı değil** bırakın.
4. Size ya da Story Point, tahmini saat, öncelik ve varsa bağımlılıkları doldurun.
5. Kaydedin. İş havuzda görünür; bu aşamada kişi atamak zorunlu değildir.

Kabul kriteri, göreli tahmin veya bağımlılık eksiklikleri hazırlık uyarısı oluşturabilir. Sprinte alırken bunları düzeltin veya sunulan uyarıyı bilinçli olarak onaylayın.

### Görünüm seçimi

| Seçenek | Gösterdiği kayıtlar |
| --- | --- |
| Havuz + aktif + planlanan | Havuz ve açık sprintlerin tüm işleri; kapanmış sprint sonuçları hariç. |
| Yalnız havuz | Yeni planlanabilecek işler ve oluşturulmuş devam kayıtları. |
| Yalnız aktif sprint | Devam eden sprintin işleri; o sprintte Done olan işler dahil. |
| Yalnız planlanan sprint | Henüz başlamayan sprintlere alınmış işler. |
| Havuz + aktif sprint | Havuz ve aktif sprint işleri. |
| Havuz + planlanan sprint | Havuz ve başlamayan sprintlerin işleri. |
| Aktif + planlanan sprint | Havuz hariç tüm açık sprint işleri. |
| Tüm işler | Havuz, sprint ve geçmiş Done/Undone kayıtları. |
| Done işler | Tamamlanmış işler. |

İş adına tıklayarak detay ve geçmişini açın. Havuzdaki işi düzenleyebilirsiniz. Sprintteki işin durumunu ve atamalarını sprint ekranından yönetin. Admin, açık sprint işinde görev adını düzenleyebilir; önceki ad günlüğe yazılır.

### Silme

Yalnız havuzdaki ve başka kayıtların bağlı olmadığı işlerde silme kullanılabilir. **Evet, işi sil** kalıcı silmedir; geri dönüş için yedek gerekir. Sprintten çıkarma ile aynı işlem değildir. Geçmişi veya bağımlılıkları olan işler sistem tarafından korunur.

<a id="sprint-olusturma-ve-baslatma"></a>
## Sprint oluşturma ve başlatma

1. Admin olarak **Sprintler → Yeni sprint** seçin.
2. Sprint adını, başlangıç ve bitiş tarihini girin. **Hedef isteğe bağlıdır**, daha sonra ekleyebilirsiniz. Bitiş günü hesaplamaya dahildir; kapasitede yalnız çalışma takvimine uyan günler sayılır.
3. **Sprint oluştur** düğmesine basın. Sprint **Planlanan** bölümüne gelir, mevcut aktif sprint değişmez.
4. Otomatik BAU işlerini ve kişi saatlerini kontrol edin. On Leave izinlerden türetilir; normal görev eforu gibi artırılmaz.
5. Kapasiteyi ve iş atamalarını hazırlayın.
6. Hazır olduğunda **Sprinti başlat** seçin. Önce mevcut aktif sprintin kapanışını tamamlayın.

Örnek: Pazartesi–cuma çalışan ekipte 6–26 Ekim 2026 aralığı, iki sınır da dahil, tatil ve izin düşülmeden önce 15 çalışma günüdür.

### Sprint bilgilerini düzeltme

Admin, planlanan veya aktif sprintin üstündeki **Sprinti düzenle** düğmesinden ad, hedef ve tarih aralığını değiştirebilir. Kapalı sprintin sabit kapanış kaydı değiştirilemez. Tarih değişikliği kapasiteyi yeniden hesaplar; görev eforları, elle ayrılan günler ve planlı mesai kendiliğinden değiştirilmez. Mevcut izin, mesai talebi veya günlük çalışma notunu dışarıda bırakan tarih aralıkları reddedilir. Düzenlemeden sonra Kapasite ve Planlama sekmelerini kontrol edin.

Fazla mesai, İzin, sprint Planlama, Efor matrisi, Review ve Sprint günlüğündeki ana bölümler başlıklarına tıklanarak açılır/kapanır. Başlığa klavyeyle gelip Enter veya Space de kullanabilirsiniz. Kapalı bölümlerin verileri silinmez; Review yazdırılırken bölümler açılır, yazdırma sonrasında önceki görünüm geri gelir. HTML çıktısının kapsamı değişmez.

<a id="sprinte-is-ekleme-ve-atama"></a>
## Sprinte iş ekleme ve atama

### Havuzdan alma

1. Aktif veya planlanan sprinti açıp **İş ekle → Backlog’dan seç** seçin.
2. İşi seçin ve hazırlık uyarılarını değerlendirin.
3. Aktif sprinte ekliyorsanız sprinte alma gerekçesini yazın. Gerekliyse **Acil / plansız iş** seçin; sonradan gelen her iş otomatik acil değildir.
4. **Sprinte ekle** ile kaydedin.
5. **Planlama** sekmesinde işin atamalarını açın; kişileri seçip her biri için saat veya **X destek** girin ve **Atamaları kaydet** seçin.

### Doğrudan yeni iş

**İş ekle → Yeni iş oluştur** ile iş alanlarını ve kişi eforlarını aynı pencerede doldurabilirsiniz. **Oluştur ve sprinte ekle** hem backlog bağlantısını hem sprint görevini oluşturur; önce Backlog sayfasına gitmeniz gerekmez.

Defect için efor kaynağını ayrıca seçin. Rezervden karşılanan bölüm ile ek yük ayrımı [Defect bölümünde](#defect-ve-support-rezervi) açıklanır.

<a id="kapasite-ve-efor"></a>
## Kapasite ve efor

**Kapasite** kişi satırında ayrılan gün, izin, çalışılmayan gün, planlı mesai, kapasite, atanan saat ve farkı gösterir. **Gün düzenle** ile sprintte ayrılacak günü değiştirebilirsiniz. Kişisel çalışma saatleri/katılım ayarlarını Takım ekranından kontrol edin.

- Fark = kullanılabilir kapasite − atanan plan. Pozitif fark boş kapasite, negatif fark kapasite üzerinde plan anlamına gelir.
- Onaylanan izin kapasiteyi azaltır; atanmış işlerin saatlerini otomatik azaltmaz.
- Çekirdek ekip kapasitesi ile çekirdek planı karşılaştırın. Dış Support planı ayrı katkıdır; çekirdek kapasiteye eklenmez.
- X destek 0 saatlik katılımdır; görev listelerinde görünür, saat toplamını artırmaz.
- Kapasite üzerinde plan yapılabilir; bu tek başına veri hatası değildir. İş azaltma, destek alma veya planlı mesai kararını ayrıca verin.
- **Efor matrisi** iş–kişi dağılımını topluca kontrol etmek içindir; mesai hakediş defteri değildir.

Örnek: 15 gün × 8 saat = 120 saat kapasitede 4 gün BAU + 11 gün teslimat toplam 120 saattir. 1 gün izin onaylanırsa kapasite 112 saate düşer; aynı iş planı korunursa fark −8 sa olur.

<a id="pano-ve-sprint-gunlugu"></a>
## Pano ve sprint günlüğü

**Pano** üzerinde işi Yapılacak, Devam ediyor, Done veya Undone durumuna ilerletin. Bağlı kullanıcı kendi atanmış işlerini, admin yetkili olduğu işleri yönetir.

- **Undone** seçerken açıklama girin. Undone işin tamamlanmadığını belirtir; doğrudan havuza gönderme işlemi değildir.
- **Engel bildir** ile gerekçe kaydedin. Engel ayrı bir işaretlemedir, görev durumunu değiştirmez. Çözüldüğünde **Engeli kaldır** ve çözüm notunu kullanın; Done/Undone öncesinde engeli kaldırın.
- BAU durumları otomatik Done kabul edilir; normal durum kontrolü beklemeyin.
- **Sprint günlüğü** altında ilgili görev ve güne çalışma notu ekleyin. Notlar sprintte gün bazında görülebilir. Durum ve kapsam işlemlerinin denetim izi ayrıca tutulur.

<a id="isi-sprintten-cikarma"></a>
## İşi sprintten çıkarma

1. Admin olarak açık sprintin **Pano** sekmesinde ilgili işi veya detayını açın.
2. **Backlog’a geri gönder** düğmesini seçin.
3. Gerekçeyi yazın; varsa yerine alınan acil işi ilişkilendirin.
4. Onay kutusunu işaretleyip işlemi tamamlayın.

İş Undone yapılmadan havuza döner. O sprintteki görev ve kişi atamaları kaldırılır; kapsam geçmişindeki kopyası korunur. Tekrar sprinte alındığında kişi atamalarını yeniden planlayın. Done işlerde ve otomatik BAU şablonlarında bu düğme gösterilmez; kapalı sprintler düzenlemeye açık değildir. Bağlı kayıtlar varsa sistemin koruma uyarısını izleyin.

<a id="izin-girme-ve-onaylama"></a>
## İzin girme ve onaylama

### Admin doğrudan izin girişi

1. **İzinler** ekranında yeni izin kaydını açın.
2. Üyeyi ve sprinti seçin.
3. **Yıllık izin**, **Mesai hakedişinden izin** veya **Şirket izni (hakedişten düşmez)** seçin.
4. Kullanılan çalışma günü sayısını girin. Tarihler biliniyorsa başlangıç ve bitişi de girin; hafta sonu ve tatilleri izin gününe eklemeyin.
5. Mesai izninde yeni kayıt için **Yeni kullanım — bakiyeden düş** seçin. **Geçmiş bakiyede zaten düşülmüş** yalnız doğrulanmış tarihsel kayıtlar içindir.
6. **İzni kaydet** ile tamamlayın; kişinin sprint kapasitesini kontrol edin.

### Ekip üyesi talebi

Üyeye bağlı USER, **İzinler → İzin talebi** üzerinden aktif sprintini, türü, sprint içindeki tarihleri, gün sayısını ve açıklamasını girip **Onaya gönder** seçer. Admin, izin taleplerinden onaylar veya reddeder ve karar notu girer.

Bekleyen/reddedilen talep kapasiteyi veya bakiyeyi etkilemez. Onaydan sonra izin kaydı oluşur; mesai izniyse kullanım da tek kez düşer. Aynı talebi ayrıca doğrudan izin olarak kaydetmeyin.

### On Leave ve sonradan izin

İzinler sprintin **On Leave** görünümüne yansır; ayrıca On Leave görevine saat atamayın. İzin kapasiteden bir kez düşülür ve görev eforuna eklenmez. Sprint ortasında onaylanan izin, mevcut atamalar sabit kaldığı için kapasite aşımı yaratabilir. Bu durumda planı yeniden değerlendirin.

Admin, uygun kayıtta düzenle/sil işlemlerini kullanabilir. Sabit kapanışlı sprintlerin gün ve tarih bilgileri korunur; geçmiş tür düzeltmesinin bakiye etkisini kontrol edin.

<a id="mesai-planlama-ve-gerceklesen-mesai"></a>
## Mesai planlama ve gerçekleşen mesai

### Planlı mesai

1. Aktif veya planlanan sprintte **Kapasite** sekmesini açın.
2. Kişi satırında **Planlı mesai ekle** seçin.
3. Saat, varsa ilgili görev ve notu girin. Kapasite önizlemesini kontrol edip kaydedin.
4. Yanlış giriş veya vazgeçme durumunda **Planlı mesaileri yönet** üzerinden düzenleyin veya silin.

Planlı mesai kapasiteyi artırır; gerçekleşen mesai veya hakediş oluşturmaz. “Mesai” adında ayrı bir görev açmak gerekmez. Gerçek işlere kişi eforu atayın. Plan düzenleme/silme kapasiteyi günceller; gerçekleşmiş mesaiyi silme işlemi değildir.

### Gerçekleşen mesai ve admin onayı

Kişi çalışmayı yaptıktan sonra uygulamadaki **Mesai talebi** ile veya Slack mesai kanalından bildirir. Admin onay ekranında kişiyi/sprinti, saati ve ilgili görevi kontrol eder; **planlı mesaiyle eşleştirir** veya **plansız** olarak ayırır. Karar notuyla onayladığında gerçekleşen mesai ve hakediş oluşur.

Admin ayrıca **Fazla mesai → Mesai kaydı** ile istediği aktif üye için doğrudan giriş yapabilir. Aynı çalışma hem talepten onaylanıp hem doğrudan kaydedilmemelidir. Plan/gerçekleşen eşleştirmesi gereken durumlarda onay akışını kullanın.

| Gösterge | Anlamı |
| --- | --- |
| Planlanan | Önceden ayrılan mesai saati. |
| Gerçekleşen | Onaylanan veya admin tarafından kaydedilen çalışma. |
| Kalan | Planın henüz gerçekleşmeyen kısmı. |
| Aşan | Aynı plana bağlı gerçekleşenin planı geçen kısmı. |
| Plansız | Önceden ayrılmış plana bağlanmayan gerçekleşen mesai. |

Örnek: 16 saat plan, 12 saat gerçekleşen → 4 saat kalan. Gerçekleşen 20 saate çıkarsa 4 saat aşan görünür. Gerçekleşen saat kapasiteye veya görev eforuna ikinci kez eklenmez; fazla kapasite kararı ayrıca yönetilir.

### Mesai izni ve Roadmap bağlantısı

Mesai hakedişinden izin kullanımı **İzinler** sayfasından girilir. Fazla mesai ekranında ikinci kullanım kaydı açmayın. Kişi listesinde toplam mesai saati ve kullanılan hakediş günü; isme tıklayınca sprint bazlı döküm görünür.

Mesai kaydında görev seçildiğinde görevin o andaki Roadmap bağlantısı saklanır. **Genel / göreve bağlanmadı** kayıtları projeye dağıtılmaz. Roadmap raporunda mesai ayrı kolondur; görev planına eklenerek iki kez sayılmaz. Görev planı fiili zaman ölçümü değildir.

<a id="defect-ve-support-rezervi"></a>
## Defect ve Support rezervi

1. Planlamada **BAU → Defect Support** işine ilgili kişilerin rezerv saatlerini ayırın. Team Support’tan pay ayırıyorsanız oradaki saatleri aynı miktarda azaltın.
2. Gelen hatayı **DEFECT → TEST DEFECT** veya **PROD DEFECT** olarak açın; ortamı, önem derecesini ve bildiren bilgisini kontrol edin.
3. Sprinte alırken **Efor kaynağı** olarak o sprintin Defect Support rezervini seçin ve kişi eforlarını planlayın.
4. Aynı kişinin rezervinden karşılanan efor ikinci kez plan yükü oluşturmaz. Tamamen rezerv içinde kalan defect, acil iş veya kapsam artışı sayılmaz; geri çıkarılması da kapsam azalışı sayılmaz. Hareketi silinmez, akış geçmişinde **Rezerv içi** olarak görünür. Review, kapsam raporu ve HTML çıktıları aynı ayrımı kullanır. Rezerv dışındaki veya rezervi aşan ek efor, aktif sprintte acil/plansız yük olarak ayrılır.
5. Defecti normal pano durumlarıyla takip edin. Done olduğunda çözülmüş/kapanmış kabul edilir; ayrı doğrulayan kişi adımı yoktur.

Örnek: 16 saat rezerv ve bunun içinde 6 saat defect, toplamda 22 saat plan değildir. 16 saatlik planın 6 saati defectlere ayrılmıştır. Defect sayıları ve TEST/PROD çözüm durumu Review ve raporlarda ayrıca görünür.

<a id="review-ve-raporlar"></a>
## Review ve raporlar

### Sprint Review

Sprintin **Review** sekmesi o sprintin anlık durumunu gösterir: teslimat sonucu, Size/SP dağılımı, iş tipleri, acil kapsam, defect çözümü, mesai ve dış destek.

- Teslimat oranı BAU hariçtir. BAU işler Review’de otomatik Done kabul edilir.
- Göreli tahmin dağılımı BAU hariç gösterilir.
- Mesai o sprintin gerçekleşen/planlanan saatleridir; tüm dönemlerin bakiyesi değildir.
- Dış Support / Architecture kişi saatleri Defect Support rezervinden farklıdır.
- **Sprint özeti HTML indir** çevrimdışı sunulabilir dosya oluşturur. Slack’e gönderilen Review HTML’i aynı sprint için ayrıca kişi mesai ve izin özetlerini içerir.
- Fotoğraflar çıktıya gömülür; eski HTML dosyası kendiliğinden güncellenmez. Son durumu göstermek için yeniden üretin.

### Rapor sekmeleri

1. **Raporlar** ekranını açın.
2. İlgili sekmeyi seçin; sprint/dönem ve varsa kişi filtrelerini uygulayın.
3. Grafik ve tabloyu birlikte değerlendirin.
4. O sekmenin **HTML indir** düğmesiyle filtrelenmiş çıktıyı alın. HTML tarayıcıdan yazdırılarak PDF’e çevrilebilir.

| Sekme | Kullanım |
| --- | --- |
| Acil işler / kapsam | Sprint içinde eklenen ve çıkarılan işlerin etkisi. |
| Sprint teslimatı | Done/Undone sonuçları ve sprint karşılaştırması. |
| Kişi dağılımı | İş sayısı, efor, Size ve sonuç dağılımı. |
| Katılım bağlamı | Kişinin kapasitesi, izni ve X destek katılımı. |
| İş tipleri | DEV, DESIGN, ANALYZE, TEST, BAU ve alt türler. |
| Roadmap eforu | Proje/feature set başına görev planı ve ayrı mesai kolonu. |
| Kapasite trendi | Çekirdek kapasite, çekirdek plan ve ayrı Support planı. |
| Defect | TEST/PROD kırılımı, açık/çözülen işler ve trend. |
| Mesai | Kişi ve sprint bazlı mesai, kullanılan mesai izni ve plan/gerçekleşen trendi. |

Kişi raporunu tek başına performans sıralaması olarak okumayın; izin, rol, iş büyüklüğü ve destek katkısı farklıdır. Kişisel izin/mesai ve fotoğraf içeren çıktıları yalnız uygun kitleyle paylaşın.

<a id="sprint-kapatma-ve-tekrar-eden-isler"></a>
## Sprint kapatma ve tekrar eden işler

### Kapanış

1. Pano sonuçlarını, engelleri, kişi atamalarını, izin/mesai taleplerini ve Review’ü kontrol edin.
2. Admin olarak aktif sprintte **Sprinti tamamla** seçin.
3. **Kapanış önizlemesi** içindeki Done, Undone, kapasite ve yeni backlog sayısını inceleyin.
4. Yeniden planlanacak tamamlanmamış işlerde **Backlog’a taşı** seçimini bırakın; yalnız geçmişte kalacakları kaldırın.
5. Kontrol/onay seçimini tamamlayıp kapanışı kaydedin.

Todo ve Devam ediyor teslimat işleri Undone kapanır; BAU otomatik Done olur. Seçilen tamamlanmamış iş için yeni, önceki işe bağlı bir backlog kaydı oluşur. İşaretlenmeyen Undone kayıt otomatik olarak yeni havuz işi olmaz. Sonraki sprintin BAU işleri kendi şablonlarından oluşur; BAU ayrıca taşınmaz.

Kapanış, görev/atama/kapasite ve tahmin yöntemini sabitler. Sonradan yapılan ekip veya ayar değişikliği bu kapanış görünümünü yeniden yazmaz. Kapalı sprinti normal ekranlardan yeniden açma akışı yoktur; hata varsa önce yedek alıp kontrollü düzeltme talep edin.

### Tamamlanmış işi yeniden yapmak

1. **Backlog → Done işler** veya **Tüm işler** görünümünde eski işi bulun.
2. **Yeni iş olarak tekrarla** düğmesini kullanın.
3. Oluşan yeni kaydı **Yalnız havuz** görünümünde açın; adını, kapsamını, tahminini, Roadmap ve bağımlılıklarını yeni ihtiyaca göre düzenleyin.
4. Yeni sprinte alın ve kişileri/saatleri yeniden atayın.

Eski Done sonucu ve geçmiş sprint korunur; eski işi tekrar Yapılacak yapmayın. Devam/tekrar bağlantısı detay geçmişinde izlenebilir. Düğmeye her basış yeni bir iş oluşturabileceğinden mükerrer kayıt açmayın.

<a id="slack-kullanimi"></a>
## Slack kullanımı

### İlk bağlantı

1. Slack uygulamasında Socket Mode’u etkinleştirin. App token bağlantı iznine, bot da kullanılacak kanalların mesaj olayları ve gerekli okuma/yazma izinlerine sahip olmalıdır.
2. Açık kanal mesajları için `message.channels` / `channels:history`; ad soyad çözümü için `users:read`; mesaj için `chat:write`, Review HTML yüklemesi için `files:write`, alındı tiki için `reactions:write` izinlerini kontrol edin. Özel kanal kullanılacaksa özel kanal olay/erişim izinlerini de ayrıca yapılandırın.
3. İzin değişikliğinden sonra uygulamayı çalışma alanına yeniden kurun; botu defect, mesai, backlog ve sprint durum kanallarına ekleyin.
4. **Ayarlar → Slack entegrasyonu** içinde çalışma alanı kimliği, defect, mesai ve backlog kanal kimlikleri ile tokenları girin. Backlog kanalını boş bırakırsanız bu kanal dinlenmez; üç giriş kanalı birbirinden farklı olmalıdır.
5. **Kaydet ve dinle** seçin ve durumun **Bağlı** olduğunu kontrol edin. Tokenlar şifreli saklanır; sonraki kayıtlarda alanları boş bırakmak mevcut tokenı silmez.

Tokenı belgeye, Git’e veya mesaja yapıştırmayın. Sunucunun Slack’e dış ağ bağlantısı açık olmalıdır. Socket Mode kullanımı uygulamanın ağa güvenli yayımlandığı anlamına gelmez.

### Defect mesajı

Defect şablonu Ayarlar’da düzenlenebilir. Şablondaki virgüllü değerler izin verilen seçeneklerdir; gerçek mesajda her alan için **tek değer** gönderin. Örnek:

```text
#defect
Tür: TEST
Başlık: OTP kodu gelmiyor
Ortam: SAT
Önem: HIGH
Hedef: BACKLOG
```

Yeni mesaj **Backlog’daki Slack onay bölümüne** düşer. Admin alanları kontrol ederek onaylar veya reddeder; geçerli onaydan önce iş oluşturulmaz. Hedef SPRINT ise aktif sprint ve efor/rezerv kararını onayda kontrol edin. Bildiren, onaylayan admin değil Slack mesajını gönderen kişidir.

### Backlog iş isteği

Ekip, backlog kanalına yeni bir ana mesaj göndererek iş talep edebilir:

```text
#backlog
Tür: DEV
Başlık: İş listesine CSV indirme eklensin
Açıklama: Filtrelenmiş işleri dosya olarak indirebilmek istiyoruz.
```

Tür alanı DEV, DESIGN, ANALYZE, TEST veya BAU olabilir. Ayarlar’daki **Backlog iş isteği şablonu** ile izin verilen türleri daraltabilir ve örnek metinleri değiştirebilirsiniz; Tür, Başlık ve Açıklama alan adları korunur. Şablondaki virgüllü liste seçenekleri tanımlar; gerçek mesajda **tek tür** yazılır. Açıklama birden fazla satır olabilir. Defect ve izinler kendi akışlarından girilir.

Admin, **Backlog → İş istekleri** bölümünü açar. Gönderenin adı ve kaynak Slack mesajını kontrol eder; başlık/açıklamayı düzenler, alt türü, Size veya Story Point’i, tahmini eforu ve varsa Roadmap’i seçer. **Onayla ve backlog’a ekle** yalnız bir havuz işi oluşturur; sprinte kendiliğinden eklemez. **Reddet** iş oluşturmadan isteği sonuçlandırır. Kararlar denetim kaydında saklanır, onaylanan ve reddedilen istekler filtrelenebilir; listeler sayfalıdır. Aynı Slack mesajının yeniden ulaşması ikinci bir iş oluşturmaz.

Hatalı formatta gelen istek onaylanamaz; doğru formatla yeni mesaj gönderin. Onay kuyrukları ve Slack bağlantı ayarları tam sunucu yedeğine dahildir; taşınabilir JSON iş verisi yedeğine dahil değildir.

### Mesai mesajı

Mesai kanalına, Ayarlar’daki sabit şablona uygun yeni mesaj gönderin:

```text
#mesai
Sprint: 16
Tarih: 2026-10-17
Saat: 4
Açıklama: Backlog çalışması
```

Her mesaj tek gün içindir. **Fazla mesai** sayfasındaki Slack onay bölümünde admin göndericiyi üyeyle, mesaiyi görevle ve varsa planlı mesai kaydıyla eşleştirir. Sonra onaylar. Görev/plan eşleştirmesi mesaj metninden tahmin edilmez.

Mesai tarihi `2026-10-5` veya `2026-1-5` gibi tek haneli gün/ay içerebilir; uygulama bunları sırasıyla `2026-10-05` ve `2026-01-05` olarak kaydeder. Takvimde olmayan günler kabul edilmez.

Hatalı veya henüz onaylanmamış mesai bildirimini açıp **Mesajı düzelt** seçin. Sprint, tarih, saat veya açıklamayı düzenleyip **Doğrula ve kaydet** düğmesine basın. Orijinal Slack mesajı ve gönderen kimliği değişmez; düzeltme admin adıyla denetim günlüğüne kaydedilir. Bu adım hakediş oluşturmaz. Ardından kişi/sprint, görev ve planlı/plansız eşleştirmesini kontrol edip **Onayla ve hakedişe ekle** seçin. Mesai tarihi seçilen sprintin içinde ve en geç bugün olmalıdır. Sonuçlanmış bildirimler bu ekrandan düzenlenemez.

Yalnız yeni ana mesajlar alınır; Slack’te yanıt yazmak veya eski mesajı düzenlemek yeni kayıt sayılmaz. Mesai, defect ve backlog format hatalarını admin uygulamadaki **Mesajı düzelt** ile giderebilir. Backlog sayfasında defect için **Onay kuyruğu**, iş istekleri için **İş istekleri** bölümünden bildirimi açın. **Doğrula ve kaydet**, içeriği güncel kanal şablonuna göre doğrular ve onay bekleyen duruma getirir; henüz iş oluşturmaz. Ardından tahmin/hedef alanlarını kontrol edip ayrıca onaylayın. Orijinal mesaj, gönderen ve Slack bağlantısı korunur; değişiklik, admin ve zaman bilgisiyle denetim günlüğüne yazılır. Onaylanan/reddedilen mesaj düzenlenemez. Başka admin mesajı değiştirmişse listeyi yenileyip güncel içeriği kontrol edin.

Geçerli defect, mesai ve backlog mesajı onay kuyruğuna kaydedildikten sonra bot, kaynak mesaja **✅** ekler. Bu işaret **“uygulama aldı, admin onayı bekliyor”** anlamındadır; admin onayı veya işin Done olduğu anlamına gelmez. Formatı hatalı mesajlara tik eklenmez; admin düzeltmesi geçerli olarak kaydedildiğinde alındı tiki sıraya konur. Slack izin/bağlantı hatasında onay kaydı korunur, tik arka planda yeniden denenir; Ayarlar’da bekleyen tik sayısı ve hata görünür. Uygulama yeniden başlasa da bekleyen işlemler korunur. Güncelleme öncesi eski mesajlar geriye dönük işaretlenmez.

### Günlük sprint paylaşımı

**Ayarlar → Slack entegrasyonu → günlük sprint özeti** bölümünde kanal, saat, etkinlik ve hafta sonu seçimini yönetin. Bu ekip için hedef her gün Türkiye saatiyle 08:00’dir. Servis açık olmalı ve tek aktif sprint bulunmalıdır.

Admin, sprintin **Review → Slack’e gönder** düğmesiyle istediği zaman seçili sprintin o anki özetini ve Review HTML’ini gönderebilir. Göndermeden önce kanalı ve kişisel mesai/izin bilgilerinin paylaşılacağını kontrol edin. Gönderilmiş dosya sonraki değişikliklerle yenilenmez; yeni paylaşım gerekir.

<a id="yedekleme-ve-sorun-giderme"></a>
## Yedekleme ve sorun giderme

**Ayarlar → Yedekleme ve veri güvenliği → Şimdi yedek al** manuel tam yedek oluşturur. Son deneme/başarı ve sonraki otomatik zamanı aynı bölümden kontrol edin. Otomatik tam yedekler 00:00, 08:00 ve 16:00’da alınır; başarılı yeni yedekten sonra 10 günden eskiler temizlenir. Servis kapalıysa o saatte yedek alınamaz.

Tam ZIP ile JSON dışa aktarımı aynı değildir. Hesaplar ve entegrasyonlarla birlikte sistem taşıma için tam ZIP kullanın; [geri yükleme adımları README’dedir](../README.md#tam-yedeği-geri-yükleme).

| Durum | Kontrol |
| --- | --- |
| Düğme görünmüyor | ADMIN/USER rolü, hesap–üye bağlantısı, kendi atamanız, sprintin kapalı olup olmadığı ve BAU otomatik yönetimi. |
| Kapasite planın altında | İzin/tatil, ayrılan gün, günlük saat/odak, çekirdek–Support ayrımı ve planlı mesai. |
| Mesai var ama proje raporunda yok | Onay durumu, görev bağlantısı ve kayıt anındaki Roadmap bağlantısı. |
| Slack mesajı gelmedi | Bağlı durumu, botun kanal üyeliği, izinler, kanal kimliği, yeni ana mesaj ve şablon formatı. |
| HTML eski bilgi gösteriyor | Yeni dosya üretin veya Slack’ten yeniden gönderin; eski dosya sabit çıktıdır. |
| Veri eksilmiş gibi görünüyor | Yeni iş girmeden servis/DB yolunu kontrol edin. DB silmeyin ve eski seed ile yeniden kurmayın; tam yedekle karşılaştırma isteyin. |
| Giriş yapılamıyor | Kullanıcı etkinliği, parola ve süreli giriş engeli. Admin kurtarma için ayrı kılavuzu kullanın. |

Kayıt sayısı arttığında sayfalama ve filtreleri kullanın. Ekranda yalnız ilk sayfanın görünmesi verinin kaybolduğu anlamına gelmez.
