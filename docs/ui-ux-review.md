# SprintBoard — UI/UX Review

**Tarih:** 2026-10-21
**Branch:** `feature/advanced-ui-ux` (base: `master` @ `f9962b6`)
**Kapsam:** Yalnız UI/UX. Backend business logic, API kontratları, migration'lar ve hesaplama mantığı kapsam dışıdır.

---

## 1. Yöntem

İnceleme üç kaynaktan yapıldı:

1. **Kod okuması** — `frontend/src` altındaki 763 KB TypeScript/HTML/CSS, `app.component.ts` (uygulama kabuğu), `app.routes.ts`, `styles.css` (51 KB), `ui-system.css` (20 KB) ve `service/src/main/java` altındaki controller'lar (API yüzeyi envanteri için).
2. **İzole çalışan uygulama** — Üretim jar'ı (`target/sprintboard-service-0.1.0.jar`) **ayrı port (4199)**, **ayrı geçici H2 veritabanı** (`%TEMP%\sb-uitest\sprintboard`), **otomatik yedekleme kapalı** (`--sprintboard.auto-backup.enabled=false`) ve **Slack env değişkenleri tanımsız** olacak şekilde çalıştırıldı. Canlı `service/data/sprintboard.mv.db` dosyasına **hiç dokunulmadı**.
3. **Gerçek tarayıcı ile ekran görüntüleri** — Headless Chrome + CDP ile 1440px ve 1024px genişliklerde 14 ekran yakalandı. Konsol hatası: **0**.

İzole ortam demo verisi: 6 üye, 4 roadmap hedefi, 34 backlog kaydı, 4 sprint (biri aktif, 13 görevli), 3 izin kaydı.

> **Not:** Bu rapordaki tüm bulgular gerçek kodda ve çalışan uygulamada doğrulanmıştır. Kodda bulunmayan hiçbir özellik varsayılmamıştır.

---

## 2. Mevcut durumun özeti

### 2.1 Teknoloji

| Alan | Mevcut durum |
|---|---|
| Angular | 20.3.31, **standalone component**, `@if`/`@for`/`@defer` control flow |
| State | Signal (`auth.service.ts`, `api.service.ts`) + component field'ları; store yok |
| Form | **%100 template-driven** (`FormsModule` + `ngModel`); Reactive Forms kullanılmıyor |
| UI kütüphanesi | **Yok** — tamamen el yazımı CSS + HTML (Material/PrimeNG/Tailwind yok) |
| Stil | `styles.css` (global, tek satırlık sıkıştırılmış bloklar) + `ui-system.css` (override katmanı) |
| Ikon sistemi | Unicode glyph (`⌂ ◇ ≡ ▣ ● ◷ ◴ ↗ ⚙`) — ikon fontu/SVG seti yok |
| Dialog | El yazımı `.modal-layer > .modal`; ortak `ModalAccessibilityDirective` |
| Toast/bildirim | **Yok** — her component kendi `error` / `savedMessage` / `actionMessage` string'ini inline basıyor |
| Pagination | Ortak `ListPagerComponent` |
| Frontend test | **Hiç yok** — `angular.json`'da `test` target'ı yok, test runner dependency'si yok, `*.spec.ts` dosyası yok |
| Dark mode | Yok (bu çalışmada eklenmeyecek) |

### 2.2 Güçlü yanlar (korunacak)

Uygulama "kötü" değil; birçok konuda ortalamanın üstünde:

- **`ModalAccessibilityDirective`** gerçekten iyi: focus trap, `aria-modal`, Escape ile kapatma, arka planı `inert` yapma, body scroll kilidi, focus restorasyonu ve iç içe modal desteği. Tek yerden yönetiliyor ve ~18 dosyada tutarlı kullanılıyor.
- **Destructive aksiyonlarda `window.confirm` kullanılmıyor.** Bunun yerine zorunlu gerekçe metni + onay checkbox'ı ile "bilinçli onay" deseni var (`sprint-board.component.html:51`, `sprint-close-dialog.component.ts:22`). Bu, native confirm'den daha iyi bir yaklaşım.
- **Skip link, `aria-live`, `role="status"`/`role="alert"`, `role="progressbar"`** doğru yerlerde kullanılmış.
- **`prefers-reduced-motion`** desteği global olarak var.
- **Dar ekran navigasyonu** (`app.component.ts`) manuel focus trap, `inert` ve Escape desteğiyle yazılmış.
- **`@defer`** sprint board/review sekmelerinde placeholder'lı olarak kullanılıyor.
- Sprint board filtrelerinde **"Filtreleri temizle"** butonu filtre aktif değilken `disabled` — doğru desen.

### 2.3 Temel problem

Uygulamanın sorunu *çirkinlik* değil, **tutarsızlık ve bilgi mimarisi**:

1. Ortak bir design token katmanı yok; aynı görsel kararlar onlarca yerde elle tekrar ediliyor.
2. Durum (loading/empty/error) markup'ı her sayfada kopyalanmış, her birinde biraz farklı.
3. Status renkleri **anlam taşımıyor** — "Yapılacak", "Devam ediyor", "Done" ve "Acil/plansız" neredeyse aynı yeşil tonda.
4. Sprint panosunda asıl iş (kanban) ekranın ~900px altında kalıyor; kart başına 2 kalıcı buton var.
5. İzinler gibi sayfalarda ana veri varsayılan olarak katlanmış durumda; kullanıcı boş sayfa görüyor.
6. Ayarlar 8 düz accordion; kategori yok.

---

## 3. Design system / foundation bulguları

