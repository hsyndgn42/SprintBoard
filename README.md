# SprintBoard

Spring Boot ve Angular tabanlı sprint yönetimi uygulaması. Tek servis instance’ı, embedded H2 veritabanı ve birden fazla kullanıcı hesabıyla çalışır. Varsayılan adres: `http://127.0.0.1:4181/`.

- [Kullanıcı kılavuzu ve ilk kurulum ayarları](docs/USER_GUIDE.html) · [Markdown kaynağı](docs/USER_GUIDE.md)
- [Ürün backlogu](BACKLOG.md)
- [Admin hesap kurtarma](docs/account-recovery.md)

## Çalışan sistemi açma

Java 21 gerekir. Proje kökündeki `start-sprintboard.cmd` dosyasını çalıştırın. Servis zaten açıksa yalnız tarayıcı açılır. Başlatıcı mevcut DB dosyasını kontrol eder; dosya yoksa yanlışlıkla boş veya eski verilerle başlatmaz.

Canlı veri: `service/data/sprintboard.mv.db`. Slack anahtarı: `service/data/slack-token.key`. Bu dosyaları silmeyin, Git’e göndermeyin ve açık veritabanını işletim sistemi kopyasıyla yedeklemeyin. Aynı DB’yi kullanan ikinci bir servis başlatmayın.

## Boş ilk kurulum

GitHub `master` kaynakları **boş kurulum** içindir. Gerçek ekip kayıtları, fotoğraflar, hesaplar ve Slack tokenları içermez. Kaynakları indirip aşağıdaki derleme adımlarından sonra Windows’ta `first-install.cmd` çalıştırın; yeni boş veritabanını oluşturmak için `EVET` yazın. Tarayıcıda kendi admin hesabınızı oluşturun. Sonraki açılışlarda `start-sprintboard.cmd` kullanın.

İlk kurulumda yalnız iş türleri ve BAU şablonları gibi ürün varsayılanları vardır; iş, sprint veya üye eklenmez. Ayarlar’dan ekip adını, çalışma düzenini, tahmin yöntemini ve gerekiyorsa Slack bağlantısını yapılandırın. Hazır admin parolası yoktur. Linux/macOS için derlemeden sonra `java -jar target/sprintboard-service-0.1.0.jar` kullanılabilir; çalışma dizinini ve kalıcı DB yolunu sabit tutun.

## Mevcut verilerle hazır paket

Özel Windows x64 paketi uygulamayı, Java runtime’ını ve doğrulanmış yedekten alınmış veritabanı ile eşleşen Slack anahtarını içerir. ZIP’i tamamen çıkarıp `start-sprintboard.cmd` çalıştırın; mevcut hesabınızla giriş yapın. Kaynak derlemek, Node veya Maven kurmak gerekmez.

**Özel paket GitHub’a yüklenmez.** Fotoğrafları ve hesapları da içeren anlık bir veri kopyasıdır; ZIP şifreli değildir. Eski servisi durdurmadan hazır kopyayı çalıştırmayın: iki servis aynı Slack uygulamasından veri alabilir veya tekrarlı bildirim gönderebilir. Kopyalar otomatik eşitlenmez.

Paket üretmek için doğrulanmış tam yedeği ve Windows Java 21 JDK dizinini verin:

```powershell
.\scripts\build-private-distribution.ps1 -BackupZip "C:\secure\sprintboard-full-example.zip" -JdkPath "C:\Java\jdk-21"
```

Çıktı Git dışında tutulan `releases/` klasöründedir. Betik canlı DB’yi kopyalamaz; tam yedeği açar ve özel seed içeren JAR’ları reddeder. Java lisans bildirimleri runtime ile korunur.

## Kaynaktan derleme

Gereksinimler: Java 21, Node.js 20.19 veya üzeri, Maven 3.9 veya üzeri. Komutları bu klasörde çalıştırın:

```powershell
mvn package
```

