# SprintBoard — Professional Platform UI Plan (İterasyon 2)

**Tarih:** 2026-10-21
**Branch:** `feature/professional-platform-ui` (base: `master` @ `fd7b128`)
**Girdi:** `docs/professional-ui-review.md`, `docs/data-compatibility-plan.md`

Bu plan, review'daki bulguları kontrollü fazlara böler. Her faz kendi commit'ini alır;
ilgisiz backend/migration/CSS değişiklikleri aynı commit'te birleştirilmez.

---

## 0. Çalışma kuralları

| Kural | Ayrıntı |
|---|---|
| Canlı JAR | `mvn package` / `mvn clean *` **yasak**. `mvn test` ve `npm run build` güvenli. |
| Canlı veri | `service/data/**`, `backups/`, `releases/` dokunulmaz. |
| Doğrulama ortamı | Ayrı port (4185), geçici H2 (`%TEMP%\sb-iter2`), Slack kapalı, sentetik veri. |
| Geçmiş | Mevcut commit'ler squash/amend/rebase edilmez. |
| Birleştirme | Bu iterasyonda **merge yok** — inceleme paketi sunulur. |

---

## Faz 1 — Tasarım sistemi konsolidasyonu

**Bulgular:** P-12, P-18
**Commit:** `refactor(ui): consolidate shared design system`

| # | İş | Dosya |
|---|---|---|
| 1.1 | Eksik token'ları tamamla: veri görselleştirme paleti, yazdırma renkleri, tablo/form yoğunluk ölçekleri, bölüm başlığı ölçeği | `sb-foundation.css` |
| 1.2 | `styles.css` ve `ui-system.css` içindeki en sık tekrar eden sabit renkleri token'a bağla (aşamalı, tek seferlik yeniden yazım yok) | `styles.css`, `ui-system.css` |
| 1.3 | Durum (success/warning/danger/info) renk tanımlarını tek kaynağa indir | `sb-foundation.css` |
| 1.4 | Ortak sayfa başlığı deseni: breadcrumb → eyebrow → `h1` → açıklama → sağda birincil aksiyon | `sb-foundation.css` |
| 1.5 | Kalan her `!important` için gerekçe kaydı | Plan sonundaki tablo |

**Kabul:** `test-ui-tokens.cjs`, `test-ui-system.cjs`, `test-layout-ui.cjs` geçer; sabit renk sayısı ölçülebilir azalır.

---

## Faz 2 — Ortak uygulama durumları

**Bulgular:** P-07
**Commit:** `feat(ui): standardize loading empty and error states`

| # | İş |
|---|---|
| 2.1 | Paylaşılan durum bileşenleri: yükleniyor (skeleton dahil), boş, arama sonucu yok, hata + yeniden dene |
| 2.2 | Dashboard, backlog, sprint listesi, sprint panosu, raporlar, üyeler, izin/mesai ekranlarında **fiilen** benimse |
| 2.3 | Boş durum metinleri: nedeni açıkla, sonraki adımı öner, kullanıcıyı suçlama, yetkisi olmayan aksiyonu gösterme |

**Kabul:** Bileşenler en az 6 ekranda kullanılır (grep ile kanıtlanır); kullanılmayan bileşen bırakılmaz.

---

## Faz 3 — Dashboard bilgi mimarisi

**Bulgular:** P-02 (Critical)
**Commit (frontend):** `feat(ui): redesign dashboard information architecture`
**Commit (backend):** `feat(api): extend overview read model` — **ayrı commit**

| # | İş | Katman |
|---|---|---|
| 3.1 | `overview()` yanıtına katkısal alanlar (bkz. veri uyumluluk planı §2.2) | Backend |
| 3.2 | `overview()` için yeni testler: yeni alanların formülü + mevcut 19 alanın korunması | Backend testi |
| 3.3 | `Overview` arayüzüne opsiyonel alanlar | Frontend |
| 3.4 | Bilgi hiyerarşisi: aktif sprint + kalan gün → dikkat gerektirenler → kapasite → tip dağılımı → tarihsel sayaçlar | Frontend |
| 3.5 | Her metriğe kapsam/birim açıklaması; sıfır payda ve veri yokluğu ele alınır | Frontend |
| 3.6 | Durumlar: yükleniyor, boş kurulum, aktif sprint yok, kısmi veri, backend hatası, dar laptop, yazdırma | Frontend |

