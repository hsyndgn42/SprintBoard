# SprintBoard ürün backlogu

Güncelleme: 22 Ekim 2026. Mevcut sürüm bakım ve hata düzeltme aşamasındadır; V2 planı yoktur. Bu dosya uygulamanın geliştirme backlogudur, ekip işlerinin tutulduğu Backlog ekranı değildir.

## Tamamlanan kapsam

### Ürün

- [x] Roadmap, proje ve feature set bağlantıları; backlog, tekrar eden işler ve iş geçmişi.
- [x] Sprint planlama, kişi atamaları, efor matrisi, kapasite ve sabit kapanış kaydı.
- [x] Pano, engeller, sprint günlüğü, acil işler ve backlog’a geri gönderme.
- [x] BAU, Defect Support rezervi, TEST ve PROD defect takibi.
- [x] Takım, fotoğraflar, kullanıcı eşleştirmesi ve admin yetkileri.
- [x] İzin ve mesai onayları; planlı ve plansız mesai, hakediş kullanımı.
- [x] Review, rapor sekmeleri, grafikler ve HTML çıktıları.
- [x] Slack defect, mesai ve backlog iş isteği alımı; admin onayı, alındı tiki ve yapılandırılabilir iş isteği şablonu; günlük ve manuel sprint özeti paylaşımı.
- [x] Slack kesinti sonrası geçmiş mesaj kurtarma, tarih aralığıyla manuel tarama ve kalıcı mesaj kimliğiyle çift kayıt önleme.
- [x] Haftalık Slack kişi bazlı mesai/hakediş raporu; Pazartesi 09:00, ayarlardan yönetim, önizleme ve manuel gönderim.
- [x] Manuel ve otomatik tam yedekleme; 10 günlük saklama ve durum göstergeleri.
- [x] Rezerv içi defectleri kapsam değişiminden ayırma; ana sayfada sprint durum toplamları; Backlog’da havuz/aktif/planlanan kombinasyonları.
- [x] Defect eforunun rezerv/ek plan yükünden ayrı gösterimi; Pano’da sayfalama olmadan tüm görev kartları.
- [x] Özel geçmiş veri olmadan boş kurulum; GitHub kaynakları ve ayrı özel Windows hazır paket.

- [x] Raporlarda kişi dağılımı grafiği artık tablonun sıralamasını izliyor; kendi iç sıralamasını dayatmıyordu ve aktif çalışan biri geçmişi daha ağır kişilerin arkasında gizlenebiliyordu. Varsayılan ilk 8 kişi, “Tümünü göster” ile filtredeki herkes açılır; kaç kişinin gizlendiği başlıkta yazar.
- [x] Review’deki “Detaylı döküm” bölümü ekrandan ve indirilen sprint özeti HTML’inden kaldırıldı; anlatı bölümleri aynı işleri zaten gösterdiği için tekrar ediyordu. Yalnız o bölümü besleyen arama/tür/sonuç filtreleri de birlikte kaldırıldı.

### Arayüz

- [x] Review bölüm geçişlerinde rotayı koruma; efor düzenleme açıklamasını planlanan sprint davranışıyla eşleştirme.
- [x] Roadmap detayında filtreli bağlı işler, sonuç/planlama/tür grafikleri ve ayrı efor–mesai özeti.
- [x] Üst barda onay bildirimi zili: Slack defect/iş isteği/mesai kuyrukları ile izin ve mesai talepleri tek sayıda toplanır, kuyruğa tıklayınca ilgili sayfaya gidilir. Yalnızca adminlere görünür; dakikada bir ve sekme öne geldiğinde yenilenir.
- [x] “Yeni iş olarak tekrarla” artık popup ile sorar: yeni iş havuza ya da henüz başlamamış bir sprinte eklenir, sonuç başarı mesajıyla bildirilir. Aktif sprint listelenmez; kapsam değişimi gerekçesiz kaydedilmez.
- [x] Havuzdaki işi sprinte alma artık aktif sprintle sınırlı değil: popup aktif ve planlanan sprintleri listeler, aktif seçilirse gerekçe zorunlu kalır, sonuç hedef sprint adıyla bildirilir.
- [x] Sprinte iş eklerken canlı kapasite uyarısı: kapasite, atanmış ve henüz kimseye atanmamış efor ayrı gösterilir, aşım olursa açıkça uyarılır. Kaydetmeyi engellemez; efor düzeltmesi ya da planlı mesai ile yer açılabilir. Kapasite kaydı yoksa sıfır sayılmaz, hesaplanamadığı söylenir.
- [x] Henüz başlamamış sprintte işi backlog havuzuna geri gönderme: planlama notu ve onay istenir, iş Undone sayılmaz ve kapsam değişimi olarak kaydedilmez. Aktif sprintte bu akış Pano’da kalır.
- [x] Aktif sprintte çalışılmış bir işi (Todo dışı ya da engelli) geri gönderirken uyarı: atamalar silindiği için harcanan saatler kapasitede boş görünür ve iş teslimat oranının paydasından düşer. Engellemez; doğru yolu somut olarak gösterir — Undone kapat, eforu harcanana çek, kalan kapasiteyi başka işe ya da izne aç.

