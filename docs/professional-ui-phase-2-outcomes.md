# Professional Platform UI — Phase 2 Outcomes

Bu belge `docs/professional-ui-phase-2-plan.md` içindeki R-01…R-12 maddelerinin
sonuçlarını kaydeder. Her madde için **yapılan**, **kanıt** ve varsa **ertelenen
kısım** ayrı ayrı yazılmıştır.

- Taban (master merge): `9ba1118`
- Faz-2 dalı: `feature/professional-platform-ui-phase-2`
- Backend değişikliği: **yok**
- Migration: **yok — şema v44 korundu**
- Initial bundle: **504.37 kB (değişmedi)**

---

## R-01 — Yönetici özeti · Critical · **Tamamlandı**

`frontend/src/app/pages/review-summary.model.ts` eklendi. Ekran ve standalone
HTML aynı modeli kullandığı için ikisi birbirinden farklı sayı üretemez.

Her metrik için formül, birim ve zaman aralığı kart içinde gösterilir.
Paydası sıfır olan oranlar hesaplanmaz; `—` ile gösterilir.

**Sıfır ile "veri yok" ayrımı.** `known:false` olan değerler kesikli çerçeve ve
`—` ile çizilir; gerçek sıfırlar `0` olarak kalır. Boş sprint ekran görüntüsünde
"Done oranı", "Kapsama eklenen", "Kapsamdan çıkan" `—` iken "Blokajlı" `0`'dır.

Birleşik sağlık skoru **üretilmedi** (brief §3 gereği).

Kanıt: `scripts/test-review-summary.cjs` modeli gerçekten çalıştırır.

## R-02 — Anlatı sırası ve bölüm gezinmesi · High · **Tamamlandı**

Bölüm sırası: kimlik → yönetici özeti → planlanan/tamamlanan → teslim edilen →
tamamlanmayan → kapsam değişimi → riskler → detaylı döküm → tanımlar.

Bölüm çipleri (`Bölümler: …`) ankor bağlantısı olarak eklendi.

Kanıt: `scripts/test-review-narrative.cjs` sıralamayı kaynak üzerinden doğrular.

## R-03 — Sunum (toplantı) modu · Critical · **Tamamlandı**

`presenting` signal'ı ile tam ekran overlay. Uygulama navigasyonu gizlenir,
bağlam şeridi (sprint · takım · tarih) ve "Sunumdan çık (Esc)" görünür kalır.

- Otomatik ilerleme **yok**, hover bağımlılığı **yok**.
- `prefers-reduced-motion` destekleniyor.
- Odak **hapsedilmiyor** (brief: "do not trap focus incorrectly").
- Çıkışta odak tetikleyici düğmeye geri döner.

**İki gerçek hata bu madde sırasında bulundu ve düzeltildi:**

1. *Odak geri dönmüyordu.* Odak bir microtask'ta veriliyordu; bu, Angular'ın
   `presenting` değişimini DOM'a yazmasından **önce** çalışır. Hâlâ gizli olan
   düğmeye `.focus()` çağırmak sessizce hiçbir şey yapmaz. Macrotask'a alındı ve
   düğüm yeniden oluşturulmuşsa tekrar sorgulanıyor. (`d530521`)
2. *`<details>` bölümleri sunumda kapalı kalıyordu.* Modern Chrome kapalı
   `<details>` içeriğini `display` ile değil `content-visibility` ile gizler, bu
   yüzden CSS ile açmak güvenilir değildir. `openNarrative()` artık `open`
   **özniteliğini** set eder ve çıkışta önceki durumu geri yükler. (`72dda73`)

Her ikisi de kodu okuyarak değil, izole örnekte Escape'e basılarak bulundu.

## R-04 — Riskler ve istisnalar · High · **Tamamlandı**