### F-01 — İki rakip token seti ve 233 farklı hardcoded renk
- **Ekran/component:** `frontend/src/styles.css`, `frontend/src/ui-system.css`
- **Mevcut sorun:** `styles.css` içinde `--oc-*` (12 token), `ui-system.css` içinde `--ui-*` (10 token) olmak üzere iki ayrı token seti var ve birbirine bağlı değil (`--ui-ink: #203c57` ile `--oc-text: #1f2937` ayrı ayrı tanımlı). `styles.css` içinde **359 hex renk kullanımı / 233 farklı hex değeri** var ama yalnız **22 yerde** `var(--oc-*)` kullanılıyor. Spacing, radius, shadow, focus ring, z-index için token yok veya kullanılmıyor.
- **Kullanıcı etkisi:** Aynı anlamdaki öğeler (ör. ikincil metin) sayfadan sayfaya farklı gri tonlarda; görsel dil dağınık. Kontrast garantisi yok.
- **Önerilen iyileştirme:** Tek bir semantik token katmanı (`--sb-*`): primary / neutral / success / warning / danger / info / bg / surface / border / text-primary / text-secondary / text-muted / spacing / radius / shadow / focus-ring / z-index / transition. Eski `--oc-*` ve `--ui-*` isimleri **alias olarak korunur** ki mevcut 22 kullanım ve component CSS'leri kırılmasın.
- **Öncelik:** **Critical** (diğer tüm iyileştirmelerin önkoşulu)
- **Risk:** Düşük — yalnız CSS custom property eklemesi; mevcut değerlerle birebir eşlenir.
- **Logic'e etkisi:** Yok.
- **Zorluk:** Orta.

### F-02 — `ui-system.css` bir override katmanı olarak specificity savaşı veriyor
- **Ekran/component:** `ui-system.css` (244 satır)
- **Mevcut sorun:** Dosya, `styles.css`'i düzeltmek için `:root .btn`, `:root .field input`, `.main-content .card` gibi yapay olarak yükseltilmiş seçiciler kullanıyor. Örnek: `.btn` yüksekliği `styles.css`'te `min-height:40px`, `ui-system.css`'te `:root .btn { min-height: var(--ui-action-height) }` ile yeniden tanımlanıyor; `.btn.small` iki dosyada iki farklı değere (32px / 36px) sahip. Neredeyse tüm kurallar tek bir `@media screen { ... }` bloğuna sarılı, bu da `.main-content` dışındaki (modal, auth sayfası) öğelerin farklı davranmasına yol açıyor.
- **Kullanıcı etkisi:** Dolaylı — buton/alan yükseklikleri bağlama göre değişiyor, dialog içindeki kontroller sayfadakilerle aynı ölçüde değil.
- **Önerilen iyileştirme:** Çakışan değerleri token'a bağlayıp tek kaynağa indirmek; yeni kurallar eklerken specificity hack'i üretmemek. **Dosyayı yeniden yazmak değil**, çakışmaları token'a taşımak.
- **Öncelik:** **High**
- **Risk:** Orta — geniş yüzey; adım adım ve görsel doğrulamayla yapılmalı.
- **Logic'e etkisi:** Yok.
- **Zorluk:** Orta.

### F-03 — Status renkleri anlam taşımıyor
- **Ekran/component:** `styles.css` `.status` sınıfları; Backlog tablosu, Sprint panosu kartları
- **Mevcut sorun:** Ekran görüntüsünde doğrulandı — Backlog'da `Yapılacak`, `Devam ediyor`, `Done` rozetleri **birbirinden ayırt edilemeyecek kadar benzer açık yeşil**. Daha ciddisi: sprint panosunda **`Acil / plansız` rozeti yeşil** (`.status` varsayılanı), yani *acil durum* ile *tamamlandı* aynı renk ailesinde. CSS'te `.status.todo` turuncu (`#fff4df/#986000`) tanımlı ama backlog tablosunda uygulanan sınıf farklı olduğu için devreye girmiyor.
- **Kullanıcı etkisi:** **Yüksek.** Sprint panosunda riskli/acil işler görsel olarak öne çıkmıyor; yoğun listede durum taraması renge güvenilerek yapılamıyor.
- **Önerilen iyileştirme:** Tek bir semantik rozet ölçeği: nötr (todo/havuzda), bilgi (devam ediyor), başarı (done), uyarı (acil/plansız/risk), tehlike (undone/engelli). Renge ek olarak **nokta/işaret** ile çift kodlama (renk körlüğü için) ve rozet metni zaten mevcut.
- **Öncelik:** **Critical**
- **Risk:** Düşük — yalnız sınıf/renk eşlemesi; durum değerleri ve hesaplamalar aynı kalır.
- **Logic'e etkisi:** Yok (yalnız sunum).
- **Zorluk:** Düşük.

### F-04 — Ortak Empty / Loading / Error component'i yok
- **Ekran/component:** Tüm sayfalar
- **Mevcut sorun:** `<div class="loading">…</div>`, `<div class="card empty">…</div>`, `<p class="notice warn" role="alert">{{error}}</p>` markup'ı onlarca kez kopyalanmış. Her birinde metin ve yapı biraz farklı. Örnek tutarsızlık: Ayarlar sayfası loading için `<p class="notice" role="status">Ayarlar yükleniyor…</p>` kullanırken diğer tüm sayfalar `<div class="loading">` kullanıyor. Hiçbir empty state'te ikon yok; çoğunda sonraki adım aksiyonu yok (Roadmap bir istisna).
- **Kullanıcı etkisi:** Boş/hata durumlarında kullanıcı ne yapacağını anlamıyor; deneyim sayfadan sayfaya değişiyor.
- **Önerilen iyileştirme:** `SbEmptyStateComponent`, `SbLoadingComponent` (skeleton destekli), `SbErrorStateComponent` (retry aksiyonlu) — mevcut sınıf isimlerini koruyarak, içerikleri `<ng-content>`/input ile alacak şekilde.
- **Öncelik:** **High**
- **Risk:** Düşük.
- **Logic'e etkisi:** Yok — yalnız markup sarmalama.
- **Zorluk:** Orta (çok sayıda çağrı yeri).

