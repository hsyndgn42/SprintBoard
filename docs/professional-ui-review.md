# SprintBoard — Professional Platform UI/UX Review (İterasyon 2)

**Tarih:** 2026-10-21
**Branch:** `feature/professional-platform-ui` (base: `master` @ `fd7b128`)
**Önceki iterasyon:** `feature/advanced-ui-ux` → `fd7b128` ile master'a merge edildi.
**Kapsam:** Tüm uygulama deneyimi, üretilen HTML raporlar, yazdırma çıktıları, erişilebilirlik ve bunları
destekleyen **kontrollü** backend/okuma-modeli değişiklikleri.

---

## 1. Yöntem ve kanıt tabanı

İnceleme dört kaynaktan yapıldı:

1. **Kod okuması.** `frontend/src` altındaki ~115 TypeScript/HTML/CSS dosyası (toplam ~760 KB) ve
   `service/src/main/java` altındaki **66 Java dosyası** satır satır haritalandı. Controller envanteri,
   servis imzaları, migration zinciri ve güvenlik kuralları doğrulandı.
2. **İzole çalışan uygulama.** Üretim jar'ı (`target/sprintboard-service-0.1.0.jar`, master `fd7b128`'den
   üretilmiş) **ayrı port (4185)**, **ayrı geçici H2 veritabanı** (`%TEMP%\sb-iter2\sprintboard`),
   **otomatik yedekleme kapalı**, **Slack worker kapalı** olacak şekilde çalıştırıldı.
   Canlı `service/data/sprintboard.mv.db` ve `slack-token.key` dosyalarına **hiç dokunulmadı**.
3. **Sentetik veri seti.** 6 üye, 1 roadmap hedefi, 34 backlog kaydı, 4 sprint (1 aktif, 13 görevli),
   izin kayıtları. Gerçek kullanıcı adı, fotoğrafı veya Slack verisi kullanılmadı.
4. **Mevcut test sözleşmeleri.** 74 Node betiği (`scripts/*.cjs`) ve 54 Java test sınıfı (146 test)
   okundu; hangi davranışların sözleşme olarak kilitli olduğu çıkarıldı.

> Bu rapordaki her bulgu gerçek kodda doğrulanmıştır. Kodda bulunmayan hiçbir özellik varsayılmamıştır.

### 1.1 Canlı çalışma zamanı kısıtı

İnceleme sırasında canlı uygulama **PID 4488** ile çalışıyordu ve doğrudan repo içindeki
`target/sprintboard-service-0.1.0.jar` dosyasını kullanıyordu (port 4181 dinlemede).

Bu nedenle bu iterasyon boyunca:

