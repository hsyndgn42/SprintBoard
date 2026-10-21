# SprintBoard — İterasyon 2 Sonuç Raporu

**Branch:** `feature/professional-platform-ui`
**Base:** `master` @ `fd7b128`
**HEAD:** `072ea19`
**Durum:** İnceleme için hazır — **merge edilmedi, push edilmedi**

---

## 1. Yönetici özeti

İterasyon 2, SprintBoard'u ayrı ayrı tasarlanmış yönetim sayfaları toplamından
tutarlı bir mühendislik yönetim platformuna taşımayı hedefledi. 12 commit ile
tasarım sistemi birleştirildi, dashboard karar destek ekranına dönüştürüldü,
ayarlar kategorilere ayrıldı, paylaşılan durum ve kirli-form koruması eklendi,
üretilen HTML çıktısı profesyonelleştirildi.

İki bulgu planın kendisini değiştirdi ve raporun en önemli kısımları bunlar:

1. **Başlangıç paketi %37,7 küçüldü** (810,03 kB → 504,37 kB). İterasyon boyunca
   eklenen 38 kB'ı dengelemek için planlanan lazy-loading, beklenenin çok
   ötesinde kazanç verdi ve iterasyon öncesinden beri başarısız olan 700 kB
   bütçe uyarısını tamamen ortadan kaldırdı.
2. **Planlanan index migration'ı iptal edildi.** Uygulamadan önce yapılan
   doğrulama, H2'nin her yabancı anahtar kolonunu zaten otomatik indexlediğini
   gösterdi. Şema değişikliği yapılmadı.

Sonuç olarak bu iterasyon **şema değişikliği içermez**, **API kontratını
değiştirmez** ve mevcut veriyle tam uyumludur.

---

## 2. İnceleme bulguları

`docs/professional-ui-review.md` — 18 bulgu (P-01…P-18).

| Öncelik | Toplam | Uygulandı | Devredildi |
|---|---|---|---|
| Critical | 1 | 1 | 0 |
| High | 9 | 8 | 1 |
| Medium | 5 | 1 | 4 |
| Low | 2 | 0 | 2 |
| Deferred (riskli) | 1 | 0 | 1 |

---

## 3. Uygulanan iyileştirmeler

| Bulgu | Commit | İçerik |
|---|---|---|
| — | `e9e659a` | Tasarım sistemi birleştirme; `--sb-*` token ailesi, paylaşılan primitive'ler |
| — | `48e9163` | Paylaşılan loading / empty / error durumları (`sb-state`, 7 varyant, 6 ekran) |
| P-02 | `c310dce` + `9b62fd3` | Dashboard karar destek ekranı; takvim bağlamı, dikkat şeridi, kapsam dağılımı |
| P-05 | `f0e11f6` | Ayarlar 4 kategoriye ayrıldı; klavye erişilebilir kategori gezinmesi; tehlikeli işlemler izole |
| P-09/P-10 | `50c7fb6` | Üretilen HTML: rapor künyesi, yöntem notu, varsayılan-escape tablolar |
| P-06 | `4854a4a` | Paylaşılan kaydedilmemiş değişiklik koruması |
| P-01 | `c94a17f` | Lazy-loading; başlangıç paketi −305,66 kB |
| P-13 | `9987f2f` | Rapor kapsamı, dönemi ve veri tazeliği ekranda |
| P-16 | `072ea19` | Üretilen tablo başlıkları `scope="col"`; erişilebilirlik testi |

---

## 4. Backend değişiklikleri

**Tek değişiklik:** `WorkspaceService.overview()` yanıtına 7 **katkısal** alan.

- Yeni endpoint **yok** — mevcut `/api/overview` genişletildi.
- Mevcut 19 alanın hiçbiri silinmedi, yeniden adlandırılmadı, anlamı değişmedi.
- Yeni alanların tamamı mevcut hesaplardan türetilir; yeni iş kuralı tanımlamaz.
- Teslimat kapsamı `!BauPolicy.isBau(task)` üzerinden, mevcut `DELIVERY_FILTER`
  ile birebir mutabık şekilde hesaplanır.
- Aktif sprint yokken güvenli `null`/sıfır döner.

`OverviewSignalsTest` (6 test) bu kontratı kilitler.

---

## 5. Veritabanı değişiklikleri

**Yok.**

Migration eklenmedi, `schemaVersion` 44'te bırakıldı. Gerekçe ve kanıt
`docs/data-compatibility-plan.md` §4'te kayıtlıdır: izole bir H2 2.3.232
veritabanında `INFORMATION_SCHEMA.INDEX_COLUMNS` okunduğunda yabancı anahtar
kolonlarının zaten indexli olduğu görüldü (`CONSTRAINT_INDEX_5` / `5A`).
Kanıt tersini gösterdiği için index eklenmedi.

Dolayısıyla: tablo düşürülmedi, satır silinmedi, id yeniden numaralanmadı,
migration geçmişi değiştirilmedi, yedekleme formatı etkilenmedi.

---

## 6. İş mantığı koruması

Aşağıdakilerin hiçbirine dokunulmadı: sprint/backlog iş mantığı, yetki ve
oturum akışları, iş türleri, BAU şablonları, tahmin yöntemi, kapasite ve sprint
hesaplamaları, izin/mesai hesapları, Slack davranışı, yedekleme/geri yükleme,
admin kurtarma, veri modeli, migration dosyaları, zamanlanmış görevler.