### F-05 — Merkezî bildirim (toast) mekanizması yok
- **Ekran/component:** Tüm sayfalar
- **Mevcut sorun:** Başarı geri bildirimi her component'te farklı alan adıyla tutuluyor: `savedMessage`, `actionMessage`, `calendarMessage`, `templateMessage`, `inline-success`. `styles.css`'te **`.toast` sınıfı tanımlı ama hiçbir component kullanmıyor** (ölü CSS). Bazı yerlerde mesaj set ediliyor ama template'te gösterilmiyor (`operations.component.ts:96` `savedMessage`).
- **Kullanıcı etkisi:** "Kaydedildi mi?" sorusu her ekranda farklı yanıtlanıyor; bazı işlemlerde hiç geri bildirim yok (ör. Raporlar'da CSV indirme sessiz).
- **Önerilen iyileştirme:** Küçük bir `SbToastService` + tek `<sb-toast-host>`; `role="status"`/`aria-live="polite"` ile. Mevcut inline mesajlar **kaldırılmadan** toast'a köprülenir (geri alma riski düşük kalsın diye).
- **Öncelik:** **High**
- **Risk:** Düşük.
- **Logic'e etkisi:** Yok.
- **Zorluk:** Orta.

---

## 4. Layout ve navigasyon bulguları

### F-06 — `.page-head` içinde primary action yerleşimi tutarsız
- **Ekran/component:** `roadmap.component.ts:29` vs `operations.component.ts:22,109` vs `overview.component.html`
- **Mevcut sorun:** Roadmap primary butonu `.page-actions` sarmalayıcısında; Takım, İzinler, Fazla mesai doğrudan `.page-head`'in çocuğu olarak koyuyor; Genel bakış `.page-actions` olmadan tek `<a class="btn">` kullanıyor. Ayarlar'da hiç page-level aksiyon yok.
- **Kullanıcı etkisi:** Butonların dikey hizası ve dar ekran davranışı sayfadan sayfaya kayıyor (`ui-system.css` yalnız `.page-head .page-actions` için `width:100%` kuralı tanımlamış; sarmalayıcısı olmayan sayfalarda bu kural çalışmıyor).
- **Önerilen iyileştirme:** Tüm sayfalarda `.page-head > div(başlık bloğu) + .page-actions` kanonik yapısı.
- **Öncelik:** **High**
- **Risk:** Düşük.
- **Logic'e etkisi:** Yok.
- **Zorluk:** Düşük.

### F-07 — Breadcrumb yok, derin sayfalarda bağlam kayboluyor
- **Ekran/component:** `sprints/:id/:tab`, `roadmap/:id`
- **Mevcut sorun:** Sprint detayında konum yalnız topbar'daki "Sprintler" yazısı ve `← Sprintler` butonuyla anlaşılıyor. Topbar başlığı sprint detayındayken hâlâ **"Sprintler"** gösteriyor (`currentTitle` yalnız ilk route segmentine bakıyor), sayfa H1'i ise "Sprint 26". Roadmap detayında da aynı durum.
- **Kullanıcı etkisi:** Derin sayfada "neredeyim" belirsiz; tarayıcı sekme başlığı da sabit.
- **Önerilen iyileştirme:** `.page-head` üstünde hafif bir breadcrumb şeridi (Sprintler › Sprint 26 › Pano). Mevcut `eyebrow` yerine geçer, ek dikey alan tüketmez.
- **Öncelik:** **Medium**
- **Risk:** Düşük.
- **Logic'e etkisi:** Yok — yalnız router state okunur.
- **Zorluk:** Orta.

### F-08 — Sprint detayında aksiyon hiyerarşisi yok
- **Ekran/component:** `sprints.component.ts` (SprintDetailComponent, `.page-head`)
- **Mevcut sorun:** Yan yana 4 buton: `← Sprintler`, `Sprinti düzenle`, `+ İş ekle` (primary), `Sprinti tamamla`. **`Sprinti tamamla` geri döndürülemez/terminal bir işlem olmasına rağmen `Sprinti düzenle` ile aynı görsel ağırlıkta.** `← Sprintler` bir navigasyon öğesi olduğu halde aksiyon butonu gibi duruyor.
- **Kullanıcı etkisi:** Yanlış tıklama riski; önemli işlem ile rutin işlem ayırt edilemiyor.
- **Önerilen iyileştirme:** Geri navigasyonunu breadcrumb'a taşı; `+ İş ekle` tek primary; `Sprinti düzenle` secondary; `Sprinti tamamla` ayrılmış/vurgulu (ama dialog zaten onay checkbox'ı istiyor, o korunur).
- **Öncelik:** **High**
- **Risk:** Düşük — buton sırası/sınıfı değişir, `(click)` handler'ları aynı kalır.
- **Logic'e etkisi:** Yok.
- **Zorluk:** Düşük.

### F-09 — Topbar başlığı alt route'larda güncellenmiyor
- **Ekran/component:** `app.component.ts` `get currentTitle()`
- **Mevcut sorun:** `this.router.url.split('/')[1]` ile yalnız kök segment okunuyor; `/sprints/x/board` için "Sprintler" döner. Ayrıca `currentTitle` bir **getter** ve her change detection döngüsünde `router.url` parse ediyor.
- **Kullanıcı etkisi:** Düşük-orta; bağlam kaybı.
- **Önerilen iyileştirme:** Breadcrumb (F-07) ile birlikte çözülür.
- **Öncelik:** **Medium**
- **Risk:** Düşük.
- **Logic'e etkisi:** Yok.
- **Zorluk:** Düşük.

---

## 5. Dashboard (Genel bakış) bulguları

### F-10 — KPI kartları önceliklendirilmemiş ve boş değerleri zayıf
- **Ekran/component:** `overview.component.html` `.metric-grid`
- **Mevcut sorun:** 4 eşit ağırlıklı kart (Toplam sprint / Tamamlanan sprint / Done iş / Teslimat oranı). Veri yokken "Teslimat oranı" yalnız **`—`** gösteriyor; neden boş olduğu yazmıyor. Kartlar tıklanabilir değil, aksiyon sunmuyor.
- **Kullanıcı etkisi:** Dashboard'un ilk ekranı en az bilgi veren bölüm; kullanıcı aktif sprinte ulaşmak için aşağı bakmak zorunda.
- **Önerilen iyileştirme:** Aktif sprint panelini görsel olarak birinci sıraya al; KPI'ları daha kompakt bir şeride indir; boş değerlerde kısa açıklama ("Kapanan sprint yok"). **Yeni metrik üretilmeyecek**, yalnız mevcut `/api/overview` alanları yeniden düzenlenecek.
- **Öncelik:** **High**
- **Risk:** Düşük.
- **Logic'e etkisi:** Yok — aynı alanlar, aynı endpoint.
- **Zorluk:** Orta.

