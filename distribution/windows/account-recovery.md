# Windows paketinde yönetici parolasını sıfırlama

Uygulamaya girebiliyorsanız profil menüsünden parolanızı değiştirin. Aşağıdaki yöntem yalnız yerel bilgisayardaki kendi kurulumuna yönetici erişimi olan kişi içindir.

1. Bildirim alanındaki SprintBoard simgesinden **Servisi durdur ve çık** seçin.
2. PowerShell açıp SprintBoard'un kurulu olduğu klasöre geçin. Varsayılan konum `%LOCALAPPDATA%\SprintBoard` klasörüdür; kurulumda farklı yol seçmiş olabilirsiniz.
3. Paketin kendi Java'sıyla kurtarma komutunu çalıştırın:

```powershell
& .\runtime\bin\java.exe -jar .\app\sprintboard-service.jar --recover-admin
```

4. Veritabanı yolu sorulduğunda `%LOCALAPPDATA%\SprintBoardData\service\data\sprintboard.mv.db` dosyasının genişletilmiş tam yolunu girin. PowerShell'de `$env:LOCALAPPDATA` kendi kullanıcı klasörünüzü gösterir.
5. Mevcut admin kullanıcı adını, ekrandaki açık onay metnini ve yeni parolayı girin. Parola komut satırı argümanı olarak verilmez.
6. Araç önce yedek oluşturur, sonra yalnız ilgili admin parolasını yeniler. Diğer hesaplar ve sprintler korunur.
7. İşlem tamamlanınca SprintBoard kısayolunu açıp yeni parolayla giriş yapın.

Veritabanını silmek veya boş kurulum yapmak parola sıfırlama yöntemi değildir.