**Kabul:** Mevcut `Overview` alanları isim/anlam olarak korunur; aktif sprint yokken ve boş kurulumda ekran hatasız; uydurma sağlık skoru yok.

---

## Faz 4 — Ayarlar bilgi mimarisi

**Bulgular:** P-05
**Commit:** `feat(ui): reorganize settings experience`

| # | İş |
|---|---|
| 4.1 | Kategoriler: Genel, Ekip, Çalışma düzeni, Tahmin, Sprint ve backlog, Slack, Raporlar ve paylaşım, Yedekleme ve veri güvenliği, Kullanıcılar ve yönetim |
| 4.2 | Kategori gezinmesi + derin bağlantı (hash anchor) + `aria-current` |
| 4.3 | İçeriği kapalı `<details>` hapishanesinden çıkar (Ctrl+F ve ekran okuyucu erişebilsin) |
| 4.4 | Tehlikeli aksiyonları ayrı ve görsel olarak ayrışmış bölüme taşı |
| 4.5 | Bölüm açıklamaları, kaydetme durumu görünürlüğü |

**Kısıt:** Route, API, doğrulama, kaydetme semantiği, yetki kontrolü, gizli değer maskeleme, Slack token şifrelemesi, yedekleme davranışı **değişmez**. DOM sırası görsel sırayla çakışmaz.

**Kabul:** Hiçbir ayar alanı kaybolmaz; `test-work-settings-ui.cjs`, `test-slack-settings-layout.cjs`, `test-holidays-ui.cjs` geçer.

---

## Faz 5 — Backlog iş akışı ve filtre görünürlüğü

**Bulgular:** P-08
**Commit:** `feat(backlog): improve filter visibility and result feedback`