**Kanıt:** `scripts/inventory-api-calls.cjs` çıktısı master ile **birebir
aynı** — 171 çağrı noktası, aynı benzersiz endpoint kümesi.

---

## 7. Testler

| Komut | Sonuç |
|---|---|
| `node scripts/test-*.cjs` (78 betik) | **PASS** — 78/78 |
| `mvn -B test "-Dexec.skip=true"` | **PASS** — 152/152 (146 temel + 6 yeni) |
| `npx ng build` | **PASS** |
| `scripts/inventory-api-calls.cjs` master karşılaştırması | **PASS** — fark yok |
| İzole örnekte 14 ekran, 1440px ve 1024px | **PASS** — 0 konsol hatası |
| `mvn package` | **NOT RUN - live JAR safety** |

Bu iterasyonda eklenen test betikleri: `test-shared-states.cjs`,
`test-dashboard-signals.cjs`, `test-settings-ia.cjs`,
`test-export-report-structure.cjs`, `test-dirty-state.cjs`,
`test-report-context.cjs`, `test-accessibility.cjs`.

Tüm testler veri kümesinden bağımsızdır; canlı veritabanı, gerçek kullanıcı
adı, canlı Slack verisi veya yazara özgü yol kullanmaz.

---

## 8. Paket karşılaştırması

| Aşama | Başlangıç paketi |
|---|---|
| master temel | 771,53 kB |
| paylaşılan durumlar sonrası | 792,75 kB |
| dashboard sonrası | 799,89 kB |
| ayarlar sonrası | 803,70 kB |
| export sonrası | 807,67 kB |
| kirli-form koruması sonrası | 810,03 kB |
| **lazy-loading sonrası (HEAD)** | **504,37 kB** |

**master'a göre net: −267,16 kB (−34,6%).** Transfer boyutu 130,43 kB.
Bütçe gevşetilmedi; 700 kB uyarısı gerçekten çözüldü.

En büyük lazy parçalar: `insights-component` 110,70 kB,
`sprints-component` 103,50 kB, `operations-component` 68,13 kB,
`sprint-review-component` 52,39 kB, `backlog-component` 37,20 kB.

---

## 9. Güvenlik ve gizlilik

- Üretilen HTML tabloları artık **varsayılan olarak escape** eder; `raw()`
  yalnız bilinçli ve denetlenmiş tek bir üretici için kullanılır.
- Düşmanca girdiyle (`<img src=x onerror=alert(1)>`, `<b>`, `&`, tırnak)
  doğrulandı: tamamı escape edildi, hiçbiri çalışmadı.
- Mevcut 24 maddelik export kontrat testi (`test-share-export.cjs`)
  **değiştirilmeden** geçmektedir.
- Çıktıda token, parola, anahtar veya gizli yapılandırma yoktur.
- Harici font, CSS, JS veya CDN bağımlılığı eklenmemiştir.
- İzin/gizlilik kuralları değiştirilmemiştir.

---

## 10. Canlı ortam koruması

- Canlı servis (PID 4488, port 4181) **durdurulmadı, yeniden başlatılmadı**.
  Doğrulandı: HTTP 200.
- `target/sprintboard-service-0.1.0.jar` **değiştirilmedi** (zaman damgası
  iterasyon öncesinden).
- Canlı süreç statik dosyaları JAR içinden sunmaktadır
  (`static-locations` override'ı yoktur), dolayısıyla `ng build` çıktısı canlı
  arayüzü etkilememiştir — komut satırı incelenerek doğrulanmıştır.
- Tüm doğrulamalar ayrı port (4185), geçici H2 veritabanı, sentetik veri ve
  Slack kapalı olacak şekilde yapılmış, ardından ortam tamamen temizlenmiştir.
- `service/data/` altındaki hiçbir dosyaya dokunulmamıştır.

---

## 11. Devredilen maddeler

| Bulgu | Neden |
|---|---|
| P-11 sprint review anlatısı | Kapsam büyük; ayrı iterasyon daha güvenli |
| P-17 uygulama ekranı yazdırma düzeni | Rapor yazdırma iyileştirildi; dashboard/backlog/pano devrediyor |
| P-03 kapasite önbellekleme (D-2) | Sayısal sapma riski; ölçülebilir fayda kanıtlanmadı |
| P-12 toplu durum değişikliği | Alan modeli güvenilir geçiş kuralı sunmuyor (review'da Deferred) |
| P-14 sunucu taraflı backlog sayfalama | Mevcut veri hacminde gerekçelenmedi |
| Angular test koşucusu | Mevcut bağımlılıksız Node testleri yeterli; az kullanılan çatı eklenmedi |

---

## 12. Merge önerisi

**READY FOR REVIEW**

Gerekçe: çalışma ağacı temiz, 78/78 Node ve 152/152 backend testi geçiyor,
API kontratı master ile birebir aynı, şema değişikliği yok, başlangıç paketi
master'ın %34,6 altında ve canlı ortam hiç etkilenmedi.

Merge öncesi dikkat edilecekler:

1. Branch merge edilmedi ve push edilmedi; karar incelemeye bırakılmıştır.
2. Merge sonrası `mvn clean package` **yalnız canlı servis durdurulduktan
   sonra** çalıştırılmalıdır; aksi hâlde kullanımdaki JAR üzerine yazılır.
3. `schemaVersion` 44'te kaldığı için veritabanı tarafında yapılacak işlem
   yoktur; mevcut yedekler okunmaya devam eder.
