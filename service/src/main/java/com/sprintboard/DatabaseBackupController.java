package com.sprintboard;
import java.time.Instant;
import java.util.Map;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
@RestController
@RequestMapping("/api/admin/backups")
public class DatabaseBackupController {
 private final ObjectProvider<DatabaseBackupScheduler> backups;
 public DatabaseBackupController(ObjectProvider<DatabaseBackupScheduler> backups){this.backups=backups;}
 @GetMapping("/status") public ResponseEntity<?> status(){var service=backups.getIfAvailable();return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service==null?Map.of("enabled",false,"result","DISABLED"):service.status());}
 @PostMapping("/full") public ResponseEntity<?> create(){
  var service=backups.getIfAvailable();if(service==null)throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Tam veritabanı yedekleme kapalı.");
  try{var path=service.create(Instant.now());return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("filename",path.getFileName().toString(),"message","Tam veritabanı yedeği sunucuda oluşturuldu."));}
  catch(Exception e){throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,"Yedek alınamadı; mevcut yedekler korunuyor. Sunucu kayıtlarını kontrol edin.");}
 }
}