### F-11 — Dil karışımı: Türkçe arayüzde İngilizce başlık
- **Ekran/component:** `overview.component.html` H1
- **Mevcut sorun:** H1 `{{teamName}} Overview` şeklinde; arayüzün geri kalanı Türkçe. Benzer şekilde "Done iş", "Undone", "Roadmap", "Backlog" karışık kullanılıyor.
- **Kullanıcı etkisi:** Düşük (takım bu terimlere alışkın olabilir) ama kurumsal görünümü zayıflatıyor.
- **Önerilen iyileştirme:** H1'i "Genel bakış" + takım adını eyebrow/breadcrumb'a taşı. **Domain terimleri (Backlog, Sprint, Done, Undone, BAU) korunur** — bunlar ekibin çalışma dili.
- **Öncelik:** **Low**
- **Risk:** Düşük.
- **Logic'e etkisi:** Yok.
- **Zorluk:** Düşük.

---

## 6. Backlog bulguları

### F-12 — Tablo satır yüksekliği aksiyon sayısına göre zıplıyor
- **Ekran/component:** `backlog.component.ts` `.backlog-table .table-actions`
- **Mevcut sorun:** Ekran görüntüsünde net: havuzdaki kayıtlarda 3 buton (`Düzenle`, `Sil`, `Aktif sprinte al`) var ve `Aktif sprinte al` ikinci satıra kayıyor → satır yüksekliği ~82px; sprinte bağlı kayıtlarda tek buton var → ~54px. Liste "tırtıklı" görünüyor. `ui-system.css`'teki `.backlog-table .table-actions .btn { flex: 1 1 auto }` kuralı sarmalamayı tetikliyor.
- **Kullanıcı etkisi:** Tarama zorlaşıyor, göz ritmi bozuluyor; 20 satırlık sayfada yoğun kaos.
- **Önerilen iyileştirme:** Sabit satır ritmi; birincil aksiyon (`Aktif sprinte al`) görünür, ikincil aksiyonlar (`Düzenle`, `Sil`) kompakt/ikincil hiyerarşide. Aksiyon sütununa sabit genişlik.
- **Öncelik:** **High**
- **Risk:** Düşük.
- **Logic'e etkisi:** Yok — aynı butonlar, aynı handler'lar.
- **Zorluk:** Orta.

### F-13 — Her satırda inline `<select>` (Roadmap) tabloyu boğuyor
- **Ekran/component:** `backlog.component.ts` roadmap sütunu
- **Mevcut sorun:** 20 satırın her birinde tam genişlikte bir `<select>` var. Bu, tablonun en ağır görsel öğesi ve asıl içerik olan iş başlığını bastırıyor. Ayrıca inline değişiklikte **kaydedildi geri bildirimi yok** (F-05 ile bağlantılı).
- **Kullanıcı etkisi:** Görsel gürültü; yanlışlıkla değiştirme riski; değişikliğin kaydedilip kaydedilmediği belirsiz.
- **Önerilen iyileştirme:** Select'i görsel olarak hafiflet (ghost/underline stili, hover'da belirginleşen) ve değişiklikte toast ile onay ver. **Inline düzenleme davranışı korunur** — kaldırmak logic değişikliği olur.
- **Öncelik:** **Medium**
- **Risk:** Düşük.
- **Logic'e etkisi:** Yok.
- **Zorluk:** Düşük.