Maven `npm ci`, Angular production build ve Java testlerini çalıştırır. Çıktı: `target/sprintboard-service-0.1.0.jar`. Yerel Maven gerekiyorsa `tools/apache-maven-3.9.16/bin/mvn.cmd` kullanılabilir; araç ve `.m2` önbelleği Git’e dahil edilmez.

Varsayılan testler özel veri gerektirmez ve boş kurulum testini kapsar. Eski veri setine bağlı regresyonlar `historical` etiketiyle ayrılmıştır. Yalnız yerel özel seed mevcutsa `mvn test -Phistorical-tests` bunları da çalıştırır. Seed yalnız test classpath’ine alınır, dağıtılan JAR’a hiçbir profilde eklenmez. Eski veri bekleyen UI regresyonları da ayrı, özel test DB’si gerektirir.

Windows’ta çalışan JAR paketlemeyi kilitleyebilir. Güncellemede önce yedek alın, servisi kontrollü durdurun, paketi oluşturun ve **aynı DB yolu** ile yeniden açın. Başlatıcı DB varlığını zorunlu tutar. Güncelleme için DB dosyasını, seed’i veya geçmiş migration dosyalarını değiştirmeyin.

Ek kontroller:

```powershell
node scripts/test-share-export.cjs
node scripts/smoke-ui.cjs
```

Smoke testi varsayılan olarak giriş kapısını kontrol eder. Yazma yapan UI regresyonlarını yalnız ayrı test veritabanı ve ayrı portta çalıştırın; canlı admin hesabıyla çalıştırmayın.

Hazır paketi bağımsız kopyada doğrulamak için `scripts/test-distribution.ps1 -PackageZip <özel-zip-yolu>` kullanılabilir. Test, paket içindeki Java ile boş kurulum/ilk admin/yeniden başlatmayı ve mevcut DB’nin açılış öncesi–sonrası tablo eşitliğini kontrol eder. 4186–4187 portları boş olmalıdır. Slack alıcısı ve zamanlanmış paylaşım test kopyasında kapatılır; canlı veri kullanılmaz. Geçici kopyalar `tmp/` altında hassas veri içerdiği için test sonrasında güvenli biçimde temizlenmelidir.

## Yedekleme

- Ayarlar → Yedekleme ve veri güvenliği → **Şimdi yedek al** tam ZIP yedeği oluşturur.
- Otomatik zamanlar: Türkiye saatiyle **00:00, 08:00, 16:00**. Servis kapalıyken yedek alınamaz; açılışta kaçırılan son zaman dilimi telafi edilir.
- Başarılı yeni yedekten sonra yönetilen tam ZIP’lerin 10 günden eski olanları temizlenir. JSON geri yükleme güvenlik kopyaları ayrı dosyalardır.
- Varsayılan klasör `backups/scheduled/`. Son deneme, son başarı, hata durumu ve sonraki zaman Ayarlar’da görünür.
- Tam ZIP tüm DB tablolarını, kullanıcı hesaplarını, fotoğrafları, geçmişi ve Slack ayarlarını içerir. Yerel şifreleme anahtarı kullanılıyorsa pakete alınır; harici Secret kullanılıyorsa ayrıca güvenli korunmalıdır.
- Yedek ZIP şifrelenmiş bir paylaşım dosyası değildir. Erişimi kısıtlayın ve disk arızasına karşı güvenli başka bir diskte de kopya tutun.

### Tam yedeği geri yükleme

1. Hedef servisi durdurun; mevcut DB ve anahtarı ayrı güvenli konumda koruyun.
2. Tam ZIP’i ayrı geçici klasöre açın. İçindeki `database.zip` arşivinden `.mv.db` dosyasını çıkarın.
3. Veritabanını hedef `service/data/sprintboard.mv.db` yoluna yerleştirin.
4. Paketteki `slack-token.key` dosyasını eşleşen anahtar yoluna koyun. Harici anahtar kullanılıyorsa aynı Secret’ı sağlayın.
5. Uyumlu JAR ve `start-sprintboard.cmd` ile başlatın. Farklı DB konumu gerekiyorsa `SPRINTBOARD_DB_PATH` değişkenini dosya uzantısı olmadan ayarlayın.
6. Giriş yaptıktan sonra sprintleri, takım fotoğraflarını, izin/mesai toplamlarını, hesapları ve Slack bağlantısını kontrol edin.

