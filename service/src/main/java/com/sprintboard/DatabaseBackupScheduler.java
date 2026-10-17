package com.sprintboard;

import java.nio.file.*;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.zip.*;
import java.io.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.*;
import org.springframework.stereotype.Component;

/** Full, transaction-consistent H2 backups; only this service's completed archives are rotated. */
@Component
@EnableScheduling
@ConditionalOnProperty(name="sprintboard.auto-backup.enabled",havingValue="true")
public class DatabaseBackupScheduler {
 private static final org.slf4j.Logger log=org.slf4j.LoggerFactory.getLogger(DatabaseBackupScheduler.class);
 private static final ZoneId ZONE=ZoneId.of("Europe/Istanbul");
 private static final DateTimeFormatter NAME=DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmssSSS'Z'").withZone(ZoneOffset.UTC);
 private final JdbcTemplate db;private final Path directory,keyFile;private final String externalKey;private final int retention;
 private volatile boolean ready;
 private final Properties state=new Properties();
 public DatabaseBackupScheduler(JdbcTemplate db,@Value("${sprintboard.auto-backup.directory:./backups/scheduled}") String dir,
  @Value("${sprintboard.slack.key-file:./service/data/slack-token.key}") String keyFile,
  @Value("${sprintboard.slack.encryption-key:}") String externalKey,@Value("${sprintboard.auto-backup.retention-days:10}") int retention){
  if(retention<1)throw new IllegalArgumentException("Backup retention must be positive");
  this.db=db;this.directory=Path.of(dir).toAbsolutePath().normalize();this.keyFile=Path.of(keyFile).toAbsolutePath().normalize();this.externalKey=externalKey;this.retention=retention;
  try{Path saved=directory.resolve("backup-status.properties");if(Files.isRegularFile(saved))try(var in=Files.newInputStream(saved)){state.load(in);}
   if("RUNNING".equals(state.getProperty("result")))state.setProperty("result","INTERRUPTED");
  }catch(IOException e){state.setProperty("result","UNKNOWN");}
 }
 @EventListener(ApplicationReadyEvent.class) public void started(){ready=true;checkDue();}
 @Scheduled(cron="0 0 0,8,16 * * *",zone="Europe/Istanbul") public void scheduled(){checkDue();}
 // Retry failed jobs and catch up after downtime. No duplicate archive within an 8-hour slot.
 @Scheduled(fixedDelay=300000,initialDelay=300000) public void retry(){checkDue();}
 public synchronized void checkDue(){if(!ready)return;try{
  String url=db.execute((org.springframework.jdbc.core.ConnectionCallback<String>)c->c.getMetaData().getURL());
  if(url==null||!url.startsWith("jdbc:h2:file:"))return;
  Instant now=Instant.now(),slot=slotStart(now);Files.createDirectories(directory);
  try(var paths=Files.list(directory)){if(paths.filter(this::managed).anyMatch(p->{try{return !timestamp(p).isBefore(slot)&&valid(p);}catch(Exception e){return false;}}))return;}
  create(now,"AUTO");
 }catch(Exception e){failed(Instant.now(),"AUTO");log.error("Database backup FAILED; existing backups retained; retry in 5 minutes ({})",e.getClass().getSimpleName());}}
 static Instant slotStart(Instant now){var local=now.atZone(ZONE);return local.toLocalDate().atTime((local.getHour()/8)*8,0).atZone(ZONE).toInstant();}
 boolean managed(Path p){return Files.isRegularFile(p,LinkOption.NOFOLLOW_LINKS)&&p.getFileName().toString().matches("sprintboard-full-\\d{8}T\\d{9}Z-[a-f0-9-]{36}\\.zip");}
 Instant timestamp(Path p){String s=p.getFileName().toString();return Instant.from(NAME.parse(s.substring(17,36)));}
 public synchronized Path create(Instant now)throws Exception{
  return create(now,"MANUAL");
 }
 private synchronized Path create(Instant now,String source)throws Exception{
  state.setProperty("lastAttemptAt",now.toString());state.setProperty("source",source);state.setProperty("result","RUNNING");saveState();
  try{Path result=writeBackup(now);state.setProperty("lastSuccessAt",now.toString());state.setProperty("filename",result.getFileName().toString());state.setProperty("result","SUCCESS");saveState();return result;}
  catch(Exception e){failed(now,source);throw e;}
 }
 private void failed(Instant now,String source){state.setProperty("lastAttemptAt",now.toString());state.setProperty("source",source);state.setProperty("result","FAILED");saveState();}
 private void saveState(){try{Files.createDirectories(directory);Path temp=directory.resolve("backup-status.pending");try(var out=Files.newOutputStream(temp)){state.store(out,"SprintBoard backup status (no credentials)");}Files.move(temp,directory.resolve("backup-status.properties"),StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);}catch(IOException e){log.error("Backup status could not be persisted ({})",e.getClass().getSimpleName());}}
 public synchronized Map<String,Object> status(){
  if(state.getProperty("lastSuccessAt","").isBlank()&&Files.isDirectory(directory))try(var files=Files.list(directory)){
   for(Path p:files.filter(this::managed).sorted(Comparator.comparing(this::timestamp).reversed()).toList())if(valid(p)){state.setProperty("lastSuccessAt",timestamp(p).toString());state.setProperty("filename",p.getFileName().toString());if(state.getProperty("result")==null)state.setProperty("result","SUCCESS");break;}
  }catch(IOException e){state.setProperty("result","UNKNOWN");}
  Instant now=Instant.now();var out=new LinkedHashMap<String,Object>();out.put("enabled",true);out.put("timezone","Europe/Istanbul");out.put("retentionDays",retention);out.put("nextScheduledAt",slotStart(now).plus(Duration.ofHours(8)).toString());
  for(String field:List.of("lastAttemptAt","lastSuccessAt","filename","source","cleanupWarning"))out.put(field,state.getProperty(field,""));
  out.put("result",state.getProperty("result","NEVER"));out.put("retryPending","FAILED".equals(state.getProperty("result"))&&"AUTO".equals(state.getProperty("source")));return out;
 }
 private Path writeBackup(Instant now)throws Exception{
  Files.createDirectories(directory);if(Files.isSymbolicLink(directory))throw new IOException("Symlink backup directory not allowed");
  Path scratch=Files.createTempDirectory(directory,".pending-"),raw=scratch.resolve("database.zip"),bundle=scratch.resolve("bundle.zip");
  Path result=directory.resolve("sprintboard-full-"+NAME.format(now)+"-"+UUID.randomUUID()+".zip");
  try{
   // BACKUP TO is H2's online consistent snapshot, not a copy of an open .mv.db file.
   db.execute("BACKUP TO '"+raw.toString().replace("'","''")+"'");
   boolean secrets=db.queryForObject("SELECT COUNT(*) FROM slack_config WHERE bot_secret<>'' OR app_secret<>''",Integer.class)>0;
   if(secrets&&externalKey.isBlank()&&!Files.isRegularFile(keyFile))throw new IOException("Slack recovery key missing");
   try(var out=new ZipOutputStream(Files.newOutputStream(bundle))){
    out.putNextEntry(new ZipEntry("database.zip"));Files.copy(raw,out);out.closeEntry();
    if(externalKey.isBlank()&&Files.isRegularFile(keyFile))add(out,"slack-token.key",Files.readAllBytes(keyFile));
    add(out,"backup.properties",("format=sprintboard-full-v1\ncreatedAt="+now+"\nslackKey="+(externalKey.isBlank()?"file":"external-secret-required")+"\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));
   }
   if(!valid(bundle))throw new IOException("Invalid backup archive");
   Files.move(bundle,result,StandardCopyOption.ATOMIC_MOVE);
   log.info("Database backup OK: {}",result.getFileName());
   state.remove("cleanupWarning");try{cleanup(now,result);}catch(IOException e){state.setProperty("cleanupWarning","Eski yedeklerin temizliği tamamlanamadı.");log.error("Backup created, but retention cleanup failed ({})",e.getClass().getSimpleName());}return result;
  }finally{Files.deleteIfExists(bundle);Files.deleteIfExists(raw);Files.deleteIfExists(scratch);}
 }
 static void add(ZipOutputStream out,String name,byte[] bytes)throws IOException{out.putNextEntry(new ZipEntry(name));out.write(bytes);out.closeEntry();}
 static boolean valid(Path archive)throws IOException{
  boolean database=false,manifest=false;
  // Drain each entry to verify CRC without loading a large DB into heap.
  try(var zip=new ZipInputStream(Files.newInputStream(archive))){while(zip.getNextEntry()!=null)zip.transferTo(OutputStream.nullOutputStream());}
  try(var zip=new ZipFile(archive.toFile())){
   var entry=zip.getEntry("database.zip");var meta=zip.getEntry("backup.properties");
   if(entry==null||meta==null)return false;
   try(var nested=new ZipInputStream(zip.getInputStream(entry))){ZipEntry n;while((n=nested.getNextEntry())!=null){long length=nested.transferTo(OutputStream.nullOutputStream());if(n.getName().endsWith(".mv.db")&&length>0)database=true;}}
   try(var in=zip.getInputStream(meta)){manifest=new String(in.readNBytes(4096),java.nio.charset.StandardCharsets.UTF_8).contains("format=sprintboard-full-v1");}
  }catch(ZipException e){return false;}
  return database&&manifest;
 }
 void cleanup(Instant now,Path latest)throws IOException{
  Instant cutoff=now.truncatedTo(java.time.temporal.ChronoUnit.MILLIS).minus(Duration.ofDays(retention));
  try(var paths=Files.list(directory)){for(Path p:paths.filter(this::managed).toList()){
   if(!p.equals(latest)&&timestamp(p).isBefore(cutoff)){Files.delete(p);log.info("Expired backup removed: {}",p.getFileName());}
  }}
 }
}