- `mvn package` ve `mvn clean *` **yasaktır** (jar'ı ezer).
- `mvn test` **güvenlidir**: `jar` ve `repackage` hedefleri yalnız `package` fazında çalışır;
  `test` fazı yalnız `target/classes`, `target/test-classes` ve `service/src/main/resources/static/`
  dizinlerine yazar. Bunların hiçbiri çalışan JVM tarafından okunmaz.
- `npm run build` **güvenlidir** (yalnız git-ignored `static/` dizinine yazar).

Güvenli şekilde çalıştırılamayan her doğrulama `NOT RUN - live JAR safety` olarak raporlanır.

---

## 2. Mevcut durumun teknik özeti

### 2.1 Frontend

| Konu | Durum |
|---|---|
| Angular | 20, standalone component, signal + `@if`/`@for` kontrol akışı |
| Routing | Hash routing (`/#/overview`). `app.routes.ts` 14 route |
| Durum yönetimi | Yok; her component kendi `async ngOnInit` + alan değişkenleri |
| HTTP | Tek `ApiService`; `get/post/put/patch/delete` sarmalayıcıları |
| Stil katmanları | `styles.css` → `ui-system.css` → `sb-foundation.css` → `print.css` (bu sırayla) |
| Tasarım tokenları | `--sb-*` namespace, `sb-foundation.css` içinde (816 satır) |
| Paylaşılan component | `sb-toast`, `sb-breadcrumb`, `modal-accessibility.directive`, `list-pager` |
| Test | 74 Node betiği (bağımlılıksız, TS'i runtime transpile ediyor) |

### 2.2 Backend

| Konu | Durum |
|---|---|
| Paket yapısı | Tek düz paket `com.sprintboard`, 66 dosya, katman ayrımı yok |
| Persistence | Yalnız `JdbcTemplate` + elle yazılmış SQL. JPA/entity/repository **yok** |
| Response tipi | Neredeyse tamamen `Map<String,Object>`; tipli DTO **yok** |
| En büyük sınıf | `WorkspaceService.java` — **1272 satır**, tüm domain hesapları burada |
| Güvenlik | Spring Security, URL-pattern tabanlı. `GET /api/**` = authenticated, diğer `/api/**` = ADMIN, `/api/admin/**` = ADMIN. `@PreAuthorize` **yok** |
| Migration | Flyway, `V1`…`V44`, konvansiyon `V<n>__<snake_case>.sql` (V34 Java migration) |
| Birincil anahtar | Tümü `VARCHAR` string id (`prefix-UUID`), `audit_event.id` hariç |
| Ayarlar deposu | `product_setting(setting_key, setting_value)` anahtar/değer tablosu |
| Zaman dilimi | Global ayar **yok**; çağrı yerinde `ZoneId.of("Europe/Istanbul")` |

### 2.3 Üretilen HTML çıktıları

Dört bağımsız üretici var; hepsi istemci tarafında, `downloadText()` ile indiriliyor:

| Üretici | Dosya | Çıktı |
|---|---|---|
| `editorialSprintHtml` | `presentation-html.ts` | Tam doküman, A4 **portrait**, yeşil palet |
| `reportTabHtml` | `report-tab-html.ts` | Tam doküman, A4 **landscape**, mavi palet |
| `scopeReportHtml` | `scope-summary.model.ts` | Tam doküman, minimal stil |
| `reserveHtml` | `defect-reserve-html.ts` | **Fragment**, host CSS'ine bağımlı |

Güçlü yanlar (korunmalı): CSP meta etiketi, alan allowlist'i (API nesnesi serialize edilmiyor),
`safePhoto` data-URL allowlist'i, CSV formül enjeksiyonu koruması, izin gizliliği.

---

## 3. Bulgular

Öncelik tanımları:

- **Critical** — Kullanıcı yanlış karar verebilir, veri/güvenlik riski var veya ekran kullanılamaz durumda.
- **High** — Belirgin kullanılabilirlik, tutarlılık veya performans kaybı.
- **Medium** — Kalite ve profesyonellik farkı yaratır, iş akışını engellemez.
- **Low** — Cilalama.

---

### P-01 · Ağır route'lar initial bundle'a giriyor

| Alan | İçerik |
|---|---|
| **Ekran/Component** | `frontend/src/app/app.routes.ts` |
| **Mevcut davranış** | `OverviewComponent`, `BacklogComponent`, `SprintsComponent`+`SprintDetailComponent`, `ReportsComponent`+`SettingsComponent` **statik `import`** ile yükleniyor. Bu da `sprints.component.ts` (52,7 kB) ve `insights.component.ts` (28,1 kB) dosyalarının her ilk açılışta indirilmesi demek. Roadmap/team/leaves/overtime zaten `loadComponent` ile lazy. |
| **Kullanıcı etkisi** | Login sonrası ilk boyama gecikiyor; kullanıcı yalnız dashboard'a bakacak olsa bile rapor ve sprint-detay kodunu indiriyor. Önceki iterasyonda ölçülen initial bundle 771,53 kB ve 700 kB bütçe uyarısı veriyor. |
| **Önerilen iyileştirme** | Dashboard dışındaki tüm route'ları `loadComponent`'e çevir. `SprintDetailComponent` ve `SettingsComponent` aynı dosyayı paylaşıyorsa dosya bölünmesi gerekebilir; gerekmiyorsa aynı chunk'ı paylaşırlar. |
| **Frontend kapsamı** | `app.routes.ts` + gerekirse `insights.component.ts` bölünmesi |
| **Backend kapsamı** | Yok |
| **Veri/şema kapsamı** | Yok |
| **Risk** | Düşük. Route sözleşmesi (path'ler) değişmez; yalnız yükleme stratejisi değişir. |
| **Öncelik** | **High** |
| **Kabul kriteri** | `app.routes.ts` içindeki path listesi birebir aynı kalır; initial bundle master'a göre küçülür; tüm route'lar smoke testte 200 döner. |

---

### P-02 · Dashboard karar desteği sunmuyor

| Alan | İçerik |
|---|---|
| **Ekran/Component** | `overview.component.html` / `.ts` |
| **Mevcut davranış** | 4 adet eşit ağırlıklı metrik kartı (Toplam sprint, Tamamlanan sprint, Done iş, Teslimat oranı), aktif sprint paneli, kapasite paneli, 3 kısayol kartı ve son sprintler listesi. Tüm veriler tek `/api/overview` çağrısından geliyor (bu iyi). |
| **Kullanıcı etkisi** | "Toplam sprint" ve "Tamamlanan sprint" tarihsel sayaçlar — günlük kararı etkilemiyor ama en üstteki en değerli alanı işgal ediyor. Ekranda **bloke iş**, **plan dışı/acil iş**, **iş tipi dağılımı**, **izin/mesai etkisi** ve **aksiyon gerektiren uyarılar** hiç yok. Kullanıcı "bugün neye bakmalıyım?" sorusunun cevabını alamıyor; bunun için Sprint panosuna gidip gözle taramak zorunda. |
| **Önerilen iyileştirme** | Bilgi mimarisini yeniden önceliklendir: (1) aktif sprint durumu + kalan gün + ilerleme en üstte, (2) dikkat gerektiren işler (bloke, sprint içinde eklenmiş/acil, tahminsiz, sahipsiz) ikinci sırada aksiyon bağlantılarıyla, (3) kapasite kullanımı planlanan/ayrılan oranıyla, (4) iş tipi dağılımı, (5) tarihsel sayaçlar en alta. Her metriğin **hesaplama açıklaması** görünür olsun. |
| **Frontend kapsamı** | `overview.component.*` yeniden düzenleme |
| **Backend kapsamı** | `WorkspaceService.overview()`'a **additive** alanlar: bloke sayısı, sprint içi eklenen sayısı, tahminsiz iş sayısı, iş tipi dağılımı, kalan gün. Mevcut alanlar **aynen korunur**. Mevcut `SprintFlowService`/`DefectReserve`/`BauPolicy` hesapları yeniden kullanılır, yeniden tanımlanmaz. |
| **Veri/şema kapsamı** | Yok — yeni tablo/kolon gerekmez, veriler mevcut tablolardan okunur. |
| **Risk** | Orta. `overview()` zaten `ScopeAndSprintViewsTest` tarafından test ediliyor; mevcut anahtarların silinmemesi şart. |
| **Öncelik** | **Critical** |
| **Kabul kriteri** | Mevcut 19 `Overview` alanı aynı isim ve anlamda döner (test ile kanıtlanır); yeni alanlar yalnız eklenir; aktif sprint yokken ve boş kurulumda ekran hatasız çalışır; her yeni metriğin formülü dokümante edilir. |

---

### P-03 · `/api/overview` tek isteği ağır ve ölçeklenmiyor

| Alan | İçerik |
|---|---|
| **Ekran/Component** | `WorkspaceService.overview()` → `calendarCapacity()` (`WorkspaceService.java:133`, `:189-215`) |
| **Mevcut davranış** | `calendarCapacity(from,to)` takvimi ve izinleri tümüyle belleğe alıp **her üye × aralıktaki her gün** için döngü kuruyor; döngü içinde `schedules.at(date)` ve `memberCapacity.at(...)` çağrıları **her biri ayrı SQL** çalıştırıyor. Dashboard bunu ay penceresi için çağırdığından `/api/overview` maliyetinin baskın kısmı burası. Ayrıca `overview()` hazır backlog sayısını bulmak için **tüm backlog'u materyalize ediyor** (`:181`). |
| **Kullanıcı etkisi** | Dashboard açılışı veri büyüdükçe yavaşlıyor. Tek instance H2'de bu doğrudan algılanan açılış süresine yansıyor. |
| **Önerilen iyileştirme** | Hesaplama **sonucunu değiştirmeden** gün döngüsündeki politika okumalarını önbelleğe al (aynı istek içinde tarih→policy ve üye→policy map'i). Hazır backlog sayımını tam materyalizasyon yerine sayan sorguya çevirmek mümkün değilse (readiness Java'da hesaplanıyor) olduğu gibi bırak ve dokümante et. |
| **Frontend kapsamı** | Yok |
| **Backend kapsamı** | `WorkspaceService.calendarCapacity` içi mikro-optimizasyon |
| **Veri/şema kapsamı** | Olası index: `assignment(task_id)`, `leave_record(member_id, sprint_id)` — bkz. P-04 |
| **Risk** | **Yüksek.** Kapasite hesabı iş kuralıdır. Herhangi bir sayısal sapma kabul edilemez. Yalnız aynı sonucu üreten saf önbellekleme yapılabilir ve mevcut testlerle (`MemberCapacityTest`, `WorkScheduleTest`, `ScopeAndSprintViewsTest`) doğrulanmalıdır. |
| **Öncelik** | **Medium** (performans; doğruluk riski yüksek olduğu için dikkatle) |
| **Kabul kriteri** | `mvn test` tamamen yeşil; kapasite ile ilgili testlerin beklenen değerleri **değiştirilmeden** geçer. |

---

### P-04 · Sık kullanılan join kolonlarında index yok

| Alan | İçerik |
|---|---|
| **Ekran/Component** | `assignment`, `leave_record` tabloları (`V1__initial_schema.sql`) |
| **Mevcut davranış** | `assignment(task_id)` ve `leave_record(member_id, sprint_id)` üzerinde index yok. Bu kolonlar `sprint(id)` N+1 döngüsünde ve kapasite hesabında en sık filtrelenen kolonlar. |
| **Kullanıcı etkisi** | Sprint detayı, kapasite ve rapor ekranlarında veri büyüdükçe gecikme. |
| **Önerilen iyileştirme** | Yeni, forward-only migration ile `CREATE INDEX IF NOT EXISTS` ekle. Veri yazılmaz, satır değişmez, şema genişlemez. |
| **Frontend kapsamı** | Yok |
| **Backend kapsamı** | Yok (yalnız migration) |
| **Veri/şema kapsamı** | **Yeni `V45` migration.** Yalnız `CREATE INDEX IF NOT EXISTS`. Tablo yeniden kurulmaz, kolon eklenmez/değişmez, satır silinmez. |
| **Risk** | Düşük. Index eklemek geri alınabilir ve veri içeriğini etkilemez. Mevcut migration dosyalarına **dokunulmaz**. |
| **Öncelik** | **Medium** |
| **Kabul kriteri** | Migration eski şemadan ileri doğru uygulanır; migration öncesi/sonrası tablo listesi ve satır sayıları birebir aynı; `ApiController` içindeki `schemaVersion` değeri güncellenirse `/api/health` testleri ile uyumlu kalır. |

---

### P-05 · Ayarlar tek uzun akordeon yığını

| Alan | İçerik |
|---|---|
| **Ekran/Component** | `SettingsComponent` (`insights.component.ts`) |
| **Mevcut davranış** | Tüm ayarlar tek sayfada arka arkaya `<details class="settings-section">` blokları hâlinde. Çoğu **kapalı** başlıyor. Kategori yok, gezinme yok, arama yok, derin bağlantı yok. |
| **Kullanıcı etkisi** | Kullanıcı aradığı ayarı bulmak için sayfayı tarayıp akordeonları tek tek açmak zorunda. İçerik kapalı `<details>` içinde olduğu için **tarayıcı içi arama (Ctrl+F) ve ekran okuyucu da bulamıyor** — bu ayrıca önceki iterasyonda smoke testin `Çalışılmayan günler` metnini görememesinin de sebebiydi. |
| **Önerilen iyileştirme** | Ayarları şu kategorilere ayır: Genel, Ekip, Çalışma düzeni, Tahmin, Sprint ve backlog, Slack, Raporlar ve paylaşım, Yedekleme ve veri güvenliği, Kullanıcılar ve yönetim. Sol/üst gezinme + bölüm açıklaması + derin bağlantı (hash anchor). Tehlikeli aksiyonları ayrı ve görsel olarak ayrışmış bir bölüme al. |
| **Frontend kapsamı** | `insights.component.ts` içindeki `SettingsComponent` şablon yeniden düzenlemesi |
| **Backend kapsamı** | Yok — API çağrıları, kaydetme semantiği ve doğrulama **aynen korunur** |
| **Veri/şema kapsamı** | Yok |
| **Risk** | Orta. DOM sırası ile görsel sıra çakışmamalı; mevcut `test-work-settings-ui.cjs`, `test-slack-settings-layout.cjs`, `test-holidays-ui.cjs` geçmeye devam etmeli. |
| **Öncelik** | **High** |
| **Kabul kriteri** | Hiçbir ayar alanı kaybolmaz; kaydetme istekleri aynı endpoint ve aynı payload ile gider; tüm ayar metinleri sayfa metninde (kapalı `<details>` içinde gizli değil) bulunabilir; klavye ile kategori gezinmesi çalışır. |

---

### P-06 · Kaydedilmemiş değişiklik koruması hiç yok

| Alan | İçerik |
|---|---|
| **Ekran/Component** | Tüm formlar ve dialoglar (backlog formu, sprint ekleme/düzenleme, ayarlar, retro, review notları) |
| **Mevcut davranış** | Dirty-state takibi yok. Kullanıcı formu doldurup dialogu kapatırsa veya başka route'a geçerse **veri sessizce kaybolur**. Uyarı yok. |
| **Kullanıcı etkisi** | Veri kaybı. Özellikle uzun backlog kriter metinleri ve retro notlarında maliyetli. |
| **Önerilen iyileştirme** | Paylaşılan, test edilmiş bir dirty-state mekanizması: anlamlı değişiklik tespiti (ilk değer snapshot'ı ile karşılaştırma), kirli dialog kapanışında ve kirli sayfadan ayrılırken onay, başarılı kayıttan hemen sonra uyarı yok, kayıt sırasında "kaydediliyor" durumu "kaydedilmemiş"ten ayrı. Gönderilen payload **değişmez**. |
| **Frontend kapsamı** | Yeni paylaşılan servis/yardımcı + ilgili component'lerde benimseme |
| **Backend kapsamı** | Yok |
| **Veri/şema kapsamı** | Yok |
| **Risk** | Orta. Yanlış kurgulanırsa kullanıcıyı ekranda hapsedebilir veya her kayıttan sonra yanlış uyarı verebilir. |
| **Öncelik** | **High** |
| **Kabul kriteri** | Değişiklik yokken uyarı çıkmaz; başarılı kayıttan sonra uyarı çıkmaz; başarısız kayıttan sonra kullanıcı kilitlenmez; İptal her zaman erişilebilir; klavye erişilebilirliği korunur; otomatik test ile doğrulanır. |

---

### P-07 · Ortak yükleniyor/boş/hata durumu altyapısı yok

| Alan | İçerik |
|---|---|
| **Ekran/Component** | Tüm sayfalar |
| **Mevcut davranış** | Her ekran kendi `@if (data) {...} @else if (error) {...} @else {...}` üçlüsünü elle yazıyor; metinler, işaretleme ve stiller ekrandan ekrana farklı. Örn. dashboard `<div class="loading" role="status">Genel bakış yükleniyor…</div>`, backlog farklı bir yapı kullanıyor. Önceki iterasyonda bu amaçla eklenen `sb-state.components.ts` **hiçbir ekran tarafından benimsenmediği için** temizlik aşamasında silindi. |
| **Kullanıcı etkisi** | Tutarsız deneyim; bazı ekranlarda hata durumunda yalnız ham `Error: ...` metni görünüyor; "sonuç yok" ile "hiç kayıt yok" ayrımı yapılmıyor; yeniden deneme aksiyonu hiçbir yerde yok. |
| **Önerilen iyileştirme** | Gerçekten benimsenecek, az sayıda paylaşılan durum bileşeni: yükleniyor (skeleton dahil), boş, arama sonucu yok, hata + yeniden dene. **Sadece gerçek tekrarı ortadan kaldırdığı yerlerde** ekle ve ekran ekran benimse. Kullanılmayan bileşen bırakma. |
| **Frontend kapsamı** | Yeni paylaşılan bileşen(ler) + dashboard, backlog, sprint listesi/panosu, raporlar, üyeler, izin/mesai ekranlarında benimseme |
| **Backend kapsamı** | Yok |
| **Veri/şema kapsamı** | Yok |
| **Risk** | Düşük — görsel katman. Yalnız mevcut test metinlerini bozmamaya dikkat. |
| **Öncelik** | **High** |
| **Kabul kriteri** | Bileşenler en az 6 ekranda **fiilen** kullanılır; boş durumlar nedeni açıklar ve bir sonraki adımı önerir; kullanıcının yetkisi olmayan aksiyon boş durumda gösterilmez; hata durumunda yeniden deneme mümkündür. |

---

### P-08 · Backlog tamamen istemci tarafında filtreleniyor

| Alan | İçerik |
|---|---|
| **Ekran/Component** | `backlog.component.ts` |
| **Mevcut davranış** | `GET /api/backlog` **tüm** kayıtları döner; arama, görünüm filtresi, iş tipi, öncelik, hazırlık filtresi, sıralama ve sayfalama (sayfa boyutu 20) tamamen tarayıcıda yapılıyor (`:112-117`). Sayfa açılışında ek olarak `/roadmap`, `/overview`, `/settings`, `/team` ile birlikte 5 paralel istek atılıyor; ayrıca `ApiService.get()` her çağrıda `/task-subtypes` kataloğunu da tetikliyor. |
| **Kullanıcı etkisi** | Bugünkü veri hacminde (tek ekip, yüzlerce kayıt) **kullanılabilirlik sorunu yaratmıyor** ve istemci tarafı filtreleme anında tepki verdiği için aslında daha akıcı. Asıl sorun filtre **görünürlüğü**: kaç sonuç bulunduğu, hangi filtrelerin aktif olduğu ve nasıl temizleneceği belli değil; "filtre sonucu boş" ile "backlog boş" ayrımı yok. |
| **Önerilen iyileştirme** | Sunucu tarafı sayfalamayı **şimdilik uygulama** — mevcut veri hacmi bunu gerektirmiyor ve yeni endpoint + kontrat riski taşıyor (bkz. Ertelenen maddeler). Bunun yerine: toplam sonuç sayısı, aktif filtre özeti (chip'ler), tek tıkla temizleme, sayfa konumu, ayrı "sonuç yok" durumu, filtre değişiminde kısa yükleniyor göstergesi. |
| **Frontend kapsamı** | `backlog.component.ts` araç çubuğu ve liste bölümü |
| **Backend kapsamı** | Yok (bu iterasyonda) |
| **Veri/şema kapsamı** | Yok |
| **Risk** | Düşük. Filtreleme mantığı (`matchesBacklogView`) **değiştirilmez**, yalnız sonucu görünür kılınır. |
| **Öncelik** | **High** |
| **Kabul kriteri** | Sonuç sayısı her zaman görünür; aktif filtreler listelenir ve tek aksiyonla sıfırlanır; filtre sonucu boşken "backlog boş" mesajı gösterilmez; `test-backlog-view.cjs` ve `matchesBacklogView` davranışı değişmez. |

---

### P-09 · Üretilen HTML çıktıları tek görsel dil oluşturmuyor

| Alan | İçerik |
|---|---|
| **Ekran/Component** | `presentation-html.ts`, `report-tab-html.ts`, `scope-summary.model.ts`, `defect-reserve-html.ts` |
| **Mevcut davranış** | Dört üretici, **dört ayrı CSS bloğu**. Sprint özeti yeşil paletli ve A4 **portrait**; rapor sekmesi mavi paletli ve A4 **landscape**; kapsam raporu minimal; defect reserve ise CSS'i olmayan bir fragment ve host dokümanın stillerine bağımlı. Doküman kabuğu (`<!doctype>` + viewport + CSP + `<title>` + `<style>` + `<main><header>…<footer>`), responsive tablo daraltma kuralı, `@media print` bloğu ve alt bilgi metni **neredeyse birebir kopyalanmış** durumda. |
| **Kullanıcı etkisi** | Aynı üründen çıkan iki rapor yan yana konduğunda farklı ürünlerden gelmiş gibi görünüyor. Paydaşa gönderilen çıktıda kurumsal tutarlılık kaybı. |
| **Önerilen iyileştirme** | Tek bir paylaşılan "rapor kabuğu" oluştur: ortak token seti, ortak doküman iskeleti, ortak tablo/KPI/bar yardımcıları, ortak yazdırma kuralları ve ortak alt bilgi. Her üretici yalnız kendi gövdesini üretsin. Sayfa yönü (portrait/landscape) parametreleştirilsin. |
| **Frontend kapsamı** | Yeni paylaşılan modül + dört üreticinin ona bağlanması |
| **Backend kapsamı** | Yok |
| **Veri/şema kapsamı** | Yok |
| **Risk** | **Yüksek.** `test-share-export.cjs` 24 ayrı metin/yapı iddiası içeriyor (`'1 / 1'`, `'kesin kapanış sonucu değildir'`, `"default-src 'none'"`, `'img-src data:'`, tam olarak 2 `<img` etiketi vb.). `test-report-html.cjs`, `test-report-tabs-ui.cjs`, `test-scope-views-ui.cjs`, `test-review-brief.cjs` de bağlı. Hiçbiri gevşetilmemeli. |
| **Öncelik** | **High** |
| **Kabul kriteri** | Tüm mevcut export testleri **değiştirilmeden** geçer; CSP meta etiketi her dokümanda korunur; harici font/CSS/JS/CDN referansı yok; çıktı uygulama olmadan açılır; A4 yazdırma önizlemesi bozulmaz. |

---

### P-10 · `presentation-html.ts` tablo yardımcısı kaçış sorumluluğunu çağırana bırakıyor

| Alan | İçerik |
|---|---|
| **Ekran/Component** | `presentation-html.ts:45` `table(headers, rows, cls)` |
| **Mevcut davranış** | Hücreleri `${cell}` olarak **ham** basıyor; kaçış sorumluluğu çağırana ait. Buna karşılık `report-tab-html.ts:17` aynı yardımcıyı `${h(cell)}` ile güvenli uyguluyor. Bugün tüm çağrı yerleri `h(...)` kullandığı için **aktif bir açık yok**, ancak sözleşme kırılgan: gelecekte eklenecek bir sütun sessizce enjeksiyon açığı yaratır. |
| **Kullanıcı etkisi** | Doğrudan yok (bugün). Gelecekte XSS riski. |
| **Önerilen iyileştirme** | Kaçışı yardımcının içine al; önceden kaçırılmış HTML gerektiğinde açık bir `raw()` sarmalayıcı ile işaretlensin. Ayrıca 4–5 kopya hâlindeki `escapeHtml`/`h` tanımını tek kaynağa indir. |
| **Frontend kapsamı** | `presentation-html.ts` + paylaşılan kaçış yardımcısı |
| **Backend kapsamı** | Yok |
| **Veri/şema kapsamı** | Yok |
| **Risk** | Orta — çift kaçış hatası görünür bozulma yaratır; testler bunu yakalar. |
| **Öncelik** | **High** (güvenlik sağlamlaştırma) |
| **Kabul kriteri** | `test-share-export.cjs` kaçış iddiaları geçer; çıktıda `&amp;lt;` gibi çift kaçış görünmez; tek bir `escapeHtml` kaynağı kalır. |

---

### P-11 · Sprint review anlatı yapısına sahip değil

| Alan | İçerik |
|---|---|
| **Ekran/Component** | `sprint-review.component.html` (13,7 kB) + `presentation-html.ts` çıktısı |
| **Mevcut davranış** | Veri blokları art arda diziliyor: KPI'lar, takım vitrini, grafikler, kapsam, destek, operasyonlar, teslimat, tip dağılımı. **Yönetici özeti yok**, **riskler/takip aksiyonları bölümü yok**, planlanan↔tamamlanan karşılaştırması ayrı bir anlatı adımı değil. |
| **Kullanıcı etkisi** | Sprint review toplantısında sunumu yapan kişi hikâyeyi kendi kurmak zorunda; dinleyici "ne oldu, neden, şimdi ne olacak" sorularının cevabını tek bakışta alamıyor. |
| **Önerilen iyileştirme** | Anlatı sırası kur: sprint kimliği → hedef → **yönetici özeti** → planlanan vs tamamlanan → teslim edilenler → devreden işler → kapsam değişiklikleri → plan dışı iş → defect/kalite → kapasite/izin/mesai bağlamı → öne çıkanlar → riskler ve takip → detay eki. Veri yoksa bölüm kısa ve profesyonel bir boş durum gösterir ya da dışa aktarımda tamamen atlanır. **Retrospektif yorum veya gerekçe uydurulmaz** — yalnız mevcut veriler ve mevcut review notları kullanılır. |
| **Frontend kapsamı** | `sprint-review.component.html/.css`, `presentation-html.ts` gövde sırası |
| **Backend kapsamı** | Yok — mevcut `/api/sprints/{id}`, `/review-team`, `/review-notes`, `/retro` verileri yeterli |
| **Veri/şema kapsamı** | Yok |
| **Risk** | Orta. `test-review-brief.cjs`, `test-review-notes-ui.cjs`, `test-share-export.cjs` metin iddiaları korunmalı. |
| **Öncelik** | **High** |
| **Kabul kriteri** | Hem ekranda hem dışa aktarılan HTML'de aynı anlatı sırası; boş bölümler profesyonel şekilde ele alınır; mevcut testlerin aradığı tüm metinler yerinde kalır. |

---

### P-12 · Legacy CSS'te 359 sabit renk ve 15 `!important`

| Alan | İçerik |
|---|---|
| **Ekran/Component** | `frontend/src/styles.css` (94 satır / 51,6 kB, minify edilmiş uzun satırlar), `ui-system.css` (244 satır) |
| **Mevcut davranış** | `styles.css` içinde **359 sabit hex renk** ve **15 `!important`**; `ui-system.css` içinde 43 sabit renk. `sb-foundation.css` token katmanı en son yüklendiği için çoğu yerde kazanıyor, ancak legacy kurallar hâlâ kendi renklerini taşıyor. `print.css` 29 satırda **22 `!important`** içeriyor. |
| **Kullanıcı etkisi** | Dolaylı: tema tutarsızlığı, aynı anlamın farklı tonlarla gösterilmesi, bakım maliyeti. |
| **Önerilen iyileştirme** | **Tek seferlik büyük yeniden yazım yapma.** Aşamalı olarak: en sık tekrar eden renkleri token'a bağla, durum (success/warning/danger/info) renklerini tek kaynağa indir, gölge ve spacing tekrarlarını azalt. Kalan her `!important` için gerekçe kaydet. |
| **Frontend kapsamı** | `styles.css`, `ui-system.css`, `sb-foundation.css` |
| **Backend kapsamı** | Yok |
| **Veri/şema kapsamı** | Yok |
| **Risk** | Orta — geniş yüzey. Küçük adımlarla ve her adımda görsel doğrulama ile yapılmalı. |
| **Öncelik** | **Medium** |
| **Kabul kriteri** | Sabit renk sayısı ölçülebilir şekilde azalır; kalan `!important` listesi gerekçeleriyle dokümante edilir; `test-ui-tokens.cjs` ve `test-ui-system.cjs` geçer. |

---

### P-13 · Rapor ekranı bağlam ve metodoloji vermiyor

| Alan | İçerik |
|---|---|
| **Ekran/Component** | `ReportsComponent` (`insights.component.ts`), `reports.component.html` (19,3 kB) |
| **Mevcut davranış** | Raporlar sekmeler hâlinde; tablolar ve CSS bar grafikleri var. Rapor başlığı var ancak **dönem/kapsam bilgisi**, **veri tazeliği**, **aktif filtre özeti** ve **metrik tanımları** tutarlı biçimde sunulmuyor. Dışa aktarma geri bildirimi önceki iterasyonda toast ile eklendi. |
| **Kullanıcı etkisi** | Rapor paydaşa gönderildiğinde "bu sayı neyi kapsıyor, hangi tarih aralığı, BAU dahil mi" soruları cevapsız kalıyor; yanlış yorumlama riski. |
| **Önerilen iyileştirme** | Her rapora standart bir başlık bloğu: başlık, kapsam (sprint/ekip/dönem), üretim zamanı, aktif filtreler, kısa özet. Metrik tanımları (sayım mı, saat mi, yüzde mi; BAU dahil/hariç) görünür bir "tanımlar" bölümünde. Tabloyu tekrar eden dekoratif grafikleri kaldır. |
| **Frontend kapsamı** | `reports.component.html`, `report-visuals.css`, `report-tab-html.ts` başlık bloğu |
| **Backend kapsamı** | Yok — mevcut `/api/reports*` yanıtları yeterli |
| **Veri/şema kapsamı** | Yok |
| **Risk** | Orta. `test-report-tabs-ui.cjs` (90 satır) ve `test-report-html*.cjs` iddiaları korunmalı. |
| **Öncelik** | **High** |
| **Kabul kriteri** | Her rapor sekmesinde kapsam ve üretim zamanı görünür; birim etiketleri (adet/saat/%) açık; mevcut rapor testleri geçer. |

---

### P-14 · Sprint panosunda yatay kaydırma ipucu ve yoğunluk sorunları

| Alan | İçerik |
|---|---|
| **Ekran/Component** | `sprint-board.component.html/.css` |
| **Mevcut davranış** | Önceki iterasyonda dar ekranlarda kaydırılabilirlik eklendi, ancak **kaydırmanın var olduğuna dair görsel ipucu yok** (kenar gölgesi/solma). Uzun iş başlıkları, çok sayıda atanan kişi ve BAU içeriği yoğun sprintlerde kart hiyerarşisi zayıflıyor. |
| **Kullanıcı etkisi** | 1024 px laptopta kullanıcı sağdaki kulvarların varlığını fark etmeyebilir; yoğun sprintte kritik bilgi (bloke, efor) kayboluyor. |
| **Önerilen iyileştirme** | Kaydırma kenarında gradyan ipucu, kulvar başlıklarında sticky davranış, kart içi hiyerarşi (başlık → tip/efor → atananlar), uzun başlıkta kontrollü kırpma + tooltip, atanan kişi taşmasında "+N", boş kulvar durumu. |
| **Frontend kapsamı** | `sprint-board.component.*`, `sb-foundation.css` |
| **Backend kapsamı** | Yok |
| **Veri/şema kapsamı** | Yok |
| **Risk** | Düşük-orta. `test-board-ui.cjs`, `test-board-actions-ui.cjs`, `test-board-all-items-ui.cjs`, `test-flow-ui.cjs` geçmeli. Durum geçişleri ve hesaplar **değişmez**. |
| **Öncelik** | **Medium** |
| **Kabul kriteri** | Kaydırma ipucu yalnız gerçekten taşma varken görünür; sprint hesapları ve durum geçişleri aynı; dar ekranda tüm kulvarlara erişilebilir. |

---

### P-15 · Toplu durum güncellemesi için güvenli domain desteği yok

| Alan | İçerik |
|---|---|
| **Ekran/Component** | Backlog ve sprint panosu |
| **Mevcut davranış** | Durum değişiklikleri tek tek yapılıyor. Backend'de toplu geçiş endpoint'i yok. Geçiş kuralları `WorkspaceService` ve `CollaborationService` içinde dağınık; `PATCH /api/tasks/{id}` ve `PATCH /api/self/tasks/{id}/status` farklı yetki ve farklı doğrulama yollarından geçiyor. Ayrıca her durum değişikliği `task_activity` / `audit_event` kayıtları üretiyor. |
| **Kullanıcı etkisi** | Çok sayıda işi aynı duruma taşımak yorucu. |
| **Önerilen iyileştirme** | **Bu iterasyonda uygulama.** Mevcut domain modeli güvenilir, tek noktadan sorgulanabilir bir "geçerli hedef durumlar" kuralı sunmuyor; toplu işlem atomiklik, kısmi başarısızlık ve audit davranışı açısından yeni iş kuralı tanımlamayı gerektirir ki bu kapsam dışıdır. Talimatın öngördüğü gibi **dokümante edilip ertelenmiştir**. |
| **Frontend kapsamı** | — |
| **Backend kapsamı** | — |
| **Veri/şema kapsamı** | — |
| **Risk** | Uygulanırsa yüksek (sessiz kısmi bozulma riski). |
| **Öncelik** | **Deferred** |
| **Kabul kriteri** | — |

---

### P-16 · Erişilebilirlik açıkları

| Alan | İçerik |
|---|---|
| **Ekran/Component** | Genel; özellikle ayarlar, panolar ve üretilen HTML |
| **Mevcut davranış** | Önceki iterasyonda focus ring, tablo semantiği, dialog focus trap (`modal-accessibility.directive.ts`) ve `prefers-reduced-motion` eklendi. Kalan açıklar: kapalı `<details>` içindeki içerik ekran okuyucuya ulaşmıyor (P-05); dinamik içerik değişimlerinde (filtre sonucu, kaydetme) `aria-live` bildirimi tutarsız; bazı ikon-yalnız butonlarda erişilebilir ad eksik; üretilen HTML'de tablo `<caption>`/`scope` kullanımı kısmi. |
| **Kullanıcı etkisi** | Klavye ve ekran okuyucu kullanıcıları için bilgi kaybı. |
| **Önerilen iyileştirme** | Durum değişikliklerinde tutarlı `aria-live`; ikon-yalnız butonlara `aria-label`; üretilen HTML tablolarına `<caption>` ve `scope="col"`; kategori gezinmesinde doğru `aria-current`; renk dışında da durum göstergesi (önceki iterasyonda başlandı, tamamlanmalı). |
| **Frontend kapsamı** | Geniş ama yüzeysel |
| **Backend kapsamı** | Yok |
| **Veri/şema kapsamı** | Yok |
| **Risk** | Düşük |
| **Öncelik** | **High** |
| **Kabul kriteri** | `test-status-semantics.cjs` genişletilir ve geçer; ikon-yalnız butonların tamamında erişilebilir ad bulunur; üretilen HTML tablolarında `scope` bulunur. |

---

### P-17 · Yazdırma çıktısı uygulama ekranlarında kısmi

| Alan | İçerik |
|---|---|
| **Ekran/Component** | `print.css` (29 satır, 22 `!important`) |
| **Mevcut davranış** | Raporlar ve sprint review için `@page` kuralları, kulvar/kart sayfa bölme kuralları ve `details` açma hilesi var. Ancak dashboard, backlog ve sprint panosu için yazdırma düzeni tanımlı değil; bu ekranlar yazdırıldığında ekran kabuğu (navigasyon, araç çubukları) da basılıyor. |
| **Kullanıcı etkisi** | Ekran görüntüsü yerine düzgün çıktı almak isteyen kullanıcı kullanılamaz PDF alıyor. |
| **Önerilen iyileştirme** | Ortak yazdırma temeli: uygulama kabuğunu gizle, içerik genişliğini sayfaya oturt, tablo başlıklarını tekrarla, koyu zeminleri sadeleştir, etkileşimli kontrolleri gizle. Ekran bazlı kurallar bunun üzerine eklensin. |
| **Frontend kapsamı** | `print.css` |
| **Backend kapsamı** | Yok |
| **Veri/şema kapsamı** | Yok |
| **Risk** | Düşük |
| **Öncelik** | **Medium** |
| **Kabul kriteri** | Dashboard, backlog, sprint panosu ve raporlar için yazdırma önizlemesi okunabilir; mevcut rapor/review yazdırma kuralları bozulmaz. |

---

### P-18 · Sayfa başlıkları ve breadcrumb kullanımı tutarsız

| Alan | İçerik |
|---|---|
| **Ekran/Component** | Tüm sayfalar; `sb-breadcrumb.component.ts` |
| **Mevcut davranış** | Önceki iterasyonda breadcrumb bileşeni eklendi ancak her sayfada aynı biçimde uygulanmadı. Bazı sayfalarda `page-head` + `eyebrow` + `h1` + açıklama var, bazılarında yalnız `h1` var. Birincil aksiyonun yeri her sayfada aynı değil. |
| **Kullanıcı etkisi** | Kullanıcı bulunduğu yeri ve ana aksiyonu her sayfada yeniden öğrenmek zorunda. |
| **Önerilen iyileştirme** | Tek bir sayfa başlığı deseni: breadcrumb → eyebrow → `h1` → kısa açıklama → sağda birincil aksiyon. Tüm sayfalarda uygula. |
| **Frontend kapsamı** | Sayfa şablonları + `sb-foundation.css` |
| **Backend kapsamı** | Yok |
| **Veri/şema kapsamı** | Yok |
| **Risk** | Düşük. `test-layout-ui.cjs` (73 satır) geçmeli. |
| **Öncelik** | **Medium** |
| **Kabul kriteri** | Tüm ana sayfalarda aynı başlık deseni; birincil aksiyon tutarlı konumda; layout testi geçer. |

---

## 4. Öncelik özeti

| Öncelik | Bulgular |
|---|---|
| **Critical** | P-02 (dashboard karar desteği) |
| **High** | P-01, P-05, P-06, P-07, P-08, P-09, P-10, P-11, P-13, P-16 |
| **Medium** | P-03, P-04, P-12, P-14, P-17, P-18 |
| **Deferred** | P-15 (toplu durum güncellemesi) |

---

## 5. Backend değişikliği gerektiren maddeler

Yalnız üç bulgu backend'e dokunuyor ve üçü de **salt-okunur veya katkısal**:

| Bulgu | Değişiklik türü | Mevcut sözleşmeye etkisi |
|---|---|---|
| P-02 | `overview()` yanıtına **yeni alanlar** | Yok — mevcut 19 alan aynı isim/anlamda kalır |
| P-03 | `calendarCapacity()` içi saf önbellekleme | Yok — sonuç birebir aynı olmalı |
| P-04 | Yeni `V45` migration, yalnız `CREATE INDEX` | Yok — şema genişlemez, veri değişmez |

Hiçbir mevcut endpoint kaldırılmaz, yeniden adlandırılmaz veya yanıt alanı silinmez.
Hiçbir migration dosyası değiştirilmez. Yetki kuralları (`SecurityConfig`) değiştirilmez.

---

## 6. Bu iterasyonda ele alınmayacaklar (gerekçeli)

| Konu | Gerekçe |
|---|---|
| Sunucu tarafı backlog sayfalama/arama | Mevcut veri hacmi gerektirmiyor; yeni endpoint kontrat riski taşıyor. Asıl kullanıcı sorunu filtre görünürlüğü (P-08) ve o çözülüyor. |
| Toplu durum güncellemesi | Domain güvenilir geçiş kuralı sunmuyor; yeni iş kuralı tanımlamayı gerektirir (P-15). |
| `WorkspaceService` ayrıştırması | 1272 satırlık sınıfın bölünmesi geniş regresyon yüzeyi yaratır; UI iterasyonunun konusu değil. |
| JPA/DTO katmanına geçiş | Mimari dönüşüm; kapsam dışı. |
| Dark mode | Mevcut değil; talimat gereği zorunlu eklenmiyor. Öncelik ana temanın kalitesi. |
| Rapor snapshot'larının kalıcılaştırılması | Gerekçe yok; mevcut veriden türetilebiliyor. Gereksiz veri çoğaltması yapılmaz. |
| Grafik kütüphanesi eklenmesi | Mevcut CSS/SVG yaklaşımı yeterli; bundle maliyeti gerekçesiz. |

---

## 7. Korunacak sözleşmeler (regresyon kilidi)

Aşağıdakiler bu iterasyonda **değişmeyecek** ve her adımda doğrulanacak:

- `frontend/src/app/app.routes.ts` içindeki path listesi
- API metot + yol envanteri (`scripts/inventory-api-calls.cjs` ile ölçülür)
- `service/src/main/resources/db/migration/` içindeki **mevcut** 44 dosya
- `SecurityConfig` yetki kuralları
- Sprint, kapasite, izin, mesai, tahmin ve BAU hesaplamalarının sonuçları
- Export güvenlik davranışı: CSP, alan allowlist'i, `safePhoto`, CSV formül koruması, izin gizliliği
- Yedekleme formatı ve `backupSchemaVersion`
- Slack yapılandırma akışı ve token şifrelemesi