Tam ZIP, ekrandaki JSON geri yükleme alanına verilmez. JSON ürün verisini taşır; hesap ve güvenlik geçmişinin tam sistem yedeği değildir. JSON geri yükleme mevcut hesapları korur fakat hesap–üye eşleştirmelerini yeniden kontrol etmeyi gerektirir.

### Satır karşılaştırmalı bakım yedeği

`scripts/CreateVerifiedFullBackup.java` kapalı canlı DB’den tam yedek alır, ayrı kopyasını açar ve tabloları satır bazında karşılaştırır. Bakım sırasında servis duruyorken:

```powershell
mvn dependency:build-classpath -Dmdep.outputFile=tmp/import-classpath.txt
$backupClasspath = 'target/classes;' + (Get-Content tmp/import-classpath.txt -Raw).Trim()
java --class-path $backupClasspath scripts/CreateVerifiedFullBackup.java
```

## Yapılandırma

| Değişken | Varsayılan veya amaç |
| --- | --- |
| `SPRINTBOARD_DB_PATH` | `./service/data/sprintboard`; sabit ve kalıcı DB yolu |
| `SPRINTBOARD_BIND_ADDRESS` | `127.0.0.1`; varsayılan yalnız yerel erişim |
| `SPRINTBOARD_PORT` | `4181` |
| `SPRINTBOARD_AUTO_BACKUP_ENABLED` | `true` |
| `SPRINTBOARD_AUTO_BACKUP_DIRECTORY` | `./backups/scheduled` |
| `SPRINTBOARD_SLACK_KEY_FILE` | `./service/data/slack-token.key` |

Slack çalışma alanı, kanallar, tokenlar, mesaj şablonu ve günlük paylaşım Ayarlar’dan yönetilir. Sırları kaynak dosyalarına veya komut geçmişine yazmayın. Tek instance desteği ağ/OCP yayın onayı değildir; TLS, erişim, kalıcı disk ve Secret işletimi ayrıca değerlendirilmelidir.

## GitHub hazırlığı

Önerilen Git kökü bu klasördür. `.gitignore`; DB, yedek, anahtar/token dosyaları, kişisel fotoğraflar, özel seed, eski çıktılar, derlenmiş JAR/static dosyaları ve bağımlılıkları dışarıda tutar. Üst çalışma alanı için de koruyucu ignore kuralları vardır.

Yüklemeden önce `git status --short` ve `git diff --cached` inceleyin. Daha önce izlenen dosyaları `.gitignore` geçmişten çıkarmaz. Maven hem kaynak kopyalama hem JAR paketleme aşamasında `seed/**` dosyalarını dışlar. `releases/`, gerçek fotoğraf varlıkları ve çalışma verileri Git dışında kalır. Özel hazır ZIP’i bir GitHub Release’e eklemeyin.

## Proje yapısı

```text
frontend/src/            Angular kaynakları
service/src/main/java/   Uygulama servisleri
service/src/main/resources/db/migration/  Veritabanı migration dosyaları
service/src/test/        Backend testleri
scripts/                Regresyon testleri ve bakım yedeği aracı
docs/                   Kullanıcı kılavuzu ve hesap kurtarma
assets/team-photos/     Yerel özel fotoğraf varlıkları, Git dışında
```

18 Ekim 2026 temizliğinde tamamlanmış tek seferlik düzeltme/aktarım betikleri ve eski belgeler üst çalışma alanındaki `local-archive/cleanup-20261018.zip` dosyasına taşındı. Eski veri yedekleri ve geçici test çıktıları kaldırıldı; uygulama kaynakları, testler, gerçek seed, fotoğraflar ve çalışan DB korundu.
