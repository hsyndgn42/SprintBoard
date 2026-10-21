# SprintBoard — UI/UX İyileştirme Planı

**Branch:** `feature/advanced-ui-ux` (base: `master` @ `f9962b6`)
**Girdi:** [`docs/ui-ux-review.md`](./ui-ux-review.md)

Bu plan, review raporundaki bulguları uygulanabilir, küçük ve doğrulanabilir adımlara böler.

---

## 0. Değişmez kısıtlar

Her adımda aşağıdakiler korunacak:

- Backend business logic, hesaplamalar, yetki kontrolleri, Slack davranışı
- API endpoint listesi, request/response kontratları, form submit payload'ları
- Route yapısı (`app.routes.ts` değişmez)
- Migration dosyaları, veritabanı modeli
- Mevcut `ModalAccessibilityDirective`, `FoldDirective`, `ListPagerComponent` davranışı
- Template-driven form yaklaşımı (Reactive Forms'a geçilmeyecek)
- Manuel `cdr.detectChanges()` kalıbı (OnPush'a geçilmeyecek)
- Yeni runtime dependency **eklenmeyecek** (`package.json` dependencies sabit)

Her commit sonrası: `npm run build` (production, budget kontrolü dahil) + ilgili node test'leri.

---

## Aşama 1 — Foundation / Design system

> Bulgular: F-01, F-02, F-03, A-07

### 1.1 Semantik token katmanı
- **Dosya:** `frontend/src/styles.css` (en üstte `:root` bloğu)
- **Yapılacak:** `--sb-*` ön ekiyle tek semantik token seti tanımla:
  - Renk: `primary`(+hover/soft/ink), `neutral-50..900`, `success`, `warning`, `danger`, `info` (her biri `-bg`/`-fg`/`-border` üçlüsüyle)
  - Yüzey: `bg`, `surface`, `surface-muted`, `border`, `border-strong`
  - Metin: `text`, `text-secondary`, `text-muted`, `text-inverse`
  - Ölçek: `space-1..8`, `radius-sm/md/lg/pill`, `shadow-xs/sm/md/lg`
  - Etkileşim: `focus-ring`, `focus-ring-offset`, `duration-fast/base`
  - Katman: `z-nav`, `z-topbar`, `z-backdrop`, `z-modal`, `z-toast`
- **Geriye uyumluluk:** Mevcut `--oc-*` ve `--ui-*` değişkenleri **silinmeyecek**, yeni token'lara alias yapılacak. Böylece `var(--oc-primary)` kullanan 22 yer ve component CSS'leri kırılmaz.
- **Doğrulama:** Build + before/after screenshot karşılaştırması (piksel farkı minimum olmalı).

### 1.2 Status/rozet ölçeğinin semantikleştirilmesi *(F-03 — Critical)*
- **Dosya:** `styles.css` `.status` blokları, `ui-system.css` `.main-content .status`
- **Yapılacak:**
  - `todo` / `havuzda` / `planned` → nötr-gri veya amber (todo için), **yeşil değil**
  - `doing` / `devam ediyor` → info (mavi)
  - `done` / `completed` → success (yeşil)
  - `undone` / `blocked` → danger (kırmızı)
  - `acil / plansız` → **warning (amber)**, şu anki yeşilden çıkarılacak
  - Her rozete `::before` ile küçük nokta → renk körlüğü için ikinci kodlama
- **Kısıt:** Durum değerleri, `statusText()` fonksiyonu ve sınıf adları **değişmez**; yalnız renk eşlemesi değişir.

### 1.3 Focus ring birleştirme *(A-07)*
- Global `#f0a500` ve form alanı `#b2d3f5` focus ring'lerini tek `--sb-focus-ring` değerine indir; kontrast ≥ 3:1.

### 1.4 `ui-system.css` çakışmalarının token'a bağlanması *(F-02)*
- `.btn` / `.btn.small` / `.field input` yükseklik ve padding değerlerini **tek kaynağa** (token) bağla.
- Yeni specificity hack'i eklenmeyecek.

**Commit:** `refactor(ui): establish shared design tokens and status semantics`

---

## Aşama 2 — Shared components

> Bulgular: F-04, F-05

### 2.1 Durum component'leri
Yeni dosya: `frontend/src/app/shared/` altında, hepsi **standalone**:

| Component | Selector | Amaç |
|---|---|---|
| `SbEmptyStateComponent` | `sb-empty-state` | ikon + başlık + açıklama + opsiyonel aksiyon (`<ng-content>`) |
| `SbLoadingComponent` | `sb-loading` | `role="status"` + metin; opsiyonel `variant="skeleton"` |
| `SbErrorStateComponent` | `sb-error-state` | `role="alert"` + mesaj + opsiyonel "Tekrar dene" |

- Mevcut `.empty`, `.loading`, `.notice.warn` **sınıfları korunacak** (CSS'i yeniden yazmamak için component bu sınıfları render eder).
- Uygulama sırası: önce component'ler yazılır, sonra sayfalar **kademeli** olarak geçirilir. Hepsini tek commit'te değiştirmek riskli.

### 2.2 Toast servisi *(F-05)*
- `SbToastService` (signal tabanlı kuyruk) + `SbToastHostComponent` (`app.component.ts` kabuğuna eklenir).
- `styles.css`'teki mevcut ölü `.toast` CSS'i kullanılır.
- `role="status"`, `aria-live="polite"`, otomatik kapanma, `prefers-reduced-motion` uyumlu.
- **Kısıt:** Mevcut inline `error`/`savedMessage` gösterimleri **kaldırılmayacak**; toast bunlara *ek* geri bildirim olarak bağlanacak. Böylece hiçbir mevcut davranış kaybolmaz.

### 2.3 Ortak filtre şeridi *(F-14, F-23)*
- `SbFilterBarComponent`: aktif filtre chip'leri + "Filtreleri temizle" (yalnız aktif filtre varken etkin).
- Filtreleme mantığı **component'lerde kalır**; bu component yalnız sunum + chip kaldırma event'i verir.

**Commit:** `feat(ui): add shared empty, loading, error, toast and filter components`

---

## Aşama 3 — Layout ve navigasyon

> Bulgular: F-06, F-07, F-08, F-09, F-20

### 3.1 Kanonik `.page-head` *(F-06)*
- Tüm sayfalarda: `.page-head > div(breadcrumb + eyebrow + h1 + p) + .page-actions`
- Düzeltilecek dosyalar: `overview.component.html`, `operations.component.ts` (Team/Leaves/Overtime), `insights.component.ts` (Settings).

### 3.2 Breadcrumb *(F-07, F-09)*
- `SbBreadcrumbComponent`: route'tan türetilen hafif şerit.
- Sprint detayı: `Sprintler › Sprint 26 › Pano`
- Roadmap detayı: `Roadmap › <hedef adı>`
- `← Sprintler` butonu breadcrumb'a devredilir (buton kaldırılır, navigasyon korunur).

### 3.3 Sprint detay aksiyon hiyerarşisi *(F-08)*
- `+ İş ekle` → tek primary
- `Sprinti düzenle` → secondary
- `Sprinti tamamla` → ayrılmış, vurgulu (danger-outline), ayırıcı ile
- `(click)` handler'ları, `@if` yetki koşulları **aynen korunur**.

### 3.4 Subtab iyileştirmesi *(F-20, F-21)*
- Aktif sekme vurgusunu güçlendir; yatay kaydırmada kenar fade ipucu; kanban için de aynı ipucu.

**Commit:** `feat(ui): improve navigation, page hierarchy and breadcrumbs`

---

## Aşama 4 — Dashboard

> Bulgular: F-10, F-11

- Aktif sprint panelini görsel olarak birincil konuma al.
- KPI şeridini kompaktlaştır; boş değerlerde (`—`) kısa açıklama göster.
- H1'i "Genel bakış" yap; takım adını breadcrumb/eyebrow'a taşı *(F-11)*.
- Kısayol kartlarına (Roadmap / Backlog / Takım) hover + focus durumu netleştir.
- **Kısıt:** Yalnız `/api/overview` içindeki mevcut alanlar kullanılacak; **yeni metrik türetilmeyecek**.

**Commit:** `feat(ui): improve dashboard information hierarchy`

---

## Aşama 5 — Backlog ve Sprint planlama

> Bulgular: F-12, F-13, F-15, F-16, F-17, F-18, F-19

### 5.1 Backlog tablosu *(F-12, F-13)*
- Aksiyon sütununa sabit genişlik; birincil/ikincil aksiyon ayrımı; satır yüksekliği ritmi.
- Roadmap `<select>`'ini görsel olarak hafiflet; değişiklikte toast onayı.

### 5.2 Slack panelleri *(F-15)*
- Bekleyen sayısı 0 iken kompakt şerit; >0 iken rozetle vurgulu.

### 5.3 Sprint panosu yoğunluğu *(F-16 — Critical)*
- Filtre panelini tek satırlık kompakt toolbar'a indir ("Daha fazla filtre" ile genişleyen).
- BAU panelini varsayılan katlanmış yap.
- Hedef: kanban'ın **ilk ekranda** görünmesi (1440×900'de).

### 5.4 Görev kartı *(F-17, F-18 — Critical)*
- Kartı kompaktlaştır: başlık + rozetler + **atanan kişi** + tahmin + durum select'i.
- `Engel bildir` / `Backlog'a geri gönder` aksiyonlarını `:hover`/`:focus-within` ile açılan ikincil alana taşı.
- **A-09 kısıtı:** Klavye kullanıcıları için `:focus-within` zorunlu; aksiyonlar DOM'dan kaldırılmaz, yalnız görsel olarak gizlenir (`visibility`/`opacity` değil — `opacity` + `pointer-events` ile ve focus'ta geri gelir).
- Atama verisi `task.assignments` içinden okunur — **ek API çağrısı yok**.

### 5.5 Sprint listesi *(F-19)*
- Satıra ilerleme çubuğu (`doneCount`/`taskCount` — mevcut alanlar) + chevron + belirgin hover/focus.

**Commit:** `feat(ui): improve backlog density and sprint board readability`

---

## Aşama 6 — Formlar, dialoglar, geri bildirim

> Bulgular: F-24, F-25, F-26, F-29, F-30, F-31, A-01, A-02

- **A-01/A-02:** Ortak form alanı deseni — zorunlu göstergesi + `aria-describedby` ile bağlı yardım metni.
- **F-25:** `ngModel` tabanlı inline hata gösterimi (kurallar değişmeden).
- **F-24:** Kaydetme sırasında yalnız submit disabled; iptal etkin kalır.
- **F-26:** Dirty form kapatılırken ikinci onay (kapsam: Backlog ekleme, Sprint ekleme, İzin ekleme gibi uzun formlar).
- **F-30:** Rapor yazdırma butonuna `[disabled]` + açıklayıcı `title` (aynı boolean ifade).
- **F-31:** CSV/HTML indirmede toast onayı.
- **F-29:** Slack token alanlarında `type="password"` + `autocomplete="off"` doğrulaması.

**Commit:** `feat(ui): improve forms, dialogs and user feedback`

---

## Aşama 7 — Ayarlar

> Bulgu: F-28

- `<details>` bloklarını kategori başlıkları altında grupla:
  1. **Çalışma düzeni** — Ekip ve çalışma düzeni, Çalışma takvimi, BAU varsayılanları, İş türleri
  2. **Tahmin** — Tahmin yöntemi
  3. **Entegrasyon** — Slack entegrasyonu
  4. **Veri güvenliği** — Yedekleme ve veri güvenliği
  5. **Yönetim** — Kullanıcılar ve erişim
- **Kısıt:** `<details>` içerikleri, component'ler, `(click)`/`(ngSubmit)` handler'ları ve kaydetme çağrıları **birebir korunur**; yalnız sıra ve sarmalayıcı değişir.

**Commit:** `feat(ui): group settings into meaningful categories`

---

## Aşama 8 — Erişilebilirlik

> Bulgular: A-03 (Aşama 1'de), A-04, A-05, A-08

- **A-04:** Tablolara `<caption class="sr-only">` ve `th[scope]`.
- **A-05:** Login submit'e busy durumu (native form POST korunarak, submit anında disable).
- **A-08:** Kanban sütunlarına `role="list"` / kartlara `role="listitem"`.
- Tüm yeni interaktif öğelerde görünür focus; tıklama alanı ≥ 32×32.
- Ekran okuyucu için durum değişikliklerinde `aria-live` doğrulaması.

**Commit:** `fix(a11y): improve semantics, labels and keyboard support`

---

## Aşama 9 — Responsive

> Bulgular: F-21, F-20

Doğrulanacak genişlikler: **1920 / 1440 / 1280 / 1024 / 820**

- Kanban yatay kaydırma ipucu (1024px'te "Undone" sütunu kesiliyordu).
- `.page-head` aksiyonlarının dar ekranda taşmaması (F-06 kanonikleştirmesi bunu zaten düzeltir).
- Subtab sarmalama davranışı.
- **Mobil uygulamaya dönüştürme yapılmayacak**; hedef dar ekranda fonksiyonun bozulmaması.

**Commit:** `fix(ui): responsive refinements for narrow viewports`

---

## Aşama 10 — Test

> Mevcut durum: frontend'de **hiç test yok** (`angular.json`'da `test` target'ı, test runner dependency'si ve `*.spec.ts` dosyası yok).

### Yaklaşım
Angular test runner **kurulmayacak** (yeni dev dependency = brief'e aykırı risk ve büyük kurulum). Bunun yerine repoda **zaten var olan desen** kullanılacak: `scripts/test-*-model.cjs` — `frontend/node_modules/typescript` ile anlık transpile edip `node:assert/strict` ile doğrulayan saf Node testleri (`scripts/test-share-export.cjs` bu desenin örneği).

### Eklenecek testler
- `scripts/test-ui-tokens.cjs` — `styles.css` içinde gerekli `--sb-*` token'larının tanımlı olduğunu ve eski `--oc-*` alias'larının korunduğunu doğrular (regresyon koruması).
- `scripts/test-status-semantics.cjs` — status sınıflarının beklenen semantik renk grubuna eşlendiğini doğrular (done ≠ todo ≠ acil).
- Mevcut `scripts/test-share-export.cjs` çalıştırılarak export mantığının bozulmadığı doğrulanır.

### Regresyon doğrulaması
- **Route listesi:** `app.routes.ts` diff'i boş olmalı.
- **API çağrı listesi:** `frontend/src` içindeki tüm `api.get/post/put/patch/delete` çağrılarının before/after listesi karşılaştırılır — **fark olmamalı**.
- **Form payload'ları:** `api.post(` / `api.put(` çağrılarının gövdeleri karşılaştırılır.
- `scripts/smoke-ui.cjs` izole instance'a karşı çalıştırılır (konsol hatası ve 4xx/5xx kontrolü).
- Before/after screenshot karşılaştırması (14 ekran × 2 genişlik).
- `mvn package` ile tam build.

**Commit:** `test(ui): add regression coverage for design tokens and status semantics`

---

## Uygulama sırası ve bağımlılıklar

```
Aşama 1 (Foundation)  ──┬─> Aşama 2 (Shared components) ──┬─> Aşama 4 (Dashboard)
                        │                                  ├─> Aşama 5 (Backlog/Sprint)
                        ├─> Aşama 3 (Layout/Nav) ──────────┤
                        │                                  ├─> Aşama 6 (Forms/Feedback)
                        │                                  └─> Aşama 7 (Settings)
                        └─> Aşama 8 (A11y) ──> Aşama 9 (Responsive) ──> Aşama 10 (Test)
```

Aşama 1 tüm diğerlerinin önkoşuludur. Aşama 8 ve 9 sürekli olarak her aşamada da gözetilir, sonda ayrıca doğrulanır.

---

## Zaman/risk dengesi

| Aşama | Öncelik | Risk | Karar |
|---|---|---|---|
| 1 Foundation | Critical | Düşük | **Uygulanacak** |
| 2 Shared components | High | Düşük | **Uygulanacak** |
| 3 Layout/Nav | High | Düşük | **Uygulanacak** |
| 4 Dashboard | High | Düşük | **Uygulanacak** |
| 5 Backlog/Sprint | Critical | Orta | **Uygulanacak** (en dikkatli adım) |
| 6 Forms/Feedback | High | Orta | **Uygulanacak** (F-26 dirty-guard kapsamı dar tutulacak) |
| 7 Settings | High | Düşük | **Uygulanacak** |
| 8 A11y | High | Düşük | **Uygulanacak** |
| 9 Responsive | Medium | Düşük | **Uygulanacak** |
| 10 Test | — | Düşük | **Uygulanacak** |
| F-27 (hata alanı refactor) | Low | Orta | **Ertelendi** — logic riski |
| P-04 (OnPush) | Low | Yüksek | **Kapsam dışı** |
| Backend önerileri (§14) | — | — | **Yalnız rapor** |

---

## Tamamlanma kriterleri

1. `mvn package` başarılı (frontend production build dahil, budget aşımı yok).
2. `node scripts/test-share-export.cjs` geçiyor.
3. Yeni eklenen `scripts/test-*.cjs` testleri geçiyor.
4. İzole instance'ta `scripts/smoke-ui.cjs` konsol hatası vermiyor.
5. 14 ekranın after screenshot'ları alınmış ve before ile karşılaştırılmış.
6. `app.routes.ts` değişmemiş.
7. API çağrı envanteri before/after aynı.
8. Sprint panosunda kanban 1440×900'de ilk ekranda görünüyor.
9. Status rozetleri semantik olarak ayrışıyor.
10. Görev kartlarında atanan kişi görünüyor.
