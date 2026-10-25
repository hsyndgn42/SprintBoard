# SprintBoard — Jira Entegrasyonu Tasarımı

**Tarih:** 2026-10-25
**Base:** `master` @ `9be1a2d`
**Durum:** Kararlar alındı (§7), uygulamaya başlanmadı.

Buradaki Jira bilgileri tahmin değildir; `itjira.vodafone.local` üzerinde canlı ölçülmüş, gerçek
bir kayıt açılarak ve gerçek sorgular çalıştırılarak doğrulanmıştır.

---

## 1. Amaç

Bugün aynı iş iki yere elle giriliyor. Üç ayrı tekrar var ve üçü de farklı yönde:

| Bugünkü zahmet | Yön |
|---|---|
| Backlog'a eklenen işi Jira'da PBI olarak açmak | SprintBoard → Jira |
| Jira'da açılan defect'i SprintBoard'a kopyalamak (`TDEF-66195 ...` başlığa yazılarak) | Jira → SprintBoard |
| Her sprint 4 BAU PBI'ını elle açmak | SprintBoard → Jira |

Entegrasyon bu üç tekrarı ortadan kaldırır.

### 1.1 Kapsam

| # | Akış | Yön |
|---|---|---|
| **A** | Backlog işi açılınca Jira'da PBI açılması | → |
| **B** | TDEF defect'lerinin gelen kutusuna düşmesi | ← |
| **C** | Sprint açılınca BAU PBI'larının üretilmesi | → |
| D | Roadmap hedefi için Jira'da Epic açılması (A ve C'nin önkoşulu) | → |

### 1.2 Kapsam dışı

- Jira'dan statü/yorum/atama **okuma**
- Jira sprint'i açma-kapatma, işleri sprinte taşıma → *bilinçli ertelendi, §9*
- Sub-task (`Sub-Analyze`, `Sub-Development`…) oluşturma
- Jira'da yapılan değişikliğin SprintBoard'a yansıması
- Webhook — makinenin dışarıdan erişilebilir adresi yok, Jira admin yetkisi gerekir