### F-14 — Aktif filtreler görünür değil
- **Ekran/component:** `backlog.component.ts` `.backlog-filters`, `operations.component.ts` `.filter-toolbar`
- **Mevcut sorun:** Backlog'da 6 filtre kontrolü var ve `Filtreleri temizle` butonu mevcut — ancak buton **her zaman etkin** ve hangi filtrelerin aktif olduğu yalnız select değerlerine bakılarak anlaşılıyor. Sonuç sayacı (`34 / 34 kayıt`) var, bu iyi. İzinler/Takım sayfalarında "temizle" butonu hiç yok.
- **Kullanıcı etkisi:** "Neden bu kayıt görünmüyor?" problemi; filtre kaldırma maliyeti yüksek.
- **Önerilen iyileştirme:** Aktif filtreleri kaldırılabilir chip olarak göster; `Filtreleri temizle` yalnız filtre varken etkin olsun (sprint board'daki mevcut doğru desen tüm sayfalara yayılsın).
- **Öncelik:** **High**
- **Risk:** Düşük.
- **Logic'e etkisi:** Yok — filtreleme getter'ları aynı kalır.
- **Zorluk:** Orta.

### F-15 — Slack panelleri sayfanın en üstünde prime alanı tüketiyor
- **Ekran/component:** `backlog.component.ts` → `app-slack-backlog-inbox`, `app-slack-inbox`
- **Mevcut sorun:** "İş istekleri · 0 bekleyen" ve "Defect bildirimleri" katlanmış panelleri, sayfa başlığından hemen sonra ~190px yer kaplıyor ve asıl backlog listesini aşağı itiyor. Bekleyen kayıt 0 olduğunda bile tam boyutta duruyorlar.
- **Kullanıcı etkisi:** Sayfanın ana işi (backlog listesi) ilk ekranda görünmüyor.
- **Önerilen iyileştirme:** Bekleyen sayısı 0 iken panelleri tek satırlık kompakt şeride indir; >0 iken vurgula (rozet ile). Panel içeriği ve API çağrıları aynı kalır.
- **Öncelik:** **Medium**
- **Risk:** Düşük.
- **Logic'e etkisi:** Yok.
- **Zorluk:** Düşük.

---

## 7. Sprint planlama / Sprint panosu bulguları

### F-16 — Kanban panosu ekranın ~900px altında başlıyor
- **Ekran/component:** `sprint-board.component.html`
- **Mevcut sorun:** Panodan önce sırayla: sayfa başlığı + 4 buton (≈130px), 8 sekmelik subtab şeridi (≈60px), "Plan nasıl değişti?" katlanmış panel (≈90px), "İşlerin durumu" filtre paneli (≈230px), "BAU · 5 iş" paneli (≈280px). Toplam ≈900px. 1440×900 ekranda kullanıcı **kanban'ı hiç görmeden** sayfayı açıyor.
- **Kullanıcı etkisi:** **Yüksek.** Sayfanın asıl amacı ilk ekranda yok; her ziyarette scroll gerekiyor.
- **Önerilen iyileştirme:** Filtreleri tek satırlık kompakt bir toolbar'a indir (genişletilebilir "Daha fazla filtre"); BAU panelini varsayılan katlanmış yap (içeriği ve verisi korunur); "Plan nasıl değişti?" panelini pano altına taşı veya kompaktlaştır.
- **Öncelik:** **Critical**
- **Risk:** Düşük-orta — `appFold` varsayılanı ve DOM sırası değişir; veri yükleme aynı kalır.
- **Logic'e etkisi:** Yok.
- **Zorluk:** Orta.

### F-17 — Görev kartları aşırı yüksek; kalıcı ikincil aksiyonlar
- **Ekran/component:** `sprint-board.component.html` `.task-card`
- **Mevcut sorun:** Her kart: başlık + (varsa) acil rozeti + kategori + size chip + tahmin + **tam genişlikte `<select>`** + **`Engel bildir` butonu** + **`Backlog'a geri gönder` butonu** = ~250px. 4 kart bir sütunu dolduruyor. `Backlog'a geri gönder` nadir ve yıkıcı bir işlem olmasına rağmen her kartta sürekli görünür.
- **Kullanıcı etkisi:** **Yüksek.** Sprint panosunda aynı anda çok az iş görülüyor; nadir yıkıcı aksiyon sürekli göz önünde (yanlış tıklama riski); kartlar tarama için fazla gürültülü.
- **Önerilen iyileştirme:** Kartı kompaktlaştır (başlık + rozetler + atanan kişi + tahmin). Durum `<select>`'i koru (ana etkileşim) ama kompakt hale getir. `Engel bildir` / `Backlog'a geri gönder` aksiyonlarını kart üzerinde **hover/focus ile açılan** veya görev detayına taşınan ikincil alana al — **handler'lar ve onay akışları aynen korunur**.
- **Öncelik:** **Critical**
- **Risk:** Orta — klavye erişilebilirliği korunmalı (hover-only olmamalı, `:focus-within` de tetiklemeli).
- **Logic'e etkisi:** Yok.
- **Zorluk:** Orta-yüksek.

### F-18 — Görev kartında atanan kişi görünmüyor
- **Ekran/component:** `sprint-board.component.html` `.task-card`
- **Mevcut sorun:** Demo verisinde tüm görevlere atama yapıldığı hâlde kartlarda **atanan kişi bilgisi hiç gösterilmiyor**. Atama bilgisi yalnız "Planlama" sekmesindeki tabloda ve görev detayında var. Panoda "Atanan kişi" filtresi mevcut ama sonucu kart üzerinde doğrulanamıyor.
- **Kullanıcı etkisi:** **Yüksek.** Sprint panosunun temel sorusu olan "kim ne yapıyor?" panodan yanıtlanamıyor. Kişiye göre filtrelendiğinde bile kartta teyit yok.
- **Önerilen iyileştirme:** Kart altına atanan kişi(ler) için kompakt avatar/baş harf rozeti + isim. Veri `task.assignments` içinde **zaten mevcut**, ek API çağrısı gerekmez.
- **Öncelik:** **Critical**
- **Risk:** Düşük.
- **Logic'e etkisi:** Yok — mevcut alan okunur.
- **Zorluk:** Düşük.

### F-19 — Sprint listesi satırlarında ilerleme ve tıklanabilirlik ipucu yok
- **Ekran/component:** `sprints.component.ts` `.sprint-row`
- **Mevcut sorun:** Satır: ad + tarih + hedef + durum rozeti + "2/13 Done iş". **İlerleme çubuğu yok** (CSS'te `.progress-track` tanımlı ve Roadmap/Genel bakış'ta kullanılıyor, burada kullanılmıyor). Satırın tıklanabilir olduğuna dair görsel ipucu (chevron, hover vurgusu) yok — yalnız `.sprint-row:hover{border-color:#c0d8f0}` var ki bu çok silik.
- **Kullanıcı etkisi:** Sprint'in durumu bir bakışta anlaşılmıyor; navigasyon keşfedilebilir değil. Tek sprintli sayfada ekranın %70'i boş kalıyor.
- **Önerilen iyileştirme:** Satıra ilerleme çubuğu ve chevron ekle; hover/focus durumunu belirginleştir; tarih aralığını "kalan gün" ile destekle (mevcut `start`/`end` alanlarından türetilir, yeni metrik değil).
- **Öncelik:** **High**
- **Risk:** Düşük.
- **Logic'e etkisi:** Yok.
- **Zorluk:** Düşük.

### F-20 — 8 sekmelik subtab şeridi dar ekranda sarmalıyor
- **Ekran/component:** Sprint detayı `.subtabs` (Özet, Planlama, Kapasite, Efor matrisi, Pano, Sprint günlüğü, Review, Retro)
- **Mevcut sorun:** 1440px'te tek satır; 1024px'te hâlâ tek satır ama sıkışık; `ui-system.css` 700px altında `flex-wrap` ile iki satıra geçiriyor. 8 eşdeğer sekme arasında hiyerarşi yok.
- **Kullanıcı etkisi:** Orta — hangi sekmenin asıl çalışma alanı olduğu belirsiz.
- **Önerilen iyileştirme:** Sekme etiketlerini kısalt, aktif sekmeyi daha güçlü vurgula, yatay kaydırmada kenar gölgesi ipucu ver. Sekme sayısı ve route'lar **değişmez**.
- **Öncelik:** **Medium**
- **Risk:** Düşük.
- **Logic'e etkisi:** Yok.
- **Zorluk:** Düşük.

### F-21 — 1024px'te kanban sütunları kesiliyor
- **Ekran/component:** `.board` grid
- **Mevcut sorun:** 1024px ekran görüntüsünde "Undone" sütunu sağ kenarda **yarısı kesik** görünüyor. `.board { grid-template-columns: repeat(4, minmax(190px,1fr)); overflow-x:auto }` ve 1100px altında `minmax(210px,1fr)` uygulanıyor; konteyner genişliği yetmediği için yatay kaydırma gerekiyor ama kaydırma olduğuna dair görsel ipucu yok.
- **Kullanıcı etkisi:** Dar laptopta bir sütunun varlığı fark edilmeyebilir.
- **Önerilen iyileştirme:** Kaydırılabilir alanda kenar gölgesi/fade ipucu; sütun min genişliğini gözden geçir.
- **Öncelik:** **Medium**
- **Risk:** Düşük.
- **Logic'e etkisi:** Yok.
- **Zorluk:** Düşük.

---

## 8. Operasyon sayfaları (Takım / İzinler / Fazla mesai)

### F-22 — Ana veri varsayılan olarak katlanmış; sayfa boş görünüyor
- **Ekran/component:** `operations.component.ts` (LeavesComponent, OvertimeComponent) — `<details appFold>`
- **Mevcut sorun:** İzinler sayfasında 3 izin kaydı olmasına rağmen ilk ekranda **hiçbir kayıt görünmüyor**: "İzin talepleri" ve "İzin geçmişi (3 kayıt)" panelleri kapalı geliyor. Ekranın yarısı boş. Aynı desen Fazla mesai sayfasında da var.
- **Kullanıcı etkisi:** **Yüksek.** Sayfanın asıl içeriği gizli; kullanıcı veri olmadığını sanabilir; her ziyarette ekstra tıklama.
- **Önerilen iyileştirme:** Ana veri panelini varsayılan **açık** yap (ikincil/yardımcı paneller kapalı kalsın). `appFold` durum saklama davranışı korunur.
- **Öncelik:** **High**
- **Risk:** Düşük — yalnız `open` varsayılanı.
- **Logic'e etkisi:** Yok — veri zaten yükleniyor, sadece görünürlük değişir.
- **Zorluk:** Düşük.

### F-23 — İzinler/Takım filtrelerinde sıfırlama yok
- **Ekran/component:** `operations.component.ts` `.filter-toolbar`
- **Mevcut sorun:** İzinler'de 4 filtre (Kişi, Sprint, İzin türü, Tarih kesinliği) var; `Filtreleri temizle` butonu yok. Backlog ve Sprint panosunda var.
- **Kullanıcı etkisi:** Filtre sıfırlamak için 4 select'i tek tek "Tümü"ye çevirmek gerekiyor.
- **Önerilen iyileştirme:** F-14 ile aynı ortak filtre şeridi deseni.
- **Öncelik:** **Medium**
- **Risk:** Düşük.
- **Logic'e etkisi:** Yok.
- **Zorluk:** Düşük.

### F-24 — Kaydederken "Vazgeç" de devre dışı kalıyor
- **Ekran/component:** `operations.component.ts:138` (LeavesComponent modal footer)
- **Mevcut sorun:** `<button ... class="btn" [disabled]="saving" (click)="close()">Vazgeç</button>` — kaydetme sırasında iptal butonu da kilitleniyor. İstek uzun sürerse veya hata alırsa kullanıcı dialogda sıkışıyor (Escape ise `data-modal-dismiss` üzerinden yine disabled butona gidiyor).
- **Kullanıcı etkisi:** Orta — nadir ama can sıkıcı kilitlenme.
- **Önerilen iyileştirme:** Kaydetme sırasında yalnız submit disabled olsun; iptal etkin kalsın.
- **Öncelik:** **Medium**
- **Risk:** Düşük — `close()` zaten istek sonucunu beklemiyor.
- **Logic'e etkisi:** Yok.
- **Zorluk:** Düşük.

---

## 9. Formlar ve dialoglar

### F-25 — Alan bazında inline validation yok
- **Ekran/component:** Tüm formlar
- **Mevcut sorun:** Doğrulama tamamen native HTML (`required`, `minlength`, `pattern`) + API hatası sonrası tek bir üst düzey `error` string'i. `ngModel` durumuna bağlı (`field.invalid && field.touched`) hiçbir alan bazlı hata mesajı yok. Zorunlu alanlarda görsel `*` işareti yok. Yardım metinleri `<small>` ile var ama `aria-describedby` ile input'a bağlı değil.
- **Kullanıcı etkisi:** Çok alanlı formlarda (Backlog ekleme, İzin ekleme, Sprint ekleme) hangi alanın hatalı olduğu native tooltip dışında anlaşılmıyor; API hatası geldiğinde hangi alana ait olduğu belirsiz.
- **Önerilen iyileştirme:** Ortak form alanı deseni: zorunlu göstergesi, `aria-describedby` ile bağlı yardım metni, `ngModel` tabanlı inline hata alanı. **Validation kuralları değişmez** — yalnız mevcut kuralların görünürlüğü artar.
- **Öncelik:** **High**
- **Risk:** Düşük-orta — `ngModel` referansı eklemek template değişikliği gerektirir; submit payload'ı aynı kalmalı.
- **Logic'e etkisi:** Yok.
- **Zorluk:** Orta.

### F-26 — Kaydedilmemiş değişiklik uyarısı yok
- **Ekran/component:** Tüm modal formlar
- **Mevcut sorun:** Escape / `Vazgeç` / backdrop ile dialog kapatıldığında doldurulan form içeriği uyarısız kayboluyor. `ModalAccessibilityDirective` Escape'i `data-modal-dismiss` butonuna yönlendiriyor, o da doğrudan kapatıyor.
- **Kullanıcı etkisi:** Uzun formlarda (Backlog ekleme ~10 alan, defect detayları dahil) veri kaybı.
- **Önerilen iyileştirme:** Form "dirty" ise kapatma öncesi ikinci onay. Dirty tespiti template-driven formda `NgForm.dirty` ile yapılabilir.
- **Öncelik:** **Medium**
- **Risk:** Orta — yanlış uygulanırsa her kapatmada rahatsız edici uyarı çıkar; dikkatli kapsam gerekir.
- **Logic'e etkisi:** Yok.
- **Zorluk:** Orta.

### F-27 — Her modalın kendi ayrı hata alanı var
- **Ekran/component:** `sprints.component.ts` (`error`, `assignmentError`, `classificationError`, …)
- **Mevcut sorun:** Tek component içinde 4+ bağımsız hata string'i. Her biri ayrı try/catch/finally bloğuyla yönetiliyor; `this.saving=true; this.error=''; … finally{this.saving=false; this.cdr.detectChanges();}` kalıbı `insights.component.ts` içinde 5+ kez tekrarlanıyor.
- **Kullanıcı etkisi:** Dolaylı — bakım zorluğu, tutarsız davranış riski.
- **Önerilen iyileştirme:** Bu çalışmada **davranış değiştirilmeden** yalnız görsel sunum birleştirilir. Ortak "submit guard" helper'ı önerilir ama logic'e dokunmamak için **rapor önerisi olarak bırakılmıştır**.
- **Öncelik:** **Low**
- **Risk:** Orta (refactor yapılırsa).
- **Logic'e etkisi:** Refactor yapılırsa var — bu nedenle uygulanmayacak.
- **Zorluk:** Yüksek.

---

## 10. Ayarlar

### F-28 — 8 düz accordion; kategori yok
- **Ekran/component:** `insights.component.ts` SettingsComponent
- **Mevcut sorun:** Sırasıyla: Tahmin yöntemi, Slack entegrasyonu, Ekip ve çalışma düzeni, Kullanıcılar ve erişim, BAU varsayılanları, İş türleri, Yedekleme ve veri güvenliği, Çalışma takvimi. Sıralama rastgele; güvenlik/yönetim ayarları ile günlük çalışma ayarları aynı düzlemde. Arama yok.
- **Kullanıcı etkisi:** Aranan ayarı bulmak için tüm başlıkları taramak gerekiyor.
- **Önerilen iyileştirme:** Görsel kategori grupları: **Çalışma düzeni** (Ekip ve çalışma düzeni, Çalışma takvimi, BAU varsayılanları, İş türleri) · **Tahmin** (Tahmin yöntemi) · **Entegrasyon** (Slack) · **Veri güvenliği** (Yedekleme) · **Yönetim** (Kullanıcılar ve erişim). **Route, API ve kaydetme mantığı değişmez**; yalnız `<details>` blokları gruplanır ve sıralanır.
- **Öncelik:** **High**
- **Risk:** Düşük — sadece DOM sırası ve sarmalayıcı.
- **Logic'e etkisi:** Yok.
- **Zorluk:** Düşük.

### F-29 — Hassas değerlerin gösterimi
- **Ekran/component:** `slack-settings.component.ts/.html`
- **Mevcut sorun:** `botToken` / `appToken` alanları kaydettikten sonra component içinde `''` yapılıyor (`this.botToken=''`), yani tekrar gösterilmiyor — **bu doğru davranış**. Ancak input'ların `type` özniteliği ve autocomplete davranışı gözden geçirilmeli.
- **Kullanıcı etkisi:** Düşük.
- **Önerilen iyileştirme:** Token alanlarının `type="password"` + `autocomplete="off"` olduğundan emin ol; maskelenmiş "kayıtlı" göstergesi.
- **Öncelik:** **Medium**
- **Risk:** Düşük.
- **Logic'e etkisi:** Yok.
- **Zorluk:** Düşük.

---

## 11. Raporlar

### F-30 — Yazdırma butonu sessizce çalışmıyor olabilir
- **Ekran/component:** `insights.component.ts:154`
- **Mevcut sorun:**
  ```ts
  if(!this.loading && !this.error && this.defectReady() && this.roadmapReady()
     && this.trendReady() && this.scopeReady() && this.overtimeReady()) window.print();
  ```
  5 hazırlık koşulundan biri sağlanmazsa buton **hiçbir şey yapmıyor ve hiçbir geri bildirim vermiyor**. Buton `disabled` da değil.
- **Kullanıcı etkisi:** **Yüksek.** Kullanıcı "Tüm raporlar PDF" butonuna basıyor, hiçbir şey olmuyor, nedenini öğrenemiyor.
- **Önerilen iyileştirme:** Koşul sağlanmadığında butonu `disabled` yap ve `title`/yardımcı metinle "Raporlar hâlâ yükleniyor" bilgisini ver. **Koşul mantığı aynen korunur**, yalnız durum görünür kılınır.
- **Öncelik:** **High**
- **Risk:** Düşük.
- **Logic'e etkisi:** Yok — aynı boolean ifade, sadece `[disabled]` binding'ine de verilir.
- **Zorluk:** Düşük.

### F-31 — CSV/HTML indirme sessiz
- **Ekran/component:** `insights.component.ts:64` `exportCsv()`
- **Mevcut sorun:** Dosya indiriliyor ama hiçbir onay mesajı yok. Tarayıcı indirme çubuğu gizliyse kullanıcı işlemin olup olmadığını bilmiyor.
- **Kullanıcı etkisi:** Orta.
- **Önerilen iyileştirme:** Toast ile "`<dosya adı>` indirildi" bildirimi (F-05).
- **Öncelik:** **Medium**
- **Risk:** Düşük.
- **Logic'e etkisi:** Yok.
- **Zorluk:** Düşük.

### F-32 — 10 sekmelik rapor şeridi ve zayıf boş durum
- **Ekran/component:** `reports.component.html`
- **Mevcut sorun:** 10 sekme tek satırda. Veri yokken 3 KPI kartı `0` gösteriyor ve altında devasa bir kartın ortasında tek cümle: "Tamamlanan sprint bulunamadı." İkon yok, sonraki adım yok.
- **Kullanıcı etkisi:** Yeni kurulumda rapor sayfası ölü görünüyor.
- **Önerilen iyileştirme:** Ortak empty state component'i (F-04) + sonraki adım aksiyonu ("Sprintlere git").
- **Öncelik:** **Medium**
- **Risk:** Düşük.
- **Logic'e etkisi:** Yok.
- **Zorluk:** Düşük.

---

## 12. Erişilebilirlik bulguları

| # | Bulgu | Dosya/kanıt | Öncelik |
|---|---|---|---|
| A-01 | Yardım metinleri (`<small>`) input'lara `aria-describedby` ile bağlı değil | Tüm formlar, `auth.component.ts` şifre ipucu | High |
| A-02 | Zorunlu alanlarda görsel + programatik `required` göstergesi tutarsız | Tüm formlar | High |
| A-03 | Status rozetleri yalnız renk + metin; renk ayırt edici değil (F-03) | `.status` | Critical |
| A-04 | Tablolarda `<caption>` ve `scope` öznitelikleri yok | `backlog-table`, `planning-table`, rapor tabloları | Medium |
| A-05 | Login formunda `busy`/loading durumu yok; submit tekrar basılabilir | `auth.component.ts` (native form POST) | Medium |
| A-06 | `loginFailed` tespiti `window.location.hash.includes('error=1')` ile yapılıyor — kırılgan | `auth.component.ts` | Low |
| A-07 | Focus ring rengi iki yerde farklı (`#f0a500` global, `#b2d3f5` form alanları) | `styles.css` / `ui-system.css` | Medium |
| A-08 | Kanban sütunlarında `role="list"`/`listitem` semantiği yok | `sprint-board.component.html` | Medium |
| A-09 | Hover ile açılacak ikincil aksiyonlar (F-17) klavye ile de erişilebilir olmalı | Yeni geliştirme kısıtı | Critical (uygulama sırasında) |

**Pozitif:** Skip link, modal focus trap, `aria-live` sayaçlar, `role="progressbar"`, `prefers-reduced-motion`, ikon-only butonlarda `aria-label` (`.mobile-menu`, `.nav-close`) doğru uygulanmış.

---

## 13. Performans bulguları

| # | Bulgu | Dosya | Öncelik |
|---|---|---|---|
| P-01 | Template'te satır başına fonksiyon çağrıları: `color(item)`, `subtypeLabel()`, `estimate(item)`, dinamik `aria-label` string birleştirme — her change detection'da yeniden hesaplanıyor | `sprint-board.component.html/.ts` | Medium |
| P-02 | `currentTitle` getter'ı her CD döngüsünde `router.url` parse ediyor | `app.component.ts` | Low |
| P-03 | Tek bir mutasyondan sonra 6'lı `Promise.all` ile tüm kaynaklar yeniden yükleniyor | `operations.component.ts:182` (Overtime) | Medium |
| P-04 | `OnPush` change detection hiçbir component'te kullanılmıyor; bunun yerine her yerde manuel `cdr.detectChanges()` | Tüm component'ler | Low (kapsam dışı — davranış riski) |
| P-05 | `sprints.component.ts` 52 KB tek dosyada iki component | Bakım | Low |

**Not:** Bu çalışmada **ağır chart/animasyon kütüphanesi eklenmeyecek**; raporlardaki grafikler zaten saf CSS ile çizilmiş durumda ve korunacak.

---

## 14. Backend değişikliği gerektiren öneriler (BU ÇALIŞMADA UYGULANMAYACAK)

Aşağıdakiler gerçek UI/UX iyileştirmeleri olur ancak **API/backend değişikliği gerektirdiği için yalnız öneri olarak kaydedilmiştir**:

1. **Backlog'da sunucu taraflı arama/sayfalama.** Şu an `/api/backlog` tüm kayıtları (demo veride 31 KB) tek seferde döndürüyor ve filtreleme/sayfalama tamamen istemcide. Kayıt sayısı büyüdüğünde ilk yükleme ve her CD döngüsü yavaşlar. Çözüm `?query=&page=` parametreleri gerektirir → kontrat değişikliği.
2. **Toplu işlem (bulk action) desteği.** Backlog'da çoklu seçim + toplu sprinte alma UI olarak eklenebilir ama her kayıt için ayrı `POST /api/sprints/{id}/tasks` çağrısı gerekir (N istek). Verimli olması için bulk endpoint gerekir.
3. **Sprint listesinde kapasite/ilerleme özeti.** `/api/sprints` `taskCount`/`doneCount` döndürüyor (ilerleme çubuğu için yeterli) ama kapasite bilgisi için sprint başına ayrı `/api/sprints/{id}/capacity` çağrısı gerekiyor. Liste ekranında N+1 çağrı olurdu.
4. **Rapor hazırlık durumunun nedeni.** F-30'da butonu disabled yapabiliyoruz ama "hangi rapor bölümü hazır değil" bilgisini kullanıcıya göstermek için readiness sinyallerinin ayrıştırılması gerekir — bu component içi refactor olduğundan sınırlı yapılabilir.
5. **Optimistic UI / kısmi yenileme.** Tek bir görev durumu değiştiğinde tüm sprint yeniden yükleniyor (`load(sprintId)`). Kısmi güncelleme için response kontratının zenginleşmesi gerekir.
6. **Kullanıcı tercihleri (varsayılan filtre, katlanmış panel durumu) sunucuda saklama.** Şu an `appFold` durumu yalnız istemcide.

---

## 15. Öncelik özeti

| Öncelik | Adet | Bulgular |
|---|---|---|
| **Critical** | 5 | F-01, F-03, F-16, F-17, F-18 (+ A-03, A-09) |
| **High** | 12 | F-02, F-04, F-05, F-06, F-08, F-10, F-12, F-14, F-19, F-22, F-25, F-28, F-30 (+ A-01, A-02) |
| **Medium** | 12 | F-07, F-09, F-13, F-15, F-20, F-21, F-23, F-24, F-26, F-29, F-31, F-32 (+ A-04, A-05, A-07, A-08, P-01, P-03) |
| **Low** | 3 | F-11, F-27, (+ A-06, P-02, P-04, P-05) |

---

## 16. Kapsam dışı bırakılanlar

Bu çalışmada **yapılmayacaklar** (brief gereği):

- Backend business logic, hesaplama, yetkilendirme, Slack davranışı değişikliği
- API endpoint / request / response kontratı değişikliği
- Migration dosyası değişikliği
- Yeni UI framework veya ağır dependency eklenmesi
- Dark mode eklenmesi (mevcut değil; önceliğimiz ana temanın kalitesi)
- Reactive Forms'a geçiş (davranış riski yüksek)
- `OnPush` change detection'a geçiş (manuel `detectChanges()` kalıbıyla çakışır)
- `sprints.component.ts` dosya bölme refactor'ü (davranış riski)
