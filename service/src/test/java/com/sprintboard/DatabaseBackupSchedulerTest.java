package com.sprintboard;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import java.nio.file.*;
import java.time.*;
import java.util.zip.*;

class DatabaseBackupSchedulerTest {
 @TempDir Path root;JdbcTemplate db;DatabaseBackupScheduler service;Path backups,key;
 @BeforeEach void setup()throws Exception{
  db=new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:file:"+root.resolve("live")+";DB_CLOSE_ON_EXIT=FALSE","sa",""));
  db.execute("CREATE TABLE slack_config(bot_secret VARCHAR,app_secret VARCHAR)");db.execute("INSERT INTO slack_config VALUES('encrypted','encrypted')");
  db.execute("CREATE TABLE records(id INT PRIMARY KEY, value_text VARCHAR)");db.update("INSERT INTO records VALUES(1,'preserved')");
  key=root.resolve("key");Files.writeString(key,"test-recovery-key");backups=root.resolve("backups");
  service=new DatabaseBackupScheduler(db,backups.toString(),key.toString(),"",10);
 }
 @Test void onlineBackupRestoresDataAndKey()throws Exception{
  Path archive=service.create(Instant.now());assertTrue(DatabaseBackupScheduler.valid(archive));assertTrue(service.managed(archive));
  try(var outer=new ZipFile(archive.toFile())){
   assertEquals("test-recovery-key",new String(outer.getInputStream(outer.getEntry("slack-token.key")).readAllBytes()));
   try(var nested=new ZipInputStream(outer.getInputStream(outer.getEntry("database.zip")))){ZipEntry e;while((e=nested.getNextEntry())!=null)if(e.getName().endsWith(".mv.db"))Files.copy(nested,root.resolve("restored.mv.db"));}
  }
  var restored=new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:file:"+root.resolve("restored")+";IFEXISTS=TRUE","sa",""));
  assertEquals("preserved",restored.queryForObject("SELECT value_text FROM records WHERE id=1",String.class));
  assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM records",Integer.class));
 }
 @Test void deletesOnlyExpiredManagedArchivesAfterSuccess()throws Exception{
  Instant now=Instant.now();Path old=service.create(now.minus(Duration.ofDays(11))),boundary=service.create(now.minus(Duration.ofDays(10)));
  Path unrelated=backups.resolve("manual-backup.zip");Files.writeString(unrelated,"keep");
  Path latest=service.create(now);assertFalse(Files.exists(old));assertTrue(Files.exists(boundary));assertTrue(Files.exists(unrelated));assertTrue(Files.exists(latest));
 }
 @Test void missingKeyFailureDoesNotRemoveOldBackup()throws Exception{
  Path old=service.create(Instant.now().minus(Duration.ofDays(11)));Files.delete(key);
  assertThrows(java.io.IOException.class,()->service.create(Instant.now()));assertTrue(Files.exists(old));
  try(var files=Files.list(backups)){assertEquals(1,files.filter(p->p.toString().endsWith(".zip")).count());}
 }
 @Test void externalKeyIsNotIncludedInArchive()throws Exception{
  service=new DatabaseBackupScheduler(db,backups.toString(),key.toString(),"external-secret",10);
  try(var zip=new ZipFile(service.create(Instant.now()).toFile())){assertNull(zip.getEntry("slack-token.key"));assertTrue(new String(zip.getInputStream(zip.getEntry("backup.properties")).readAllBytes()).contains("external-secret-required"));}
 }
 @Test void startupCatchesUpAndDoesNotDuplicateSlot()throws Exception{
  service.started();service.scheduled();service.retry();try(var files=Files.list(backups)){assertEquals(1,files.filter(p->p.toString().endsWith(".zip")).count());}
  new DatabaseBackupScheduler(db,backups.toString(),key.toString(),"",10).started();try(var files=Files.list(backups)){assertEquals(1,files.filter(p->p.toString().endsWith(".zip")).count());}
 }
 @Test void turkeySlotsAreMidnightEightAndSixteen(){
  assertEquals(Instant.parse("2026-10-17T05:00:00Z"),DatabaseBackupScheduler.slotStart(Instant.parse("2026-10-17T12:59:59Z")));
  assertEquals(Instant.parse("2026-10-17T13:00:00Z"),DatabaseBackupScheduler.slotStart(Instant.parse("2026-10-17T13:00:00Z")));
  assertEquals(Instant.parse("2026-10-17T21:00:00Z"),DatabaseBackupScheduler.slotStart(Instant.parse("2026-10-17T21:00:00Z")));
 }
 @Test void statusSurvivesRestartAndPreservesSuccessOnFailure()throws Exception{
  var at=Instant.now();Path saved=service.create(at);assertEquals("SUCCESS",service.status().get("result"));
  assertEquals(saved.getFileName().toString(),service.status().get("filename"));
  Files.delete(key);assertThrows(java.io.IOException.class,()->service.create(at.plusSeconds(1)));
  var reopened=new DatabaseBackupScheduler(db,backups.toString(),key.toString(),"",10);
  assertEquals("FAILED",reopened.status().get("result"));assertEquals(at.toString(),reopened.status().get("lastSuccessAt"));
  assertEquals(false,reopened.status().get("retryPending"));assertTrue(Instant.parse(reopened.status().get("nextScheduledAt").toString()).isAfter(Instant.now()));
 }
 @Test void statusDiscoversExistingArchive()throws Exception{
  service.create(Instant.now());Files.delete(backups.resolve("backup-status.properties"));
  assertEquals("SUCCESS",new DatabaseBackupScheduler(db,backups.toString(),key.toString(),"",10).status().get("result"));
 }
 @Test void corruptArchiveNotRecognized()throws Exception{Path p=root.resolve("broken.zip");Files.writeString(p,"broken");assertFalse(DatabaseBackupScheduler.valid(p));}
}