| # | İş |
|---|---|
| 5.1 | Toplam sonuç sayısı her zaman görünür |
| 5.2 | Aktif filtre özeti (chip'ler) + tek tıkla temizleme |
| 5.3 | Sayfa konumu göstergesi |
| 5.4 | "Sonuç yok" ile "backlog boş" durumlarının ayrılması |
| 5.5 | Düzenleme sırasında filtre durumunun korunması |

**Not:** Sunucu tarafı sayfalama/arama bu iterasyonda **uygulanmıyor** (review §6 gerekçesi). `matchesBacklogView` mantığı değiştirilmiyor.

---

## Faz 6 — Sprint planlama ve pano iyileştirmeleri

**Bulgular:** P-14
**Commit:** `feat(ui): refine sprint planning and board interaction`

| # | İş |
|---|---|
| 6.1 | Yatay kaydırma ipucu (yalnız gerçek taşmada görünen kenar gradyanı) |
| 6.2 | Kulvar başlıklarında sticky davranış |
| 6.3 | Kart hiyerarşisi: başlık → tip/efor → atananlar |
| 6.4 | Uzun başlıkta kontrollü kırpma + tooltip; atanan taşmasında "+N" |
| 6.5 | Boş kulvar durumu; dar laptop ve dokunmatik davranışı |
| 6.6 | Dialog sonrası odak geri yüklemesi |

**Kısıt:** Sprint hesapları, kapasite kuralları ve durum geçişleri **değişmez**.

**Test senaryoları:** çok görev, uzun başlık, çok atanan, atanansız, karışık iş tipleri, bloke iş, plan dışı iş, boş kulvar, büyük BAU içeriği.

---

## Faz 7 — Raporlar ve insights

**Bulgular:** P-13
**Commit:** `feat(reports): redesign reports and insights experience`

| # | İş |
|---|---|
| 7.1 | Standart rapor başlık bloğu: başlık, kapsam, dönem, üretim zamanı, aktif filtreler, kısa özet |
| 7.2 | Metrik tanımları bölümü (adet / saat / story point / yüzde / ortalama / tarih aralığı; BAU dahil-hariç) |
| 7.3 | Tabloyu tekrar eden dekoratif grafikleri kaldır |
| 7.4 | Filtre yerleşimi, boş durumlar, dışa aktarma geri bildirimi |
| 7.5 | Cezalandırıcı veya yanıltıcı performans sınıflandırması yapılmaz |

---

## Faz 8 — Sprint review sunumu

**Bulgular:** P-11
**Commit:** `feat(review): create professional sprint review presentation`

Anlatı sırası:

1. Sprint kimliği
2. Hedef / bağlam (varsa)
3. **Yönetici özeti**
4. Planlanan ↔ tamamlanan
5. Teslim edilenler
6. Tamamlanmayan / devreden
7. Kapsam değişiklikleri
8. Plan dışı iş
9. Defect ve kalite göstergeleri
10. Kapasite, izin, mesai bağlamı
11. Öne çıkanlar
12. Riskler ve takip aksiyonları
13. Detay eki

**Kısıt:** Retrospektif yorum veya gerekçe **uydurulmaz**; yalnız mevcut veriler ve mevcut review notları kullanılır. Veri olmayan bölüm kısa boş durum gösterir veya dışa aktarımda atlanır.

**Kapsam:** Hem etkileşimli ekran, hem sunum görünümü, hem yazdırılan/dışa aktarılan HTML.

---

## Faz 9 — Üretilen HTML çıktıları

**Bulgular:** P-09, P-10
**Commit:** `feat(export): unify standalone HTML report shell`

| # | İş |
|---|---|
| 9.1 | Tek paylaşılan rapor kabuğu: doküman iskeleti, CSP, token seti, tipografi, tablo/KPI/bar yardımcıları, yazdırma kuralları, alt bilgi |
| 9.2 | Sayfa yönü (portrait/landscape) parametreleştir |
| 9.3 | Dört üreticiyi ortak kabuğa bağla |
| 9.4 | `escapeHtml`'in 4–5 kopyasını tek kaynağa indir |
| 9.5 | `presentation-html.ts` `table()` yardımcısını kaçış-güvenli yap, gerektiğinde açık `raw()` sarmalayıcı |
| 9.6 | Üretilen tablolara `<caption>` ve `scope="col"` |

**Zorunlu çıktı nitelikleri:** kendi kendine yeten, harici font/CSS/JS/CDN yok, ağ çağrısı yok, gömülü sır yok, kimlik doğrulama çerezi yok, uygulama route'una bağımlılık yok. JavaScript eklenmez.

**Yazdırma:** A4 desteği, kırpılma yok, kart bölünmesi kontrollü, tablo başlığı tekrarı, mantıklı sayfa sonu, etkileşimli kontrollerin gizlenmesi, okunabilir kontrast, aşırı koyu zemin yok.

**Güvenlik (korunacak):** dinamik metin kaçışı, CSV/HTML enjeksiyon koruması, token/parola/anahtar sızdırmama, `safePhoto` allowlist'i, izin gizliliği, CSP.

**Kabul:** `test-share-export.cjs` (24 iddia), `test-report-html.cjs`, `test-report-html-ui.cjs`, `test-report-tabs-ui.cjs`, `test-scope-views-ui.cjs`, `test-review-brief.cjs`, `test-share-ui.cjs` **değiştirilmeden** geçer.

---

## Faz 10 — Kaydedilmemiş değişiklik koruması

**Bulgular:** P-06
**Commit:** `feat(ui): add unsaved change protection`

| # | İş |
|---|---|
| 10.1 | Paylaşılan dirty-state mekanizması (snapshot karşılaştırması) |
| 10.2 | Kirli dialog kapanışında onay |
| 10.3 | Kirli sayfadan ayrılırken onay |
| 10.4 | Başarılı kayıttan hemen sonra uyarı yok |
| 10.5 | "Kaydediliyor" durumu "kaydedilmemiş"ten ayrı |
| 10.6 | Başarısız kayıtta kullanıcı kilitlenmez; İptal erişilebilir kalır |
| 10.7 | Salt-okunur sayfalarda tarayıcı uyarısı yok |

**Kısıt:** Backend'e gönderilen değerler **değişmez**.

---

## Faz 11 — Erişilebilirlik

**Bulgular:** P-16
**Commit:** `fix(a11y): improve announcements and accessible names`

| # | İş |
|---|---|
| 11.1 | Dinamik içerik değişimlerinde tutarlı `aria-live` (filtre sonucu, kaydetme, hata) |
| 11.2 | İkon-yalnız butonlara erişilebilir ad |
| 11.3 | Ayarlar kategori gezinmesinde `aria-current` |
| 11.4 | Üretilen HTML tablolarında `<caption>` ve `scope` |
| 11.5 | Renk dışında durum göstergesinin tamamlanması |

---

## Faz 12 — Responsive ve yazdırma

**Bulgular:** P-17
**Commit:** `feat(ui): improve print and narrow viewport behaviour`

| # | İş |
|---|---|
| 12.1 | Ortak yazdırma temeli: uygulama kabuğunu gizle, içeriği sayfaya oturt, tablo başlığı tekrarı, koyu zemin sadeleştirme |
| 12.2 | Dashboard, backlog, sprint panosu için yazdırma düzeni |
| 12.3 | 1024 px laptop ve dar görünüm doğrulaması |

---

## Faz 13 — Backend okuma modelleri ve performans

**Bulgular:** P-03
**Commit:** `perf(api): cache schedule lookups within capacity window`

| # | İş |
|---|---|
| 13.1 | `calendarCapacity()` içinde istek-kapsamlı saf önbellek |
| 13.2 | Kapasite testlerinin beklenen değerleri **değiştirilmeden** geçtiğini doğrula |

**Kırmızı çizgi:** Tek bir sayısal sapma görülürse değişiklik geri alınır.

---

## Faz 14 — Veri migration ve uyumluluk

**Bulgular:** P-04
**Commit:** `feat(db): add read-path indexes for assignment and leave lookups`
**Ayrı commit:** `test(data): verify migration and data compatibility`

| # | İş |
|---|---|
| 14.1 | `V45__report_read_indexes.sql` (yalnız `CREATE INDEX IF NOT EXISTS`) |
| 14.2 | `/api/health` `schemaVersion` → 45 (`backupSchemaVersion` 40 olarak **kalır**) |
| 14.3 | Migration testi: öncesi/sonrası tablo listesi, satır sayıları, ilişki sayıları |
| 14.4 | Eski yedek uyumluluğu doğrulaması (`BackupFixtureV40`) |

---

## Faz 15 — Test ve regresyon koruması

**Commit:** `test(ui): add professional UI regression coverage`

| # | Kapsam | Yöntem |
|---|---|---|
| 15.1 | Durum semantiği | Mevcut `test-status-semantics.cjs` genişletilir |
| 15.2 | Dashboard özet gösterimi | Yeni Node testi (veri setinden bağımsız) |
| 15.3 | Breadcrumb etiketleri | Yeni/genişletilmiş Node testi |
| 15.4 | Sprint panosu atananları | Mevcut board testleri + genişletme |
| 15.5 | Yükleniyor/boş/hata durumları | Yeni Node testi |
| 15.6 | Dirty-state koruması | Yeni Node testi |
| 15.7 | Ayarlar gezinmesi | Yeni Node testi |
| 15.8 | Rapor HTML kaçışı | Mevcut `test-share-export.cjs` korunur + genişletilir |
| 15.9 | Yazdırma/export yapısı | Yeni Node testi |
| 15.10 | Veri setinden bağımsız smoke | Mevcut `smoke-ui.cjs` (önceki iterasyonda bağımsızlaştırıldı) |

**Kural:** Hiçbir test tam sprint sayısına, gerçek kullanıcı adına, canlı fotoğrafa, canlı Slack verisine, canlı hesap bilgisine, canlı satır sayısına veya yazara özgü yola bağlı olamaz. Angular test runner **eklenmeyecek** — mevcut bağımlılıksız Node testleri yeterli ve zaten 74 betikle yoğun kullanımda.

---

## Faz 16 — Bundle ve performans

**Bulgular:** P-01
**Commit:** `perf(ui): lazy load heavy feature routes`

| # | İş |
|---|---|
| 16.1 | Dashboard dışındaki route'ları `loadComponent`'e çevir |
| 16.2 | Gerekirse `insights.component.ts` bölünmesi (ReportsComponent / SettingsComponent) |
| 16.3 | Master ve branch initial bundle ölçümü, en büyük chunk'ların kaydı |

**Kural:** Bundle bütçesi **gevşetilmez**. Artış varsa gerekçesi kaydedilir.

---

## Faz 17 — Sonuç dokümantasyonu

**Commit:** `docs(ui): record outcomes and deferred items`

Gerçekleşen sonuçlar, sapmalar, ertelenen maddeler ve sonraki öneriler kaydedilir.

---

## Commit sırası (özet)

| # | Commit | Faz |
|---|---|---|
| 1 | `docs(ui): add professional platform review and plan` | — |
| 2 | `refactor(ui): consolidate shared design system` | 1 |
| 3 | `feat(ui): standardize loading empty and error states` | 2 |
| 4 | `feat(api): extend overview read model` | 3 (backend) |
| 5 | `feat(ui): redesign dashboard information architecture` | 3 (frontend) |
| 6 | `feat(ui): reorganize settings experience` | 4 |
| 7 | `feat(backlog): improve filter visibility and result feedback` | 5 |
| 8 | `feat(ui): refine sprint planning and board interaction` | 6 |
| 9 | `feat(reports): redesign reports and insights experience` | 7 |
| 10 | `feat(review): create professional sprint review presentation` | 8 |
| 11 | `feat(export): unify standalone HTML report shell` | 9 |
| 12 | `feat(ui): add unsaved change protection` | 10 |
| 13 | `fix(a11y): improve announcements and accessible names` | 11 |
| 14 | `feat(ui): improve print and narrow viewport behaviour` | 12 |
| 15 | `perf(api): cache schedule lookups within capacity window` | 13 |
| 16 | `feat(db): add read-path indexes for assignment and leave lookups` | 14 |
| 17 | `test(data): verify migration and data compatibility` | 14 |
| 18 | `perf(ui): lazy load heavy feature routes` | 16 |
| 19 | `test(ui): add professional UI regression coverage` | 15 |
| 20 | `docs(ui): record outcomes and deferred items` | 17 |

Yalnız gerçek değişikliğe karşılık gelen commit'ler oluşturulur. Sıra, bağımlılıklara göre
ayarlanabilir; ilgisiz değişiklikler birleştirilmez.

---

## Doğrulama kapıları

Her fazdan sonra:

```
npm run build                        # frontend derlemesi (JAR'a dokunmaz)
node scripts/test-ui-tokens.cjs
node scripts/test-status-semantics.cjs
node scripts/test-share-export.cjs
```

Backend'e dokunan fazlardan sonra ek olarak:

```
mvn test                             # 146 test; package/repackage çalışmaz
```

İterasyon sonunda:

```
node scripts/smoke-ui.cjs            # izole örnek, sentetik veri
node scripts/inventory-api-calls.cjs # API envanteri karşılaştırması
```

Güvenli çalıştırılamayan her doğrulama `NOT RUN - live JAR safety` olarak raporlanır.
Hiçbir atlanan kontrol "geçti" olarak bildirilmez.
