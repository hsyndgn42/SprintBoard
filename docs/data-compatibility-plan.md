# SprintBoard — Veri Uyumluluk Planı (İterasyon 2)

**Tarih:** 2026-10-21
**Branch:** `feature/professional-platform-ui` (base: `master` @ `fd7b128`)
**İlgili review bulguları:** P-02 (overview alanları), P-03 (kapasite önbellekleme), P-04 (index migration)

Bu doküman, bu iterasyonda yapılacak **tüm** backend ve şema değişikliklerini, mevcut veriye etkisini
ve doğrulama yöntemini kayıt altına alır. Talimat gereği, herhangi bir backend/şema uygulamasına
başlanmadan önce hazırlanmıştır.

---

## 1. Önerilen değişikliklerin tamamı

| # | Değişiklik | Tür | Şema etkisi |
|---|---|---|---|
| D-1 | `WorkspaceService.overview()` yanıtına yeni alanlar | Salt-okunur, katkısal | **Yok** |
| D-2 | `WorkspaceService.calendarCapacity()` içinde istek-kapsamlı önbellek | Saf optimizasyon | **Yok** |
| D-3 | `V45__report_read_indexes.sql` — yalnız `CREATE INDEX IF NOT EXISTS` | Forward-only migration | **Yalnız index** |

Bunların dışında backend'e dokunulmayacaktır. Özellikle:

- Yeni tablo **yok**
- Yeni kolon **yok**
- Kolon tipi/adı değişikliği **yok**
- Veri yazan/silen/güncelleyen migration **yok**
- Mevcut migration dosyalarında değişiklik **yok**
- Yeni endpoint **yok** (mevcut `/api/overview` genişletiliyor)
- `SecurityConfig` değişikliği **yok**

---

## 2. D-1 — `overview()` yanıt genişletmesi

### 2.1 Etkilenen mevcut yapı

`WorkspaceService.overview()` (`WorkspaceService.java:133-187`) bugün 19 anahtarlı bir
`Map<String,Object>` döndürüyor. Frontend karşılığı `Overview` arayüzü
(`frontend/src/app/api.service.ts`).

**Mevcut 19 alan — hiçbiri silinmeyecek, yeniden adlandırılmayacak, anlamı değişmeyecek:**

```
totalSprints, completedSprints, activeSprints, plannedSprints,
deliveredTasks, undoneTasks, deliveryRate, activeSprint, recentSprints,
roadmapCount, backlogCount, backlogLinkedCount, backlogReadyCount,
backlogInSprintCount, activeMemberCount, activeSprintCapacityHours,
activeSprintPlannedHours, todayCapacityHours, monthCapacityHours
```

### 2.2 Eklenecek alanlar ve formülleri

Tüm yeni alanlar **aktif sprint bağlamında** hesaplanır ve aktif sprint yokken güvenli sıfır/boş
değer döner. Hiçbiri yeni iş kuralı tanımlamaz; hepsi mevcut hesaplardan türetilir.

| Alan | Tip | Formül | Aktif sprint yokken |
|---|---|---|---|
| `activeSprintDaysRemaining` | tam sayı / null | `end_date` − bugün (Europe/Istanbul), negatifse 0 | `null` |
| `activeSprintDaysTotal` | tam sayı / null | `end_date` − `start_date` + 1 | `null` |
| `activeSprintBlockedCount` | tam sayı | Aktif sprint görevlerinden `blocker.blocked = true` olanların sayısı (mevcut `SprintFlowService` verisi) | `0` |
| `activeSprintAddedDuringCount` | tam sayı | Aktif sprintte `addedDuringSprint = true` olan görev sayısı (mevcut kapsam olayı verisi) | `0` |
| `activeSprintUnestimatedCount` | tam sayı | Aktif sprintte `estimatedHours <= 0` olan **teslimat** görevi sayısı (BAU hariç, mevcut `DELIVERY_FILTER`/`BauPolicy` tanımıyla) | `0` |
| `activeSprintUnassignedCount` | tam sayı | Aktif sprintte hiç ataması olmayan teslimat görevi sayısı | `0` |
| `activeSprintTypeBreakdown` | liste | Aktif sprint teslimat görevlerinin `taskCategory` bazında `{category, taskCount, doneCount}` dağılımı | boş liste `[]` |