- [x] Tasarım token’ları (`--sb-*`), paylaşılan yükleme/boş/hata durumları ve ayar kategorileri.
- [x] Ana sayfa (dashboard) yeniden tasarımı ve genel bakış sinyalleri.
- [x] Rapor bağlamı, dönem ve veri tazeliği gösterimi; rapor çıktılarında metodoloji ve metrik tanımları.
- [x] Varsayılan olarak kaçışlı (escape) HTML tablo üretimi ve erişilebilir tablo başlıkları.
- [x] Ağır route’ların lazy yüklenmesi ve initial bundle küçültmesi.
- [x] **Sprint Review anlatısı:** yönetici özeti, planlanan/tamamlanan, teslim edilen, tamamlanmayan, kapsam değişimi ve riskler sırası; bölüm gezinmesi.
- [x] **Sunum (toplantı) modu:** tam ekran görünüm, Esc ile çıkış, odak geri dönüşü, otomatik ilerleme yok, `prefers-reduced-motion` desteği.
- [x] **Standalone Review HTML’i:** dış CSS/font/JS/CDN ve ağ isteği olmadan açılan tek dosya; boş bölümler atlanır.
- [x] A4 yazdırma düzeni; `0` ile “veri yok” (`—`) ayrımı ve birleşik sağlık skoru üretmeme kuralı.

## Açık takip konuları

| Öncelik | Konu | Tamamlanma ölçütü |
| --- | --- | --- |
| P1 | Geçmiş izin ve mesai mutabakatı | Kalan tür ve ara bakiye farkları ürün sahibiyle teyit edilir; kayıtlar tahminle değiştirilmez. |
| P1 | Önceki veritabanı değişiminin kök nedeni | Eski DB dosyasının canlıya geçiş nedeni kesinleştirilir. Sabit DB yolu, doğrulanmış yedek ve güncellemede veri karşılaştırması sürdürülür. |
| Sürekli | Kullanıcı kabulü ve defect fix | Bildirilen hatalar yeniden üretilir, düzeltilir ve regresyon testiyle kapatılır. |

## Ölçülüp ertelenen maddeler

Bu maddeler incelendi ve **kanıtla** ertelendi; tekrar gündeme gelirse sıfırdan tartışmaya gerek yoktur.

### Backlog sunucu tarafı sayfalama

İzole örnekte ölçüldü: sunucu gidiş-dönüşü 6 ms, kayıt başına yük 924 bayt, 5000 kayıtta istemci filtresi geçiş başına ~1,4 ms. Projeksiyon: 200 kayıt ≈ 180 kB, 1000 kayıt ≈ 902 kB.

Filtreleme darboğaz değildir ve ekran zaten istemci tarafında sayfalar. Tek takımlı kullanımda gerçekçi boyutta (≤200 kayıt) kullanıcıya yansıyan bir sorun yoktur. **Yeniden değerlendirme eşiği: ~500 kayıt (≈450 kB).**

### Toplu durum değiştirme

Doğrulama merkezîdir: hem `PATCH /api/tasks/{id}` hem `PATCH /api/self/tasks/{id}/status` aynı `WorkspaceService.updateTask` üzerinden geçer. Ancak toplu uygulama güvenilir değildir:

- `updateTask` sprint satırını kilitler ve ilk kural ihlalinde hata atar.
- Self-servis yolu görev başına `expectedStatus` ister (iyimser kilitleme).
- BAU işleri manuel durum değişimini tamamen reddeder; geçerli hedef durumlar göreve göre değişir.
- İstek başına transaction olduğundan N ayrı çağrı **sessiz kısmi uygulama** üretir.

Atomik davranış ancak yeni bir backend endpoint’i ile sağlanabilir. Bu bir sunum ihtiyacı olmadığından ertelendi.

## Kapsam dışı

Çok instance, farklı veritabanına geçiş, SSO ve OCP/ağ yayını için güvenlik ve işletim kabulü bu sürümün tamamlanmış kapsamı değildir. Yeni özellikler ayrıca kararlaştırılır.

## Başvuru

- [Kullanıcı kılavuzu](docs/USER_GUIDE.md)
- [Kurulum ve işletim](README.md)
- [Admin hesap kurtarma](docs/USER_GUIDE.md#sifre-degistirme-ve-admin-kurtarma)
- [Veri uyumluluk planı](docs/data-compatibility-plan.md)

Tamamlanmış iterasyonların ayrıntılı inceleme/plan/sonuç dokümanları Git geçmişinde kalır; güncel durum bu kısa liste üzerinden izlenir.
