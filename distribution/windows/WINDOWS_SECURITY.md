# Windows kurulumu: güvenli ekip erişimi

Yerel kullanım varsayılan olarak `http://127.0.0.1:4181/` adresindedir. Diğer bilgisayarlar bu adrese bağlanamaz. İlk yönetici hesabını yerel bilgisayarda oluşturun.

## Ağ erişiminde HTTPS

Windows paketi `server.address=0.0.0.0` için HTTPS ister; sertifika eksik veya geçersizse HTTP'ye dönmez, servisi başlatmaz. Kurumunuzdan sunucu adına düzenlenmiş, istemci bilgisayarlarının güvendiği bir TLS sertifikası ve özel anahtarı içeren **PKCS12 (.p12)** dosyası alın. Sertifikanın Subject Alternative Name alanında kullanacağınız DNS adı bulunmalıdır. TLS sertifikası ile EXE yayıncı imzası farklı konulardır.

1. Sistem tepsisinden SprintBoard'u durdurun.
2. `%LOCALAPPDATA%\SprintBoardData\tls` klasörüne kendi `server.p12` dosyanızı koyun. Parolasını aynı klasörde `password.txt` dosyasına tek satır olarak kaydedin. Dosyalara yalnız uygulamayı çalıştıran Windows hesabının ve sistem yöneticisinin erişebilmesini sağlayın. Bu dosyaları Git'e veya dağıtım paketine eklemeyin.
3. Veri klasöründeki `settings.properties` dosyasını düzenleyin:

```properties
server.address=0.0.0.0
server.port=4181
server.ssl.enabled=true
server.ssl.key-store=tls/server.p12
server.ssl.key-store-password-file=tls/password.txt
browser.host=sprintboard.example.internal
# PKCS12 dosyasında birden fazla anahtar varsa belirtin:
# server.ssl.key-alias=sprintboard
```

4. `browser.host` değerini sertifikanızdaki gerçek sunucu adıyla değiştirin; bu ad ekip bilgisayarlarında doğru sunucuya çözülmelidir. SprintBoard'u tekrar açın.
5. Ekip `https://sprintboard.example.internal:4181/` adresini kullanır. Windows güvenlik duvarı ve ağ erişimini kurumunuzun kurallarına göre sınırlandırın. Kurulum kendiliğinden güvenlik duvarını değiştirmez.

TLS 1.2/1.3 kullanılır; oturum çerezi HTTPS modunda `Secure` olarak gönderilir. Sertifika parolası komut satırına veya başlatıcı durum dosyasına yazılmaz. İç sağlık kontrolü yalnız seçili sunucu sertifikasına güvenir ve sunucu adı doğrulamasını sürdürür. Tarayıcı sertifika uyarısını atlamak yerine kurumun kök sertifika ve DNS kurulumunu düzeltin.

## Veri ve anahtarların korunması

H2 veritabanı ve tam yedekler tüm dosya düzeyinde şifreli değildir. Entegrasyon tokenları uygulama tarafından şifrelenir; yerel anahtarlar veri klasöründedir. Veri klasörünü ve yedekleri yalnız yetkili hesaplara açın; kurum politikasına uygun disk şifrelemesi ve güvenli yedek depolaması kullanın. Anahtarı ve veritabanını birlikte kaybederseniz tokenlar kurtarılamaz. Başka takıma yalnız temiz kurulum EXE'si verilir; `SprintBoardData` klasörü paylaşılmaz.

## Dağıtımın doğrulanması

Pilot paket kod imzası taşımaz. Bu durum Windows tarafından doğrulanmış yayıncı olduğu anlamına gelmez. EXE'yi güvenilir dağıtım noktasından alın; `Get-FileHash <dosya> -Algorithm SHA256` çıktısını aynı sürümün `SHA256SUMS.txt` dosyasıyla karşılaştırın. Hash dosyası da güvenilir bir kanaldan gelmelidir. Kurumsal kod imzalama sertifikası temin edildiğinde yayıncı imzası ayrı dağıtım adımı olarak tamamlanacaktır.

`DEPENDENCIES.cdx.json` uygulama bileşen envanterini, `SECURITY-CHECKS.json` paket oluşturulurken yapılan kontrolleri içerir. Temiz tarama, bilinmeyen açık bulunmadığı veya tam sızma testi yapıldığı anlamına gelmez. Yeni güvenlik yamaları çıktığında Java dahil paket yeniden üretilmelidir.
