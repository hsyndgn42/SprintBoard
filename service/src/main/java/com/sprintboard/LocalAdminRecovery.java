package com.sprintboard;

import java.nio.CharBuffer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.Arrays;
import java.util.UUID;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/** Offline maintenance only. The authorization boundary is OS access to the private database file. */
final class LocalAdminRecovery {
  private LocalAdminRecovery() {}

  static int run(String[] args) {
    var console = System.console();
    if (args.length != 1 || !args[0].equals("--recover-admin") || console == null) {
      System.err.println("Kurtarma yalnız etkileşimli terminalde java -jar <jar> --recover-admin ile çalışır. Şifre argümanı veya yönlendirilmiş giriş kabul edilmez.");
      return 2;
    }
    char[] password=null, confirmation=null;
    try {
      console.printf("SprintBoard YEREL YÖNETİCİ KURTARMA%nServisi kapatın. Bu işlem dosya erişim yetkinize dayanır; yalnız kendi özel yerel DB'nizde kullanın.%nÖnce hesapları da içeren ZIP yedeği alınır. Başka hesaplar ve sprint verisi değişmez.%n");
      String file=console.readLine("Mevcut .mv.db dosyasının tam yolu: ");
      String username=console.readLine("Yönetici kullanıcı adı: ");
      String approval=console.readLine("Onay için RECOVER <kullanıcı adı> yazın: ");
      password=console.readPassword("Yeni şifre (en az 12 karakter): ");
      confirmation=console.readPassword("Yeni şifre tekrar: ");
      Path backup=recover(Path.of(file),username,password,confirmation,approval);
      console.printf("Şifre yenilendi. Yedek: %s%nServisi normal şekilde başlatıp yeni şifreyle giriş yapın. Giriş denemesi sınırları korunur.%n",backup);
      return 0;
    } catch (Exception error) {
      // JDBC errors may include SQL/connection details. Never print them or request values here.
      console.printf("Kurtarma tamamlanamadı. Dosya/yetki, kapalı servis, etkin ADMIN hesabı, açık onay ve şifre kurallarını kontrol edin. Teknik prosedür: docs/account-recovery.md%n");
      return 1;
    } finally {
      if(password!=null) Arrays.fill(password,'\0');
      if(confirmation!=null) Arrays.fill(confirmation,'\0');
    }
  }

  static Path recover(Path file, String username, char[] password, char[] confirmation, String approval) throws Exception {
    if (username==null || !username.matches("[a-z0-9._-]{3,80}") || !("RECOVER " + username).equals(approval))
      throw new IllegalArgumentException("Açık hesap onayı gerekli.");
    if (password==null || confirmation==null || !Arrays.equals(password,confirmation))
      throw new IllegalArgumentException("Şifreler eşleşmiyor.");
    PasswordPolicy.validate(new String(password));
    Path resolved=file.toRealPath();
    String path=resolved.toString().replace('\\','/');
    if (!Files.isRegularFile(resolved) || !path.endsWith(".mv.db") || path.contains(";") || path.startsWith("//"))
      throw new IllegalArgumentException("Mevcut yerel H2 dosyası gerekli.");
    String url="jdbc:h2:file:"+path.substring(0,path.length()-6)+";IFEXISTS=TRUE;AUTO_SERVER=FALSE;TRACE_LEVEL_FILE=0;TRACE_LEVEL_SYSTEM_OUT=0";
    // IFEXISTS prevents accidental new databases; H2's file lock rejects a running service.
    try (var connection=DriverManager.getConnection(url,"sa","")) {
      try(var query=connection.prepareStatement("SELECT password_hash FROM app_user WHERE username=? AND role='ADMIN' AND active=TRUE")) {
        query.setString(1,username);
        try(var row=query.executeQuery()) {
          if(!row.next()) throw new IllegalArgumentException("Etkin yönetici bulunamadı.");
          if(new BCryptPasswordEncoder().matches(CharBuffer.wrap(password),row.getString(1)))
            throw new IllegalArgumentException("Yeni şifre farklı olmalı.");
        }
      }
      Path backup=resolved.resolveSibling("admin-recovery-"+UUID.randomUUID()+".zip");
      // Engine-managed consistent backup; do not copy an open .mv.db file.
      try(var statement=connection.prepareStatement("BACKUP TO ?")) {
        statement.setString(1,backup.toString()); statement.execute();
      }
      if(!Files.isRegularFile(backup) || Files.size(backup)==0) throw new IllegalStateException("Yedek oluşturulamadı.");
      connection.setAutoCommit(false);
      try {
        try(var statement=connection.prepareStatement("UPDATE app_user SET password_hash=?,session_version=session_version+1 WHERE username=? AND role='ADMIN' AND active=TRUE")) {
          statement.setString(1,new BCryptPasswordEncoder().encode(CharBuffer.wrap(password))); statement.setString(2,username);
          if(statement.executeUpdate()!=1) throw new IllegalStateException("Yönetici değiştirilemedi.");
        }
        try(var statement=connection.prepareStatement("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES(CURRENT_TIMESTAMP,'account',?,'ADMIN_RECOVERED','{\"actor\":\"local-recovery\"}')")) {
          statement.setString(1,username); statement.executeUpdate();
        }
        connection.commit();
        return backup;
      } catch(Exception error) { connection.rollback(); throw error; }
    }
  }
}
