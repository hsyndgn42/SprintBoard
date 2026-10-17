# Hesap şifresi ve yerel yönetici kurtarma — SEC-01C

## Oturum açıkken kendi şifrenizi değiştirme

Üst bardaki baş harflerinize tıklayın (**Şifremi değiştir**). ADMIN ve USER aynı formu kullanır. Mevcut şifre, yeni şifre ve tekrarı gerekir. Yeni şifre en az 12 karakter, UTF-8 olarak en fazla 72 bayttır ve eskisinden farklı olmalıdır. USER başka hesabı veya ürün verisini değiştirme yetkisi kazanmaz.

Başarılı değişiklikte bu oturum hemen kapanır; diğer oturumlar sonraki isteklerinde reddedilir. Önceden gösterilmiş ekran içeriği uzaktan silinmez. Yeni şifreyle yeniden giriş yapın. Aynı anda eski oturumla gelen ikinci şifre değişikliği de veritabanında sürüm denetiminden geçemez.

Hesap başına varsayılan 15 dakikada en fazla 5 değişiklik isteği vardır (başarılı, geçersiz form veya yanlış mevcut şifre dahil). Giriş sayacından ayrı `P:` bütçesi H2'de kalır; çıkıp giriş yapmak veya servisi yeniden başlatmak bu sayacı sıfırlamaz. Süre dolmadan sınır kaldırılmaz. Engelde HTTP 429 ve Retry-After döner. Ayarlar'da hesap geçmişine başarılı değişiklik, giriş geçmişine reddedilen değişiklik ve süreli engel yazılır; şifreler kayda alınmaz.

## Şifre unutulduğunda: yalnız yerel ürün sahibi

Bu **web üzerinden kimlik doğrulamasız sıfırlama değildir**. HTTP kurtarma ucu, gizli varsayılan şifre veya kurtarma hesabı yoktur. Yetki sınırı, özel yerel veritabanı dosyasına işletim sistemi düzeyinde erişimdir. O dosyayı okuyup değiştirebilen kişi zaten tüm ürün verisine ve parola özetlerine erişebilir. Bu nedenle DB klasörü, JAR/seed ve yedekler yalnız ürün sahibinin OS hesabına açık olmalıdır; ortak paylaşım veya farklı OS kullanıcılarının yazabildiği klasör uygun değildir. Araç ilave OS kimlik doğrulaması/PIN sormaz, mevcut OS oturumunun dosya yetkilerine güvenir. OCP/merkezi kimlik kurtarma çözümü değildir.

1. SprintBoard servisini normal biçimde kapatın. Açık uygulama veritabanının kilidini bırakmadan kurtarma çalışmaz. **Kilit dosyası silmeyin; başka Java uygulamalarını kapatmayın.**
2. Kendi etkileşimli PowerShell/terminalinizde proje köküne geçip çalıştırın:

   ```powershell
   cd C:\Users\husey\Desktop\SprintBoard\is_mso_sprint_board
   java -jar target\sprintboard-service-0.1.0.jar --recover-admin
   ```

3. Mevcut `.mv.db` dosyasının tam yolunu girin; varsayılan:
   `C:\Users\husey\Desktop\SprintBoard\is_mso_sprint_board\service\data\sprintboard.mv.db`.
   Ortam değişkeniyle farklı DB kullanıyorsanız onun yolunu girin; araç varsayılan dosyayı tahmin etmez. Yalnız bu ürünün `sa` / boş DB parolalı, yerel dosya kurulumunu destekler. DB kimlik bilgileri değiştirilmiş veya şifrelenmiş kurulum desteklenmez; ayarlarını gevşetmeyin.