**Birim ve kapsam netliği:**

- `*Count` alanlarının tamamı **adet**tir, saat değildir.
- Tümü **yalnız aktif sprinti** kapsar; tarihsel toplam değildir.
- `activeSprintUnestimatedCount` ve `activeSprintUnassignedCount` **BAU hariç** teslimat işlerini
  sayar — bu, ekranda zaten kullanılan `deliveryTaskCount` ile aynı kapsam tanımıdır.
- Sıfıra bölme durumu oluşmaz; hiçbiri oran değildir. Oranlar istemcide, mevcut
  `deliveryTaskCount` paydası sıfır kontrolüyle hesaplanmaya devam eder.

### 2.3 Mevcut veriye etkisi

**Hiç.** Bu bir okuma yolu genişletmesidir. Hiçbir satır okunup yazılmaz. Veritabanına yazma yoktur.

### 2.4 Uyumluluk

| Tüketici | Etki |
|---|---|
| Angular `Overview` arayüzü | Yeni alanlar **opsiyonel** olarak eklenir; eski alanlar değişmez |
| `ScopeAndSprintViewsTest` | Mevcut iddialar aynen geçmeli |
| JSON export/import (`/api/export`, backup) | **Etkilenmez** — `overview()` yedeklemeye dahil değil |
| Eski tarayıcı önbelleği | Etkilenmez — ek alanları yok sayar |

---

## 3. D-2 — `calendarCapacity()` önbellekleme

### 3.1 Mevcut davranış

`WorkspaceService.calendarCapacity(from, to)` (`:189-215`), üye × gün döngüsü içinde
`schedules.at(date)` (`WorkScheduleService:27`) ve `memberCapacity.at(member, date, teamHours)`
(`MemberCapacityService:14`) çağırıyor. Bu iki çağrı **her yinelemede ayrı SQL** çalıştırıyor.

### 3.2 Değişiklik

Yalnız **tek bir istek içinde**, saf (yan etkisiz) bir `Map` önbelleği ile aynı anahtar için
tekrarlanan okumaları önlemek. Önbellek metot kapsamında yaşar, istek bitince kaybolur.
Uygulama durumu tutulmaz, paylaşılan/dağıtık önbellek eklenmez.

### 3.3 Doğruluk garantisi

- Önbelleklenen fonksiyonlar aynı girdi için aynı çıktıyı üretir (veritabanı aynı işlem içinde değişmez).
- **Sayısal sonuç birebir aynı kalmalıdır.** Bu, kapasite testleriyle doğrulanır:
  `MemberCapacityTest`, `WorkScheduleTest`, `ParticipationTest`, `HolidayCalendarTest`,
  `ScopeAndSprintViewsTest`, `MemberReportBuilderTest`, `LeaveLedgerTest`.
- Test beklenen değerleri **değiştirilmez**. Tek bir sayı bile değişirse değişiklik geri alınır.

### 3.4 Mevcut veriye etkisi

**Hiç.** Salt-okunur optimizasyon.

---

## 4. D-3 — `V45__report_read_indexes.sql`

### 4.1 İçerik

```sql
CREATE INDEX IF NOT EXISTS idx_assignment_task ON assignment(task_id);
CREATE INDEX IF NOT EXISTS idx_assignment_member ON assignment(member_id);
CREATE INDEX IF NOT EXISTS idx_leave_record_member_sprint ON leave_record(member_id, sprint_id);
```

### 4.2 Etkilenen mevcut tablolar

| Tablo | Oluşturan migration | Değişiklik |
|---|---|---|
| `assignment` | `V1__initial_schema.sql` | Yalnız index eklenir |
| `leave_record` | `V1__initial_schema.sql` (V29 ile genişletilmiş) | Yalnız index eklenir |

### 4.3 Mevcut veriye etkisi

**Hiç.** `CREATE INDEX` satır içeriğini değiştirmez, satır silmez, kolon eklemez, tabloyu yeniden
kurmaz, id yeniden numaralandırmaz. H2'de `IF NOT EXISTS` sayesinde tekrar çalıştırılabilir.

### 4.4 Neden bu indexler