Yalnız kayıtlı koşullardan türetilir: blokajlı iş, atanmamış iş, tahminsiz iş,
kapsam takibinin kapalı olması, prod defect. Sebep, sorumlu, performans yorumu
veya aksiyon önerisi **üretilmez**; bölüm altında bu açıkça yazar.

Kanıt: `test-review-narrative.cjs` sabit risk cümlesi aramasıyla bunu korur.

## R-05 — Standalone sprint review HTML'i · High · **Tamamlandı**

`presentation-html.ts` içine `execSummary()`, `exceptionsSection()`,
`appendix()` eklendi; tanımlar ekranla ortak `REVIEW_DEFINITIONS`'tan gelir.

Boş bölümler **atlanır** — büyük boş kart basılmaz.

Dış CSS / font / JS / CDN / ağ isteği yok. İzole örnekte ölçülen dış istek
sayısı: **0**.

## R-06 — Yazdırma ve A4 · High · **Tamamlandı**

Üç genişlikte A4 PDF üretildi, yatay taşma **0**. Etkileşimli kontroller ve
navigasyon baskıda gizlenir, açık arka plan kullanılır.

## R-07 — Raporlar ve insights · Medium · **Kısmen — bilinçli olarak sınırlı**

Önceki iterasyonda rapor bağlamı, dönem, tazelik ve metodoloji zaten
tamamlanmıştı. Bu fazda yalnız **doğrulanmış bir boşluk** kapatıldı:
`review-operations.model.ts` tablosunda `scope="col"` eksikti (R-12).

Kalan rapor ekranları gözden geçirildi; somut bir eksiklik bulunmadığı için
"sebepsiz yeniden tasarım yapma" kuralı gereği dokunulmadı.

## R-08 — Paylaşılan durumlar · Medium · **Gerekçeli sapma**

Sprint review ekranında generic `sb-state` **kullanılmadı**. Gerekçe: her bölüm
kendi bağlamına özgü bir boş durum gösteriyor ("Kapsam takibi kapalı", "Bu
sprint için hedef belirtilmemiş"). Brief §13 açıkça şunu söylüyor: *"Do not
replace a useful contextual state with a generic message that loses
information."* Generic bileşene geçmek bilgi kaybettirirdi.

Rapor ekranlarındaki mevcut `sb-state` kullanımı korundu.

## R-09 — Backlog ölçeklenebilirliği · **Ölçüldü ve ertelendi**

Tahmin değil, izole örnekte ölçüm (`measure-backlog.cjs`):

| Ölçüm | Değer |
|---|---|
| Sunucu gidiş-dönüş | 6 ms |
| Kayıt başına yük | 924 bayt |
| 200 kayıt projeksiyonu | 180 kB |
| 1000 kayıt projeksiyonu | 902 kB |
| 5000 kayıtta istemci filtresi | geçiş başına ~1.4 ms |

Filtreleme darboğaz **değil**. Tek takımlı, tek instance bir uygulamada
gerçekçi backlog boyutunda (≤200) kullanıcıya yansıyan bir sorun yok. Ekran
zaten istemci tarafında sayfalıyor.

**Karar: ertelendi.** Ölçülen fayda olmadan yeni API yüzeyi eklemek brief §15'e
aykırı olurdu. Yeniden değerlendirme eşiği: ~500 kayıt (≈450 kB).

## R-10 — Toplu durum işlemleri · **İncelendi ve ertelendi**

Brief §16'nın kriteri: geçişler merkezî ve güvenilir biçimde doğrulanabiliyor mu?

İnceleme sonucu: doğrulama **merkezî** — hem `PATCH /api/tasks/{id}` hem
`PATCH /api/self/tasks/{id}/status` aynı `WorkspaceService.updateTask`'e
iniyor. Ancak toplu uygulama **güvenilir değil**:

1. `updateTask` sprint satırını `FOR UPDATE` ile kilitler ve ilk kural ihlalinde
   `IllegalArgumentException` atar.
2. Self-servis yolu her görev için `expectedStatus` ister (iyimser kilitleme);
   toplu işlemde görev başına ayrı beklenen değer gerekir.
3. BAU işleri manuel durum değişimini tamamen reddeder → geçerli hedef durumlar
   göreve göre değişir.
4. İstek başına transaction olduğundan N ayrı çağrı **kısmi uygulama** üretir;
   §16 bunu sessizce yapmayı açıkça yasaklıyor.

Atomik davranış ancak **yeni bir backend endpoint'i** ile sağlanabilirdi. Bu bir
sunum ihtiyacı değil; brief §10 backend değişikliğini yalnız sunum
desteklenemediğinde serbest bırakıyor.

**Karar: ertelendi.** Gerekçe yukarıda kayıtlı.

## R-11 — CSS temizliği · Medium · **Tamamlandı (bu fazın dosyalarıyla sınırlı)**

Angular `anyComponentStyle` bütçesi (12 kB) **dosya başına** değerlendirilir.
Review stilleri bu sınırı aştı. Kullanılan dürüst yollar:

1. Yinelenen `@media print` blokları birleştirildi.
2. `audit-css.cjs` ile her sınıf seçicisi şablon + TS'e karşı denetlendi →
   **0 ölü seçici** kaldı; dosya gerçekten yalındı, sadece büyüktü.
3. Konuya göre **ikiye ayrıldı**: `sprint-review.component.css` (yerleşim) +
   `sprint-review-narrative.css` (anlatı + sunum modu), `styleUrls` ile bağlandı.

**Bütçe yükseltilmedi.** Uyarıyı gizlemek yerine dosya bölündü.

Ayrıca CSS'i olmayan ölü bir host binding (`[class.review-presenting]`,
terk edilmiş bir yaklaşımdan kalma) kaldırıldı.