4. Mevcut **etkin ADMIN** kullanıcı adını, ardından tam `RECOVER kullanıcıadı` onayını girin. USER/pasif/olmayan hesaplar kabul edilmez; hesap oluşturulmaz veya rol değiştirilmez.
5. Yeni şifreyi iki kez girin. Terminal şifreyi göstermez. Şifreyi komut satırı argümanına, ortam değişkenine, dosyaya veya sohbete yazmayın. Yönlendirilmiş giriş / etkileşimsiz çalıştırma reddedilir.
6. Araç şifreyi değiştirmeden önce DB'nin yanına benzersiz `admin-recovery-<id>.zip` yedeğini H2 `BACKUP TO` ile alır. Yedek oluşmazsa hesap güncellenmez. Başarıda yalnız ilgili şifre özeti ve oturum sürümü değiştirilir; `ADMIN_RECOVERED` / `local-recovery` denetim kaydı aynı transaction'a yazılır. Ürün verileri, diğer hesaplar, etkinlik ve giriş sınırları korunur. Teknik hata ayrıntıları/parolalar konsola basılmaz.
7. Başarı mesajı ve yedek yolunu gördükten sonra normal `java -jar target\sprintboard-service-0.1.0.jar` veya başlatma dosyasıyla açın. Yeni şifreyle giriş yapın. Önceden giriş sınırına takıldıysanız kalan süreyi bekleyin; kurtarma sayacı silmez.

Başarısızlıkta servis kapalı mı, yol doğru mu, OS erişimi var mı, hesap etkin ADMIN mi, onay doğru mu, şifre kuralları sağlanıyor mu kontrol edin. İşlem sonrası hata durumunda sonuçtan emin değilseniz tekrar tekrar kurtarma yapmayın; normal başlatıp yeni şifreyle bir kez deneyin. Başarısız transaction yedeği klasörde kalabilir; yedeğin varlığı tek başına kurtarma başarı kanıtı değildir.

## Yedeği koruma ve geri dönüş

ZIP **şifrelenmiş değildir**; tüm ürün verisi ve parola özetlerini içerir. JSON ürün yedeğiyle karıştırmayın. Git'e veya ekibe göndermeyin; özel erişimli klasörde saklayın. Kurtarma, kaynak klasörün mevcut OS izinlerinden daha güçlü bir dosya erişim politikası kurmaz.

Geri dönüş ancak açık bir geri yükleme kararıyla yapılmalıdır: servisi kapatın, mevcut `.mv.db` dosyasını farklı güvenli adla koruyun, ZIP'i ayrı boş özel klasöre açın ve beklenen `.mv.db` dosyasını doğrulayın. Bu eski DB'yi **servis kapalıyken** doğru dosya konumuna geri koyun; aynı H2/uygulama sürümüyle başlatın. Tüm ürün ve hesap durumu yedek anına döner, eski parola yeniden geçerli olur, sonraki kayıtlar kaybolur. Canlı dosyanın üzerine ZIP açmayın. Otomatik canlı geri yükleme yapılmaz.

Teknik dayanak: [H2 BACKUP komutu](https://h2database.github.io/html/commands.html#backup) transaction tutarlı ZIP üretir; [H2 dosya kilidi ve IFEXISTS](https://h2database.com/html/features.html#database_file_locking) başka JVM'nin açık dosyasını kullanmayı ve yanlışlıkla yeni DB oluşturmayı engellemek için kullanılır. Açık DB dosyası işletim sistemi kopyasıyla yedeklenmez.

## Test kapsamı / sınırlar

`AccountManagementTest`: ADMIN/USER kendi şifresini değiştirme, başka kullanıcı adına işlem yapamama, mevcut şifre/tekrar/politika, CSRF/anonim engeli, tüm oturumların iptali, eski sürümlü istek, ayrı süreli sınır ve ürün verisinin korunması.

`LocalAdminRecoveryTest`: geçici dosya DB'sinde şifre/rol/veri izolasyonu, ZIP'ten eski DB'nin açılması, yanlış hedef/onay/şifre, pasif/USER engeli, denetim hatasında transaction rollback ve ayrı JVM'de açık DB kilidi.

Tarayıcı: `SPRINTBOARD_SMOKE_PASSWORD=1` yalnız `SPRINTBOARD_SETUP=1`, `SPRINTBOARD_BASE_URL=http://127.0.0.1:4183` ve geçici H2/test hesaplarıyla. Gerçek hesap şifresini değiştirerek test etmeyin. `SPRINTBOARD_PASSWORD_SCREENSHOT_DIR` isteğe bağlı ekran çıktısı klasörüdür.

Zorunlu ilk giriş şifre değişikliği bu teslimata dahil değildir. Tek yerel ürün sahibi kapsamı korunur; USER şifresini kendisi değiştirebilir. Şirket/çok kullanıcılı kullanıma geçmeden önce merkezi kimlik, güvenli dağıtım, yedek izinleri ve ilk giriş politikasını ayrıca kararlaştırın.