| Index | Destekleyen sorgu |
|---|---|
| `idx_assignment_task` | `WorkspaceService.sprint(id)` içindeki görev başına atama sorgusu (`:116-119`) — N+1 döngüsünün sıcak noktası |
| `idx_assignment_member` | Üye bazlı rapor ve kapasite toplamaları (`memberReports()`, `capacity()`) |
| `idx_leave_record_member_sprint` | `capacity(sprintId)` ve `calendarCapacity()` içindeki izin filtreleri; `leaves()` üye/sprint kesişimi |

Her index, review'da (P-03, P-04) kanıtlanmış gerçek bir sorgu yoluyla gerekçelendirilmiştir.
Spekülatif index eklenmemiştir.

### 4.5 Forward-only garantisi

- Dosya adı `V45__report_read_indexes.sql` — mevcut konvansiyona (`V<n>__<snake_case>.sql`) uyar.
- V45, mevcut en yüksek sürüm olan V44'ten sonradır.
- Mevcut hiçbir migration dosyası okunmaz, değiştirilmez veya yeniden adlandırılmaz.
- Flyway geçmişi temizlenmez.
- Geri alma (rollback) migration'ı yazılmaz; kurtarma yolu §6'da tanımlıdır.

### 4.6 `schemaVersion` ile ilişki

`ApiController.java:42` `/api/health` içinde `schemaVersion` değerini **44** olarak sabit döndürüyor.
Bu değer bir Flyway okuması değil, elle bakımlı bir sabittir.

**Karar:** Bu sabit **45'e güncellenecektir**, çünkü şema sürümü gerçekten ilerliyor.
`BackupService.java:405` içindeki `backupSchemaVersion = 40` değeri **değiştirilmeyecektir** —
yedekleme formatı değişmiyor ve bu iki sürüm birbirinden bağımsızdır.

Bu değişikliğin etkisi `/api/health` yanıtının `schemaVersion` alanıdır. Bu alanı tüketen bir
frontend davranışı bulunmamaktadır (yalnız bilgi amaçlı). Yedekleme uyumluluğu
`backupSchemaVersion` üzerinden yürüdüğü için **eski yedekler okunmaya devam eder**.

---

## 5. Doğrulama sorguları

Migration testleri, migration öncesi ve sonrası aşağıdakileri karşılaştıracaktır.
Karşılaştırmalar **izole, geçici H2 veritabanlarında** yapılır; canlı veritabanı kullanılmaz.

### 5.1 Tablo listesi

```sql
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = 'PUBLIC' ORDER BY TABLE_NAME;
```
**Beklenti:** migration öncesi ve sonrası küme **birebir aynı** (yeni tablo eklenmiyor).

### 5.2 Satır sayıları

```sql
SELECT COUNT(*) FROM app_user;        -- kullanıcı sayısı
SELECT COUNT(*) FROM member;          -- üye sayısı
SELECT COUNT(*) FROM sprint;          -- sprint sayısı
SELECT COUNT(*) FROM backlog_item;    -- backlog sayısı
SELECT COUNT(*) FROM sprint_task;     -- görev sayısı
SELECT COUNT(*) FROM assignment;      -- atama sayısı
SELECT COUNT(*) FROM leave_record;    -- izin sayısı
SELECT COUNT(*) FROM overtime_entry;  -- mesai sayısı
SELECT COUNT(*) FROM product_setting; -- ayar sayısı
SELECT COUNT(*) FROM audit_event;     -- denetim kaydı sayısı
SELECT COUNT(*) FROM roadmap_item;    -- roadmap sayısı
SELECT COUNT(*) FROM member_photo;    -- fotoğraf sayısı
SELECT COUNT(*) FROM slack_config;    -- slack yapılandırması
```
**Beklenti:** her sayı migration öncesi ve sonrası **aynı**.

### 5.3 İlişki bütünlüğü

```sql
-- Sahipsiz atama kalmamalı
SELECT COUNT(*) FROM assignment a
  LEFT JOIN sprint_task t ON t.id = a.task_id WHERE t.id IS NULL;
-- Sahipsiz görev kalmamalı
SELECT COUNT(*) FROM sprint_task t
  LEFT JOIN sprint s ON s.id = t.sprint_id WHERE s.id IS NULL;
```
**Beklenti:** ikisi de `0`, migration öncesi ve sonrası.