## R-12 — Erişilebilirlik · High · **Tamamlandı**

- `review-operations.model.ts` dışa aktarılan tablosuna `scope="col"` ve
  `<caption class="sr-only">` eklendi. Uygulamadaki **tüm** `<th>` örnekleri
  tarandı; eksik olan tek yer burasıydı.
- `.sr-only` sınıfı `styles.css`'te global, ama standalone HTML'de yoktu —
  eklenmeseydi caption görünür şekilde basılırdı. `presentation-html.ts`
  gömülü CSS'ine eklendi.
- Sunum modunda odak hapsi yok, görünür odak var, Escape öngörülebilir.

---

## Doğrulama

| Kapsam | Sonuç |
|---|---|
| Node testleri | **81 / 81 geçti** (78 mevcut + 3 yeni) |
| Backend `mvn -B test` | **152 / 152 geçti** |
| Şema | **v44** (migration eklenmedi) |
| Initial bundle | **504.37 kB** (taban ile aynı) |
| `sprint-review-component` | 52.39 → **64.19 kB** (lazy) |
| Bütçe uyarısı | **yok** |
| Standalone HTML dış istek | **0** |
| A4 yatay taşma | **0** (1440 / 1024 / 420) |

### Test bütünlüğü notu

Yeni testlerin ikisi kaynağı regex'le taramak yerine **gerçek kodu çalıştırır**.
Bu sayede üç gerçek kusur testler tarafından bulundu:

- Model `%50` üretiyordu; kod tabanının tamamı `50%` kullanıyor. **Test değil,
  model düzeltildi.**
- `<details>` bölümleri sunumda açılmıyordu (R-03).
- Odak geri dönmüyordu (R-03).

Mevcut bir test (`test-export-report-structure.cjs`) tanımlar ortak modüle
taşındığı için kırıldı; niyeti gevşetilmeden kaynağı takip edecek şekilde
güncellendi.

`test-review-narrative.cjs` içinde bir kırılganlık da düzeltildi: `focusin`
araması, bir yorum satırındaki "focusing" kelimesine takılıyordu. Davranış
kontrolleri artık yorumlar temizlendikten sonra çalışıyor.
