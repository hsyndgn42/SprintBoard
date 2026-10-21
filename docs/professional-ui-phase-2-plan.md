# SprintBoard — Profesyonel Platform Faz 2 Planı

**Branch:** `feature/professional-platform-ui-phase-2`
**Base:** `master` @ `9ba1118` (iterasyon 2 merge commit'i)
**Kapsam:** Önceki iterasyondan devreden, tamamlanmamış veya eksik kalan profesyonel
arayüz maddeleri — özellikle **P-11 sprint review anlatısı**.

Bu faz bir mimari dönüşüm değildir. Şema değişikliği hedeflenmemektedir.

---

## 0. Önceki iterasyonda tamamlanan işler (tekrar edilmeyecek)

`docs/professional-ui-outcomes.md` kayıtlıdır. Aşağıdakiler **tamamdır** ve
somut bir eksik/regresyon kanıtlanmadıkça yeniden yapılmayacaktır:

tasarım token temeli (`--sb-*`), paylaşılan loading/empty/error (`sb-state`),
dashboard yeniden tasarımı ve katkısal overview sinyalleri, ayarlar
kategorizasyonu, kirli-form koruması, rapor bağlamı/dönem/tazelik sunumu,
export künyesi ve yöntem bölümleri, varsayılan-escape tablo üretimi,
`scope="col"` başlıkları (`presentation-html.table()`), lazy-loading ve
başlangıç paketi düşüşü, export güvenlik regresyonu, API uyumluluk koruması.

### Ölçülen başlangıç durumu (faz 2 öncesi, `9ba1118`)

İzole worktree'de `npx ng build`:

| Ölçüm | Değer |
|---|---|
| Başlangıç paketi (raw) | **504,37 kB** |
| Başlangıç paketi (transfer) | 130,44 kB |
| `insights-component` | 111,54 kB |
| `sprints-component` | 103,50 kB |
| `operations-component` | 68,13 kB |
| **`sprint-review-component`** | **52,39 kB** |
| `backlog-component` | 37,20 kB |
| `report-tab-html` | 21,82 kB |

Bu tablo faz 2 sonunda delta ile birlikte tekrar raporlanacaktır.

---

## 1. Devreden maddelerin durumu

| Kod | Madde | Önceki durum | Bu fazda |
|---|---|---|---|
| P-11 | Sprint review anlatısı | Devredildi | **Ana teslimat** |
| P-17 | Uygulama ekranı yazdırma düzeni | Kısmen | Review + sunum kapsamında |
| P-12 | Toplu durum değişikliği | Deferred | Kanıtla devam/deferred |
| P-14 | Sunucu taraflı backlog sayfalama | Gerekçelenmedi | Ölçüp karar |
| P-03 | Kapasite önbellekleme | Deferred (risk) | Kapsam dışı |

---

## 2. Maddeler

Her madde için: mevcut durum, tamamlanan kısım, kalan boşluk, kullanıcı etkisi,
çözüm, frontend kapsamı, backend kapsamı, veritabanı etkisi, güvenlik/gizlilik,
risk, kabul kriteri, test stratejisi.

---

### R-01 — Yönetici özeti (executive summary) · **Critical**

**Mevcut durum.** `sprint-review.component.html` dört KPI kartı gösteriyor
(Done/toplam, Done oranı, tamamlanmayan, planlanan efor). Standalone HTML'de
`kpis()` ile dört değer var.

**Tamamlanan.** Metrik tanımları `definitions()` ile standalone HTML'e
eklenmiş; ekranda her kartın altında kısa `data-note` var.

**Kalan boşluk.** Ortada *yönetici özeti* yok. Toplantıya giren birinin
"bu sprintte ne oldu" sorusunu tek bakışta yanıtlayacak, planlanan↔tamamlanan
karşılaştırmasını ve istisnaları birlikte veren bir blok bulunmuyor. KPI'lar
ekrana dağılmış; kapsam değişimi, acil iş, blokaj ve atanmamış iş ayrı ayrı
aşağıda gömülü.

**Kullanıcı etkisi.** Review toplantısı KPI avına dönüşüyor; yönetici
katılımcı sprintin sonucunu sayfayı gezmeden anlayamıyor.

**Çözüm.** `review.model.ts` içine **türetilmiş** bir `executiveSummary()`
fonksiyonu. Yalnız mevcut veriden hesaplar, yeni iş kuralı tanımlamaz:

| Metrik | Formül | Birim | Zaman aralığı | Boş davranış |
|---|---|---|---|---|
| Teslimat işi | `delivery.length` (BAU ve Leave hariç) | iş | sprint | 0 → "iş yok" |
| Done | `delivery.filter(done).length` | iş | sprint | 0 |
| Done oranı | `done / delivery.length` | % | sprint | payda 0 → `—`, sıfır değil |
| Tamamlanmayan | `delivery.length - done` | iş | sprint | 0 |
| Planlanan teslimat eforu | `Σ effort(delivery)` | saat | sprint | 0 |
| Planlanan BAU eforu | `Σ effort(bau)` | saat | sprint | 0 |
| Kapsam eklemesi | `scope.added.length` | iş | takip başlangıcından itibaren | takip yoksa `—` (bilinmiyor) |
| Kapsam çıkarması | `scope.removed.length` | iş | aynı | takip yoksa `—` |
| Acil / plansız | `scope.emergencies.length` | iş | aynı | takip yoksa `—` |
| Blokaj | `items.filter(t=>t.blocker?.blocked).length` | iş | anlık | 0 |
| Atanmamış teslimat | `delivery.filter(t=>!t.assignments.length).length` | iş | anlık | 0 |
| Tahminsiz teslimat | `missingSize` veya `missingPoints` | iş | sprint | 0 |
| Prod defect | `DEFECT/PROD_DEFECT` adedi | iş | sprint | 0 |
| Mesai | `operations.earned` | saat | sprint | veri yoksa bölüm gizlenir |

**Kritik kural:** **birleşik sağlık skoru üretilmeyecek.** Tanımsız kırmızı/yeşil
yargı kullanılmayacak. Sıfır ile "veri yok" görsel olarak ayrılacak (`0` vs `—`).

**Frontend kapsamı.** `review.model.ts` (+fonksiyon), `sprint-review.component.*`,
`presentation-html.ts` (aynı fonksiyonu kullanır — hesap tekrarı yok).
**Backend kapsamı.** Yok. **Veritabanı.** Yok.
**Güvenlik/gizlilik.** Yeni alan yok; kişisel izin ayrıntısı özete girmez.
**Risk.** Düşük — salt okunur türetme.
**Kabul kriteri.** Özet ekranda ve standalone HTML'de aynı sayıları verir;
payda sıfırken `—`; takip edilmeyen sprintte kapsam metrikleri `—`.
**Test.** `scripts/test-review-summary.cjs` — formül, sıfır payda, takipsiz sprint.

---

### R-02 — Anlatı sırası ve bölüm gezinmesi · **High**

**Mevcut durum.** Ekran düz bir `<details>` yığını: hero → ekip → notlar →
flow → operasyon → kapsam → KPI → sonuç dağılımı → efor → iş karması →
tahmin → BAU/izin → alt kırılım → tamamlanmayan → tüm işler.

**Kalan boşluk.** Sıra anlatısal değil; yönetici özeti yok, istisnalar
sona gömülü, bölümler arası hiyerarşi (ana bölüm vs destek bölüm) yok,
uzun sayfada gezinme aracı yok.

**Kullanıcı etkisi.** Toplantıda doğru bölümü bulmak için kaydırma gerekiyor.

**Çözüm.** İstenen anlatıya göre yeniden sıralama (kimlik → bağlam → hedef →
yönetici özeti → planlanan/tamamlanan → teslim edilen → tamamlanmayan →
kapsam → plansız → defect → kapasite → izin/mesai → istisnalar → ek).
Bölüm başlıkları `<section>` + `<h2>` ile landmark hâline getirilecek;
üstte yapışkan olmayan basit bir bölüm atlama listesi (anchor) eklenecek.
**İş mantığı değişmez; yalnız DOM sırası ve başlıklar değişir.**

**Frontend.** `sprint-review.component.html/.css`. **Backend/DB.** Yok.
**Risk.** Düşük-orta — şablon yeniden düzenlemesi; mevcut testlerin
`data-testid` ve metin beklentileri korunacak.
**Kabul kriteri.** Görsel sıra = DOM sırası; başlık hiyerarşisi h2→h3 atlamasız;
anchor'lar klavyeyle erişilebilir.
**Test.** `test-review-narrative.cjs` — bölüm sırası ve başlık hiyerarşisi.

---

### R-03 — Sunum (toplantı) modu · **Critical**

**Mevcut durum.** Yok. Toplantıda uygulama normal kabuğuyla (sidebar, üst bar,
filtreler, butonlar) yansıtılıyor.

**Kullanıcı etkisi.** Toplantı ekranında gereksiz UI gürültüsü; uzaktan
okunamayan tipografi; yanlışlıkla veri değiştirme riski.

**Çözüm.** Review ekranında **sunum modu** durumu. Gerçek bir mod:
uygulama navigasyonu ve düzenleme kontrolleri gizlenir, tipografi ve boşluk
toplantı ekranına göre büyür, tüm bölümler açık gelir (katlanmış `<details>`
sunumda açılır), çıkış her zaman görünür.

**Gereksinimler (prompt §4).** Belirgin çıkış; `Escape` ile çıkış; odak
tuzağı *kurulmaz* ama moda girerken odak başlığa taşınır, çıkışta tetikleyen
butona geri döner; hover gerektirmez; otomatik ilerleme **yok**; animasyon
minimum ve `prefers-reduced-motion` saygılı; temel veri gizlenmez.

**Tasarım kararı.** Ayrı route değil, **aynı bileşende durum**. Gerekçe:
ayrı route iş hesaplarını ikinci kez bağlamayı veya veriyi yeniden yüklemeyi
gerektirirdi; prompt "sunum modu iş hesaplarını tekrarlamamalı" diyor.
Durum yaklaşımı `buildReview()` sonucunu aynen kullanır.

**Frontend.** `sprint-review.component.ts/.html/.css`. **Backend/DB.** Yok.
**Güvenlik.** Yok — salt görünüm.
**Risk.** Orta — odak yönetimi ve klavye davranışı dikkatli yazılmalı.
**Kabul kriteri.** Sunum modunda uygulama navigasyonu görünmez; `Escape`
çıkarır; çıkışta odak geri döner; `prefers-reduced-motion` altında geçiş
animasyonu yok; tüm bölümler okunur.
**Test.** `test-review-presentation.cjs` — mod yapısı, çıkış yolu,
`Escape` bağlaması, reduced-motion kuralı, odak geri dönüşü.

---

### R-04 — Riskler ve istisnalar · **High**

**Mevcut durum.** Blokaj, atanmamış iş, tahminsiz iş, takipsiz kapsam gibi
sinyaller ekranda dağınık veya hiç yok. Dashboard'da (iterasyon 2) dikkat
şeridi var ama review ekranında karşılığı yok.

**Kalan boşluk.** Review'da "neye dikkat etmeliyiz" bölümü yok.

**Çözüm.** **Yalnız gerçek koşullardan türetilen** istisna listesi. Her madde
bir olgudur, yorum değildir. Üretilecek koşullar ve tetikleyicileri:

| İstisna | Koşul | Neden olgu |
|---|---|---|
| Blokajlı iş | `t.blocker?.blocked === true` | kullanıcı işaretlemiş |
| Atanmamış teslimat işi | `delivery && assignments.length === 0` | veri |
| Tahminsiz teslimat işi | `missingSize` / `missingPoints` | veri |
| Gerekçesiz Undone | `status==='undone' && !statusNote` | veri |
| Sprint içi eklenen iş | `scope.added` | akış kaydı |
| Backlog'a dönen iş | `scope.removed` | akış kaydı |
| Acil / plansız iş | `scope.emergencies` | akış kaydı |
| Kapsam takibi yok | `!scope.tracked` | akış kaydı |
| Prod defect | `taskSubtype==='PROD_DEFECT'` | taksonomi |
| Kayıtlı mesai | `operations.earned > 0` | mesai kaydı |

**Yasak.** Sebep, suçlu, performans yorumu, "ekip yavaşladı" türü çıkarım,
otomatik aksiyon maddesi, retrospektif yorumu **üretilmeyecek**. Hiçbir
koşul sağlanmazsa bölüm "Kayıtlı veriden türetilen istisna yok." der;
bu bir başarı yargısı değildir ve öyle sunulmaz.

**Frontend.** `review.model.ts`, review şablonu, `presentation-html.ts`.
**Backend/DB.** Yok. **Risk.** Düşük.
**Kabul kriteri.** Her istisna satırı yalnız listedeki koşuldan doğar;
koşul yoksa satır yok; metin yorum içermez.
**Test.** `test-review-exceptions.cjs` — her koşulun tetiklenmesi ve
tetiklenmemesi; yorum/sebep kelimesi içermediği.

---

### R-05 — Standalone sprint review HTML'i tamamlama · **High**

**Mevcut durum.** `editorialSprintHtml()` oldukça gelişmiş: kapak, künye
(`metaStrip`), KPI, ekip vitrini, sonuç/tahmin grafikleri, kapsam bölümü,
defect support, operasyon, Done/devreden listeleri, tür dağılımı, sonraki
sprint planı, tanımlar, yöntem notu. CSP meta etiketi, `@page A4`,
varsayılan-escape tablo ve `data:` dışı kaynak kullanmama mevcut.

**Tamamlanan.** Künye, tanımlar, escape, A4 temeli, öz-içerme.

**Kalan boşluk.**
1. Yönetici özeti bölümü yok (R-01).
2. Riskler/istisnalar bölümü yok (R-04).
3. **Detaylı ek (appendix) yok** — standalone dosyada tüm görevlerin tablosu
   bulunmuyor; ekranda var, dosyada yok.
4. Boş bölümler koşulsuz basılıyor (ör. ekip yoksa yine de "Sprint ekibi"
   başlığı ve boş kutu çıkıyor).
5. `reviewOperationsHtml()` tabloları `scope="col"` **içermiyor** — P-16
   erişilebilirlik düzeltmesi bu üreticiye ulaşmamış (regresyon).

**Çözüm.** Eksik bölümleri ekle; boş bölümleri **çıkar** (büyük boş kart
basma); sıfır ile "veri yok" ayrımını metinle netleştir; `scope="col"`
eksiğini gider; paylaşılan güvenli yardımcıları (`table`, `metaStrip`,
`definitions`, `kpis`) `review-operations` ve `scope-summary` üreticileriyle
paylaş — ancak tek bir aşırı genel soyutlama yaratmadan.

**Frontend.** `presentation-html.ts`, `review-operations.model.ts`,
ortak yardımcılar için küçük bir `export-primitives.ts`.
**Backend/DB.** Yok.
**Güvenlik/gizlilik.** Mevcut kurallar korunur: izin ayrıntısı, hesap, token,
anahtar, serbest not dışarı aktarılmaz. Appendix görev adı/durumu içerir —
bu zaten ekranda ve PDF'te paylaşılan veridir; izin görevlerinde kişisel
gün ayrıntısı **gösterilmeyecek**.
**Risk.** Orta — export kontratı testleri (`test-share-export.cjs`, 24 madde)
zayıflatılmadan geçmeli.
**Kabul kriteri.** Dosya tek başına açılır; ağ isteği yok; boş bölüm yok;
tüm tablolarda `scope="col"`; mevcut export testleri değiştirilmeden geçer.
**Test.** `test-export-review-structure.cjs` + mevcut export testleri.

---

### R-06 — Yazdırma ve A4 davranışı · **High**

**Mevcut durum.** Standalone HTML'de `@page{size:A4 portrait;margin:12mm}`
ve kapsamlı `@media print` var. Uygulama ekranında `print()` mevcut ve
`.print-only` / `.screen-count` gibi sınıflar kullanılıyor; ancak review
ekranının yazdırma düzeni gözden geçirilmemiş.

**Kalan boşluk.** Ekran yazdırmasında: katlanmış `<details>` içeriğinin
açılması kısmen var; filtre/buton gibi etkileşimli kontroller tamamen
kaldırılmıyor; kart ve başlık sayfa kırılmaları tanımlı değil; sunum modu
için yazdırma davranışı yok.

**Çözüm.** Review ekranı ve sunum modu için `@media print` kuralları:
kontrolleri gizle, navigasyonu gizle, `<details>` içeriğini aç, KPI ve kart
gruplarında `break-inside:avoid`, başlıklarda `break-after:avoid`, tablo
başlıklarında `thead{display:table-header-group}`, açık zemin, okunur punto,
sprint/ekip kapsamı ve oluşturma zamanı yazdırmaya dahil.

**Frontend.** `sprint-review.component.css`, `presentation-html.ts` print CSS.
**Risk.** Düşük. **Kabul kriteri.** A4 önizlemede yatay taşma yok, kart
ortadan bölünmüyor, kontroller görünmüyor, kapsam ve zaman damgası var.
**Test.** `test-review-print.cjs` (CSS kuralı varlığı) + izole ortamda
gerçek PDF üretimi ve görsel kontrol.

---

### R-07 — Raporlar ve insights kalan boşlukları · **Medium**

**Mevcut durum.** İterasyon 2'de rapor bağlamı, dönem ve tazelik eklendi
(`test-report-context.cjs` koruyor). Export sonrası kullanıcı geri bildirimi
(`sharing`/`shareError`) review'da var.

**Kalan boşluk (yalnız doğrulananlar).** Review ile rapor arasında yönetici
özeti dili tutarsız; review ekranında metrik tanımları ekranda görünmüyor
(yalnız export'ta var); istisna sunumu raporlarda yok.

**Çözüm.** Review ekranına katlanabilir "Tanımlar ve yöntem" bölümü (export
ile **aynı** metin kaynağından). Rapor tarafında tamamlanmış öğeler yeniden
tasarlanmayacak. Dekoratif grafik eklenmeyecek, sıralama/skor üretilmeyecek.

**Risk.** Düşük. **Kabul kriteri.** Ekrandaki tanım metni export'takiyle
birebir aynı kaynaktan gelir (tek tanım listesi).
**Test.** `test-review-definitions.cjs` — ortak kaynak kullanımının kanıtı.

---

### R-08 — Paylaşılan durumlar (sb-state) · **Medium**

**Mevcut durum.** `sb-state` 7 varyantla 6 ekranda kullanılıyor.
Review ekranında `teamError` için özel bir satır ve retry butonu var.

**Kalan boşluk.** Review'daki ekip hatası ve notlar yüklenmesi paylaşılan
sisteme bağlı değil; ancak mevcut hâli **bağlama özgü ve bilgi kaybı
yaratmıyor**. Prompt "yararlı bağlamsal durumu genel mesajla değiştirme"
diyor. Bu nedenle: yalnız **eksik** olan yerlere eklenecek, mevcut anlamlı
hata satırı genelleştirilmeyecek.

**Risk.** Düşük. **Kabul kriteri.** Kullanılmayan bileşen eklenmez;
mevcut bağlamsal hata metinleri korunur.

---

### R-09 — Backlog ölçeklenebilirliği (P-14) · **Karar maddesi**

**Yapılacak.** Otomatik olarak sunucu taraflı sayfalama **uygulanmayacak**.
Önce ölçülecek: tipik kayıt adedi, izole ortamda test edilen en büyük kayıt
adedi, istemci yanıt boyutu, render maliyeti, filtre gecikmesi, backend
çağrı sayısı. Kanıt anlamlı fayda göstermezse gerekçesiyle devredilecek ve
`DEFERRED ITEMS` altında ölçümle birlikte raporlanacak.

---

### R-10 — Toplu işlemler (P-12) · **Karar maddesi**

Önceki review'da "alan modeli güvenilir geçiş kuralı sunmuyor" gerekçesiyle
Deferred. Durum değişmediyse **uygulanmayacak** ve gerekçe tekrar yazılacak.
Geçiş kuralları merkezî ve güvenilir biçimde doğrulanamıyorsa toplu durum
değişikliği eklenmeyecektir.

---

### R-11 — CSS ve tasarım sistemi temizliği · **Medium**

Yalnız bu fazda dokunulan dosyalarda: sabit renkleri `--sb-*` token'larına
taşı, review/rapor arasındaki yinelenen print ve tablo stillerini azalt,
gereksiz `!important` kaldır. Kalan her `!important` için seçici, özellik,
ezilen kural ve kaldırmanın neden güvensiz olduğu belgelenecek.
Eski stil sistemi bütünüyle yeniden yazılmayacak.

---

### R-12 — Erişilebilirlik · **High**

Review ekranı, sunum modu ve standalone HTML için: landmark'lar, başlık
hiyerarşisi, klavye gezinmesi, görünür odak, sunum modundan erişilebilir
çıkış, durumun yalnız renkle anlatılmaması, tablo `scope="col"` ve caption,
boş durum duyurusu, gerçekten gerekliyse `aria-live`, `prefers-reduced-motion`,
kontrast, klavyeyle erişilebilir yatay kaydırma, yazdırma okunabilirliği.
Görsel sıra DOM sırasından farklı olmayacak.

**Test.** Mevcut `test-accessibility.cjs` genişletilecek (zayıflatılmadan).

---

## 3. Backend kararı

**Backend değişikliği planlanmamaktadır.**

Gerekçe: yönetici özeti, istisnalar ve anlatı bölümlerinin tamamı
`GET /api/sprints/{id}` (items, flow, closureSettings), `/review-team`,
`/overtime`, `/capacity` ile **hâlihazırda dönen** veriden türetilebilir.
Prompt §10: "Mevcut bir DTO sunumu destekleyebiliyorsa gereksiz endpoint
ekleme." Bu nedenle yeni endpoint, yeni DTO veya yeni alan eklenmeyecektir.

Uygulama sırasında bir veri gerçekten eksik çıkarsa: katkısal alan tercih
edilecek, mevcut hesap yeniden kullanılacak, bu doküman güncellenecek ve
ayrı `feat(api)` commit'i açılacaktır.

---

## 4. Veritabanı kararı

**Migration eklenmeyecektir. Şema v44'te kalır.**

Bu fazın tamamı sunum katmanı, türetilmiş istemci hesabı ve üretilen HTML
ile sınırlıdır. Kalıcı şema değişmediği için migration gerekmez
(prompt §11). Mevcut veritabanları olduğu gibi uyumludur; yedekler
okunmaya devam eder. `docs/data-compatibility-plan.md` güncellenmesi
yalnız gerçek bir şema değişikliği gerekirse yapılacaktır.

---

## 5. Güvenlik ve gizlilik

Mevcut korumalar **zayıflatılmadan** sürdürülecek, düşmanca girdi testleri
genişletilecektir: HTML etiketleri, `<script>`, olay işleyici öznitelikleri,
gömülü tırnaklar, `&`, `<`, `>`, uzun metin, Türkçe karakterler, satır
sonları, CSV formül önekleri.

Değişmeyecek kurallar: Slack kimlik bilgisi, parola/hash, şifreleme anahtarı
ve özel yapılandırma dışarı aktarılmaz; standalone rapor kimlik doğrulama
çerezine bağımlı değildir; izin/gizlilik davranışı aynı kalır; üye fotoğrafı
yalnız `safePhoto()` doğrulamasından geçerek gömülür.

---

## 6. Paket ve performans

Hedef: sunum modu ve yeni bölümler **başlangıç paketini artırmayacak**.
Review kodu zaten lazy `sprint-review-component` içindedir; yeni kod da
aynı parçada kalacaktır. Ağır grafik kütüphanesi, sunum çatısı veya harici
tasarım sistemi eklenmeyecektir. Bütçe gevşetilmeyecektir.

Faz sonunda başlangıç paketi, en büyük lazy parçalar, review parçası ve
CSS boyutu yeniden ölçülüp delta ve gerekçesiyle raporlanacaktır.

---

## 7. Test stratejisi

Tüm testler veri kümesinden bağımsız olacaktır: sabit sprint adedi, gerçek
isim, gerçek fotoğraf, canlı kimlik bilgisi, canlı satır adedi, canlı Slack
durumu veya yazara özgü yol kullanılmayacaktır.

Eklenecek betikler: `test-review-summary.cjs`, `test-review-narrative.cjs`,
`test-review-presentation.cjs`, `test-review-exceptions.cjs`,
`test-export-review-structure.cjs`, `test-review-print.cjs`.

Mevcut 78 betik ve 152 backend testi değiştirilmeden geçmelidir.
Angular test çatısı eklenmeyecektir (önceki iterasyonun gerekçesi geçerli).

---

## 8. Canlı ortam güvenliği

Canlı servis port 4181'de çalışmaya devam edebilir ve ana checkout'un
`target/sprintboard-service-0.1.0.jar` dosyasını kullanır. Bu nedenle ana
checkout'ta **`mvn package` çalıştırılmayacaktır**. Tüm derleme, paketleme
ve çalıştırma doğrulaması izole worktree'de, ayrı port (4199), geçici H2,
sentetik veri, Slack kapalı ve otomatik yedekleme kapalı olarak yapılacaktır.

---

## 9. Uygulama sırası

1. Bu plan (ayrı commit).
2. Yönetici özeti + istisna türetmesi (model).
3. Anlatı sırası ve bölüm gezinmesi (ekran).
4. Sunum modu.
5. Standalone HTML tamamlama + `scope="col"` regresyon düzeltmesi.
6. Yazdırma / A4.
7. Erişilebilirlik.
8. Testler.
9. Stil temizliği.
10. Ölçüm, izole review örneği, sonuç raporu.