### 5.4 Index varlığı

```sql
SELECT INDEX_NAME FROM INFORMATION_SCHEMA.INDEXES
WHERE TABLE_NAME IN ('ASSIGNMENT','LEAVE_RECORD') ORDER BY INDEX_NAME;
```
**Beklenti:** migration sonrası üç yeni index mevcut.

### 5.5 Flyway geçmişi

```sql
SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank;
```
**Beklenti:** V1…V44 kayıtları **değişmemiş**; sonuna V45 başarıyla eklenmiş.

---

## 6. Yedekleme gerekliliği ve kurtarma

### 6.1 Yedekleme gerekliliği

Bu iterasyonda üretilen kod canlı veritabanına **uygulanmayacaktır**. Canlı uygulama çalışmaya devam
eder ve repo'daki JAR değiştirilmez. Migration yalnız izole test veritabanlarında çalışır.

Birleştirme sonrası manuel dağıtım yapılırken, **V45 ilk kez canlı veritabanına uygulanmadan önce**
SprintBoard yedekleme ekranından tam yedek alınması **zorunludur**. Bu, dağıtım adımlarında
ilk sıradadır.

### 6.2 Kurtarma stratejisi

| Senaryo | Kurtarma |
|---|---|
| V45 uygulanırken hata | H2 DDL'i işlemseldir; başarısız `CREATE INDEX` yarım şema bırakmaz. Flyway `success = false` kaydeder ve uygulama açılmaz. Yedekten geri dön, sorunu düzelt, yeniden dene. |
| V45 uygulandı, geri alınmak isteniyor | `DROP INDEX idx_assignment_task; DROP INDEX idx_assignment_member; DROP INDEX idx_leave_record_member_sprint;` ardından `flyway_schema_history` içinden V45 satırını silmek gerekir. **Önerilen yol bu değildir** — index'ler zararsızdır ve bırakılabilir. |
| Yeni JAR ile sorun | Eski JAR yedeğiyle geri dönülür. V45 eski JAR ile de uyumludur (index'ler eski kodu etkilemez), dolayısıyla **ileri uyumluluk sorunu yoktur**. |
| Veri kaybı şüphesi | SprintBoard yedekleme/geri yükleme akışı kullanılır. `backupSchemaVersion` 40 olarak kaldığından eski yedekler geçerliliğini korur. |

### 6.3 Kritik: elle düzenleme yasağı

`service/data/sprintboard.mv.db` dosyası **hiçbir koşulda** elle düzenlenmez, kopyalanmaz,
taşınmaz veya başka bir dosyayla değiştirilmez. Tüm şema değişiklikleri yalnız Flyway üzerinden
uygulanır.

---

## 7. Test planı

| Test | Kapsam | Ortam |
|---|---|---|
| Mevcut 146 Java testi | Regresyon — hesaplamalar, güvenlik, yedekleme, Slack | `mvn test`, bellek-içi H2 |
| Yeni `overview()` alan testi | Yeni alanların formülü; mevcut 19 alanın korunduğu | Bellek-içi H2 |
| Boş kurulum testi | Aktif sprint yokken yeni alanlar güvenli değer döner | `EmptyInstallationTest` deseni |
| Yeni migration testi | V45 öncesi/sonrası tablo listesi, satır sayıları, ilişki sayıları | Bellek-içi H2, V44 şemasından ileri |
| Yedek uyumluluk | `BackupServiceTest`, `BackupFixtureV40` — eski yedek formatı okunabilir | Mevcut testler |

Canlı veritabanı **hiçbir testte kullanılmaz**.

---

## 8. Özet

Bu iterasyonun veri ayak izi kasıtlı olarak minimumdur:

- **Yazma yok.** Hiçbir migration veri yazmaz, güncellemez veya silmez.
- **Şema genişlemesi yok.** Yalnız üç index eklenir.
- **Sözleşme kırılması yok.** `overview()` yalnız genişler.
- **Geri dönüş kolay.** Index'ler bırakılabilir veya düşürülebilir; eski JAR yeni şemayla çalışır.