**Statü hiçbir yöne taşınmıyor.** Jira'da kartı ekip sürüklüyor, SprintBoard'da sen yönetiyorsun.
Bu sayede workflow transition API'sine hiç dokunmuyoruz — Jira entegrasyonlarının en kırılgan yeri
(geçiş ekranları, validator'lar, yetkisiz kullanıcıya boş liste dönen uçlar) tamamen devre dışı.

---

## 2. Sahiplik

Kural: *bir alanın tek sahibi vardır.*

| Alan | Sahip | Yön |
|---|---|---|
| Feature/BAU işinin varlığı, başlık, açıklama, tahmin | SprintBoard | → Jira |
| Roadmap ↔ Epic bağı | SprintBoard | → Jira |
| **Defect'in varlığı, başlığı, açıklaması** | **Jira (TDEF)** | ← SprintBoard |
| Defect'in roadmap'i, size'ı, sprint ataması | SprintBoard | yerel |
| Statü | her sistem kendi içinde | taşınmaz |
| Kapasite, izin, mesai, review | SprintBoard | yerel |

Defect'in iki sahibi olması çelişki değil: **Jira neyin bozuk olduğunu**, SprintBoard **onu ne zaman
kimin yapacağını** sahipleniyor.

---

## 3. Doğrulanmış Jira gerçekleri

| Konu | Değer |
|---|---|
| Sürüm | Jira **10.3.26**, `deploymentType: Server` |
| API | `/rest/api/2` + `/rest/agile/1.0`. `/rest/api/3` ve ADF **yok** → wiki markup |
| Projeler | `VBCRF` (VibeCraft) · `TDEF` (Test Defect) |
| Board | `19233`, scrum |
| **Hız sınırı** | `X-RateLimit-Limit: 1`, `Interval-Seconds: 1` → **saniyede 1 istek** |
| Worklog | `timetracking: {}` — Jira'da harcanan süre tutulmuyor |

### 3.1 PBI (`11500`) zorunlu alanları

| fieldId | Ad | Format |
|---|---|---|
| `project` / `issuetype` | — | `{"key":"VBCRF"}` / `{"id":"11500"}` |
| `summary` / `description` | Başlık / Açıklama | düz metin |
| `priority` | Öncelik | `{"id":"4"}` |
| `customfield_10663` | Story Points | sayı |
| `customfield_17670` | PBI Type | `{"id":"30023"}` |
| `customfield_27228` | Business Value | `{"id":"30013"}` |
| `customfield_32981` | KPI | `[{"key":"RRCA-11438"}]` |
| `customfield_37172` | Checklist Issue | `{"id":"39621"}` |
| `customfield_12873` | **Epic Link** | `"VBCRF-4"` |

Epic (`238`) için yalnızca: `project`, `issuetype`, `summary`, `description`, `priority`,
`customfield_12874` (**Epic Name**).

### 3.2 Sadece deneyerek öğrenilen beş tuzak

Hiçbiri dokümantasyonda veya `createmeta` çıktısında görünmüyor.

1. **Epic Link zorunlu.** `createmeta` `required: false` diyor, ama kayıt açmayı denediğimizde Jira
   `"please add parent of Epic"` ile reddetti. Bir workflow kuralı dayatıyor.
2. **KPI'ın okuma ve yazma formatı farklı.** Okurken `["N/A (RRCA-11438)"]` metni, yazarken
   `[{"key":"RRCA-11438"}]` nesnesi. Okuduğunu geri yazan kod çalışmaz.
3. **Sprint alanı hâlâ eski string formatında.** Atlassian 2020'de kaldıracağını duyurmasına
   rağmen Jira 10.3 `"com.atlassian.greenhopper...Sprint@27a25f68[...,id=47131,...]"` döndürüyor.
4. **`Squad` alanı JQL'de kullanılamıyor.** Insight/Assets alanı; `=` "option does not exist" der,
   `~` ise "operator is not supported". Yerine `component` kullanılmalı (§5.1).
5. **TDEF `createmeta` boş döner** — o projede kayıt açma yetkisi yok. Alan keşfi için
   `/rest/api/2/field` (1769 alan) ve gerçek bir kayıt okunmalı.

Doğrulama kaydı: **VBCRF-776** (silinebilir).

---

## 4. Akış A — Backlog işi → PBI

### 4.1 Alan eşlemesi

| SprintBoard | → | Jira |
|---|---|---|
| `title` | → | `summary` |
| `criteria` | → | `description` (boşsa §7.5) |
| roadmap'in epic key'i | → | `customfield_12873` |
| `size_code` | → | `customfield_10663` (§7.1) |
| `taskCategory` | → | `customfield_17670` |
| roadmap `priority` | → | `customfield_27228` (§7.2) |
| — | → | `customfield_32981` = sabit `N/A` |
| — | → | `customfield_37172` = `No` |

### 4.2 `taskCategory` → PBI Type

| SprintBoard | Jira | id |
|---|---|---|
| `DEV`, `DESIGN`, `ANALYZE`, `TEST`, `OTHER` | Feature | `30023` |
| `BAU` | Run The Business | `30024` |
| `DEFECT` | **gönderilmez** | — (§5) |

> Eşleme **id** üzerinden yapılır. Jira'nın döndürdüğü metinlerde literal `<b>` HTML'i var
> (`"Defect (<b>Feature</b>)"`); metne göre eşleştiren kod kırılır.

### 4.3 Öncelik

`UNSET`/`LOW` → `4` · `NORMAL` → `3` · `HIGH` → `10000` · `CRITICAL` → `2`

### 4.4 Roadmap zorunlu hale gelir

Epic Link zorunlu olduğundan roadmap'siz iş gönderilemez. Bu yüzden backlog formunda roadmap
seçimi zorunlu olur; Slack'ten gelen istek ekranında da aynı kural uygulanır, yoksa arka kapıdan
roadmap'siz kayıt girmeye devam eder.

**Mevcut veri buna hazır.** Ölçüm sonucu:

| Toplam backlog | Roadmap'li | Eksik |
|---|---|---|
| 468 | 467 | **1** |

Tek eksik kayıt `TDEF-66195 Product_Price_Tax null gelmesi` (Sprint 16, Done). Elle bağlanır,
veri taşıma (migration) gerekmez.

---

## 5. Akış B — TDEF defect'leri → gelen kutusu

Bugün defect Jira'da açılıyor, sen başlığına `TDEF-66195` yazarak SprintBoard'a kopyalıyorsun.
Bu akış onu otomatikleştirir.

### 5.1 Hangi defect'ler

`Squad` alanı JQL'de kullanılamadığı için (§3.2) filtre `component` üzerinden kurulur.
Doğrulanmış sorgu **60 kayıt** döndürüyor:

```
project = TDEF AND component = "Vibe-Fix" ORDER BY created DESC
```

**JQL ayardan düzenlenebilir olacak.** Production defect'ler ayrı bir component'te açılabiliyor ve
takım yapısı değişebiliyor; bunlar kod değişikliği gerektirmemeli. `in` ve `OR` desteklendiği için
tek alan yeterli:

```
project = TDEF AND component in ("Vibe-Fix","Vibe-Prod") AND status not in (Closed, Done)
```

Yanında **"Test et"** düğmesi bulunur: kaydetmeden önce kaç kayıt döndüğünü ve ilk başlıkları
gösterir. Yazım hatası yapıldığında kuyruk sessizce boş kalmaz.

### 5.2 Gelen kutusu

Çekilen defect **doğrudan backlog'a düşmez.** Mevcut Slack istek ekranının ikizi olan bir gelen
kutusuna düşer; sen roadmap ve size verip backlog'a alırsın.

Gerekçe: roadmap zorunlu (§4.4) ve size SprintBoard'a özgü bir veri — Jira bunları bilemez.
Onay adımı olmadan ya eksik kayıt oluşur ya da uydurma varsayılanlar girilir.

| Jira | → | SprintBoard |
|---|---|---|
| `key` (`TDEF-66195`) | → | `backlog_item.external_id` |
| `summary` | → | `title` |
| `description` | → | `criteria` |
| `TC Task ID` (`customfield_10356`) | → | roadmap önerisi (§5.3) |
| `Case found in` (`customfield_10943`) | → | gelen kutusunda gösterilir (test/prod ayrımı) |
| — | → | `taskCategory` = `DEFECT` |

### 5.3 Roadmap otomatik önerilir

Jira'daki `TC Task ID` alanı ile SprintBoard roadmap'indeki **Referans ID** aynı değeri taşıyor —
ölçülen 60 defect'in tamamında `TC-25142`, ve SprintBoard'daki referans alanının örneği de
`TC-25142`. Eşleşme bulunursa roadmap hazır seçili gelir, sen yalnızca onaylarsın.

Eşleşme bulunamazsa alan boş bırakılır; uydurma yapılmaz.

### 5.4 Çift kayıt

`external_id` (Jira key) üzerinde **UNIQUE** kısıt bulunur. Aynı defect ikinci kez çekilemez,
elle açtığın eski kayıtlarla çakışırsa gelen kutusunda uyarı gösterilir.

### 5.5 Sorgulama sıklığı

Webhook kurulamadığı için periyodik sorgulama yapılır. Dakikada bir sorgu, hız sınırının (saniyede
1) çok altındadır. `updated > son_kontrol` ile yalnızca değişenler çekilir.

---

## 6. Akış C — Sprint BAU PBI'ları

Bugün her sprint elle açılan kayıtlar:

```
BAU - Team Meeting - Sprint 16     SP 8
BAU - Team Support - Sprint 16     SP 8
BAU - Training - Sprint 16         SP 8
BAU - On Leave - Sprint 16         SP 1
```

SprintBoard'un BAU şablonları (`bau_template`) bunlarla birebir aynı: `Team Meeting`,
`Team Support`, `Training`, `On Leave`.

### 6.1 Başlık dönüşümü

İki taraf farklı biçim kullanıyor, dönüşüm gerekir:

```
SprintBoard : "Sprint 16 · Team Meeting"
Jira        : "BAU - Team Meeting - Sprint 16"
```

> Jira'daki eski kayıtlarda tutarsızlık var (`BAU - On Leave Sprint 14` — tire eksik). Yeni kayıtlar
> tek biçimde üretilecek.

### 6.2 Story Point

**Her şablon için ayarlardan sabit değer verilir.** Başlangıç: Meeting 8, Support 8, Training 8,
On Leave 1.

Saatten türetilmiyor. SprintBoard yalnızca `estimated_hours` hesaplıyor (`WorkspaceService.java:1122`);
`story_points` `null`, `size_code` sabit `SMALL`. Üstelik `On Leave` ve `Training` şablonları
0 saat üretiyor (izin kapasiteden düşülür, training elle atanır), yani türetilecek bir saat zaten yok.

> ⚠️ Sabit değer, ekip büyüdüğünde gerçeği yansıtmaz. Jira'daki geçmiş kayıtlarda Sprint 15 = 6,
> Sprint 16 = 8 yazıyor; bu kişi sayısındaki değişimden geliyor. Sabit SP seçildiği için bu fark
> ayar güncellenmedikçe oluşmayacak. Bilinçli bir sadeleştirmedir.

### 6.3 Tetikleme

Sprint oluşturulup BAU işleri üretildiğinde kuyruğa düşer. Epic, BAU roadmap'inden gelir
(`bau_roadmap_id` ayarı zaten var — `WorkspaceService.java:1076`).

Alt görevler (`Sub-Analyze` vb.) **üretilmez**; elle yönetilmeye devam eder.

---

## 7. Alınan kararlar

| # | Konu | Karar |
|---|---|---|
| 7.1 | Size → Story Point | `SMALL 1` · `MEDIUM 3` · `LARGE 5` · `X-LARGE 8` — ayarlanabilir |
| 7.2 | Business Value | Roadmap önceliğinden: `Kritik 9` · `Yüksek 7` · `Normal 5` · `Düşük 3` · belirtilmemiş `5` |
| 7.3 | Defect projesi | Jira'ya **gönderilmez**; TDEF'ten **çekilir** (§5) |
| 7.4 | BAU | Gönderilir, sabit SP ile (§6) |
| 7.5 | Boş `criteria` | `"SprintBoard'da açıldı; kabul kriteri girilmedi."` |

`7.2` için not: belirtilmemiş öncelikte `0` yerine `5` kullanılır — `0`, Jira raporlarında
"değersiz iş" anlamına gelir, oysa kastedilen "belirtilmedi".

---

## 8. Teknik tasarım

### 8.1 Şema — `V45__jira_integration.sql`

```
jira_config        baseUrl, projectKey, boardId, şifreli PAT, defect JQL,
                   BAU şablon SP değerleri, varsayılan alan değerleri, version

jira_issue_link    local_kind ('backlog'|'roadmap')
                   local_id
                   jira_issue_id   BIGINT    ← kalıcı kimlik
                   jira_issue_key  VARCHAR   ← gösterim için önbellek
                   state, attempts, last_error, next_attempt

jira_defect_inbox  jira_key UNIQUE, summary, description, tc_task_id,
                   case_found_in, status, fetched_at, state
```

**`key` değil `id` saklanır.** Issue başka projeye taşınırsa `key` değişir, `id` değişmez.

`roadmap_item` tablosuna `jira_epic_key` eklenir. Mevcut `reference_id` alanı **kullanılmaz** —
orada `TC-25142` gibi başka bir referans duruyor, üzerine yazmak veri kaybı olur.

`ApiController.java:42` → `schemaVersion` 44 → 45.

### 8.2 Bileşenler

Slack entegrasyonu bu problemleri zaten çözmüş; aynı desen izlenir.

| Sınıf | Karşılığı | Görev |
|---|---|---|
| `JiraTransport` | `SlackTransport` | Tek çıkış kapısı, timeout, boyut sınırı, hata → Türkçe mesaj |
| `JiraSecretVault` | `SlackSecretVault` | PAT'i AES-GCM ile şifreler, anahtar DB dışında |
| `JiraOutboxService` | `SlackReceiptService` | A ve C akışları: kuyruk + worker + backoff |
| `JiraDefectPoller` | — | B akışı: periyodik JQL, gelen kutusuna yazar |
| `JiraFieldMapper` | — | §4, §6 eşlemeleri tek yerde |
| `JiraConfigStore` | `SlackConfigStore` | Ayar CRUD, `version` ile iyimser kilit |

**Gönderim kaydın içine gömülmez.** Kayıt yerel açılır, gönderim kuyruğa düşer. Jira erişilemezse
backlog işi açılmaya devam eder — Jira'nın ayakta olmaması SprintBoard'u durduramaz.

### 8.3 Hız sınırı

Saniyede 1 istek ciddi bir kısıt:

- Worker **tek thread**, istekler arası en az 1 sn. Paralellik imkânsız.
- Her yanıtta `X-RateLimit-Remaining` okunur; 0 ise beklenir.
- `429` → `Retry-After` kadar beklenir.
- 50 işin yazılması ~1 dakika sürer. Bu yüzden arayüz "gönderildi" değil **"gönderiliyor"** der.

### 8.4 Hata davranışı

| Durum | Davranış |
|---|---|
| `400` | Kalıcı. Tekrar denenmez, hata satırda gösterilir |
| `401`/`403` | PAT geçersiz. Kuyruk durur, ayar ekranında uyarı |
| `404` | **Yerel kayıt silinmez.** Jira yetkisizlikte de 404 döner |
| `429`/`5xx` | Geçici. Artan aralıklarla yeniden denenir |

### 8.5 TLS engeli — çözüldü

JDK 21 varsayılan `cacerts` ile Jira sertifikasını doğrulayamıyordu:

```
javax.net.ssl.SSLHandshakeException: PKIX path building failed
```

`curl` çalışıyor çünkü Windows sertifika deposunu kullanıyor, JDK kendi `cacerts`'ine bakıyor.

**Denendi, işe yaramadı:** `~/.certs/corporate-root-ca.pem` dosyasından truststore kurmak.
O dosyada Forcepoint/Websense TLS inspection sertifikaları var; Jira'nın sunduğu zincirle
eşleşmiyor, handshake yine başarısız oluyor.

**Çözüm:** `Windows-ROOT` ve `Windows-MY` keystore'larındaki sertifikalarla bellekte bir
truststore kurulur ve **yalnızca** `JiraTransport`'un `HttpClient`'ına verilir.
Canlı doğrulandı: `/rest/api/2/myself` → `200`, 64 sertifika yüklendi.

**JVM geneli `-Djavax.net.ssl.trustStore` kullanılmaz.** `SlackTransport` `slack.com`'a
çıkıyor; JVM genelinde truststore değiştirmek public CA'ları kaybettirip Slack entegrasyonunu
kırar. `SSLContext` Jira'ya özel kalır, Slack varsayılan truststore'da devam eder.

Windows dışı bir ortamda keystore açılamazsa sessizce varsayılan `SSLContext`'e düşülür —
orada zaten sistem truststore'u geçerlidir.

### 8.6 Güvenlik

- PAT şifreli saklanır, **arayüze geri dönmez** — yalnızca `patConfigured: true/false`.
- `JiraTransport` sadece yapılandırılmış `baseUrl` altına istek atar.
- JQL kullanıcı tarafından yazılır ama kendi PAT'iyle çalışır; göremediği kaydı getiremez.
- Loglar ve hata mesajları token içermez.
- Tüm işlemler `audit_event`'e yazılır.

---

## 9. Bilinçli ertelenen: sprint yaşam döngüsü

İlk konuşmada "sprinti Jira'da kapatmak, yenisini açmak, işleri dahil etmek" vardı. Bu sürümde yok.

Dürüst değerlendirme: bu entegrasyon Jira'da **kayıt açma** zahmetini alıyor, açılan kayıtları
**sprinte dağıtma** zahmetini bırakıyor. İkincisi daha büyük olabilir.

Teknik olarak ucuz — tek uç, en fazla 50 issue, statü değiştirmediği için workflow riski yok:

```
POST /rest/agile/1.0/sprint/{id}/issue
```

Asıl iş, SprintBoard sprint'i ile Jira sprint'ini eşleştirmek. Ön bulgu olumlu: SprintBoard
"Sprint 16" ile Jira "VIBE Sprint 16" (id `47131`) aynı dönemi gösteriyor.

Önce A/B/C çalışır görülecek, sonra karar verilecek.

---

## 10. Test

- `JiraTransport` sahte ile değiştirilir; testler gerçek Jira'ya **çıkmaz**.
- Eşleme testleri: her `taskCategory`, her Size, her BAU şablonu.
- Hata senaryoları: `400` kalıcı mı, `429` yeniden deneniyor mu, `404` yerel kaydı siliyor mu
  (silmemeli).
- Çift kayıt: aynı iş iki kez kuyruğa girerse tek PBI; aynı defect iki kez çekilirse tek satır.
- Kurtarma: gönderim sırasında uygulama kapanırsa kayıt `UNCERTAIN`'a düşmeli.
- Mevcut desen: `@SpringBootTest` + sınıfa özel in-memory H2 + worker'lar property ile kapalı.

---

## 11. Riskler

| Risk | Etki | Önlem |
|---|---|---|
| 1 istek/sn | Toplu gönderim yavaş | Kuyruk + "gönderiliyor" durumu |
| Jira'da yeni zorunlu alan | Gönderimler `400` | Hata satırda görünür, kuyruk tıkanmaz |
| JQL hatalı yazılır | Defect gelmez | "Test et" düğmesi (§5.1) |
| PAT süresi dolar | Akışlar durur | `401`'de ayar ekranında uyarı |
| Epic Jira'da silinir | PBI açılamaz | `400` kalıcı hata, roadmap'te uyarı |
| Sabit BAU SP | Gerçek eforu yansıtmaz | Bilinçli (§6.2), ayardan güncellenir |

**Geri alma:** Entegrasyon ayardan kapatılır; SprintBoard tüm işlevini korur. `V45` tabloları boş
kalır, kaldırılması gerekmez.

---

## 12. Uygulama sırası

1. ~~**TLS truststore** (§8.5)~~ — **tamamlandı**, `Windows-ROOT` ile doğrulandı
2. ~~`V45` + `JiraConfigStore` + ayar ekranı (PAT, JQL, varsayılanlar)~~ — **tamamlandı**
3. ~~`JiraTransport` + `JiraFieldMapper` + testler~~ — **tamamlandı** (`JiraFieldDefaults` adıyla)
4. ~~**D** — Roadmap → Epic düğmesi~~ — **tamamlandı**; yeni epic açma ve var olan epic'i bağlama/çözme
5. **A** — Backlog → PBI kuyruğu + roadmap zorunluluğu
6. **B** — Defect gelen kutusu
7. **C** — Sprint BAU PBI'ları

### D akışında çıkan ek zorunlu alanlar

`createmeta` epic için yalnızca `project`, `issuetype`, `summary`, `description`, `priority`,
`customfield_12874` döndürüyor. Gerçekte proje davranışları iki alan daha dayatıyor:

| Alan | Anlam | Değer |
|---|---|---|
| `customfield_30186` | KVKK Impact | `{"id":"33344"}` (No) |
| `customfield_10356` | TC Task | Portfolio epic'e çözümlenen gerçek bir TC kaydı |

TC Task uydurulamıyor; Jira değeri var olan bir kayda çözümlüyor. Bu yüzden roadmap'in
`referenceId` alanı kullanılıyor ve boşsa istek Jira'ya hiç gönderilmiyor. KVKK gibi sabit
alanlar `epicExtraFields` altından ayarlanabilir; yeni bir gizli zorunlu alan çıkarsa sürüm
beklemeden eklenebilir.
