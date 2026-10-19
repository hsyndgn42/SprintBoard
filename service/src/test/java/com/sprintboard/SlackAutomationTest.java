package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.*;
import java.time.*;
import java.util.*;
import java.nio.file.Path;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.flywaydb.core.Flyway;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;

class SlackAutomationTest {
 @TempDir Path folder;
 static class TestClock extends Clock {Instant now=Instant.parse("2026-10-18T10:00:00Z");public Instant instant(){return now;}public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId z){return this;}}
 JdbcTemplate db;SlackConfigStore configs;SlackTransport transport;ObjectMapper mapper=new ObjectMapper();TestClock clock;SlackHistoryService history;SlackWeeklyService weekly;WeeklyOvertimeReport report;
 @BeforeEach void setup()throws Exception{
  var ds=new DriverManagerDataSource("jdbc:h2:mem:automation-"+UUID.randomUUID()+";DB_CLOSE_DELAY=-1","sa","");Flyway.configure().dataSource(ds).load().migrate();db=new JdbcTemplate(ds);clock=new TestClock();
  configs=new SlackConfigStore(db,new SlackSecretVault("",folder.resolve("key").toString()));configs.save(new SlackConfigStore.Config("TTEST123","CTEST123",SlackDefectParser.DEFAULT_TEMPLATE,"","",true,0,"COT12345","CBACK123",SlackBacklogParser.DEFAULT_TEMPLATE),"xoxb-fake-test-token","xapp-fake-test-token");
  transport=mock(SlackTransport.class);when(transport.call(eq("auth.test"),anyString(),anyMap())).thenReturn(mapper.readTree("{\"team_id\":\"TTEST123\",\"bot_id\":\"BTEST123\"}"));
  when(transport.call(eq("conversations.history"),anyString(),anyMap())).thenReturn(mapper.readTree("{\"messages\":[],\"has_more\":false}"));
  when(transport.call(eq("files.getUploadURLExternal"),anyString(),anyMap())).thenReturn(mapper.readTree("{\"file_id\":\"F123\",\"upload_url\":\"https://files.slack.com/upload/test\"}"));when(transport.call(eq("files.completeUploadExternal"),anyString(),anyMap())).thenReturn(mapper.readTree("{\"ok\":true}"));
  history=history();report=new WeeklyOvertimeReport(db,mapper);weekly=new SlackWeeklyService(db,configs,transport,report,mapper,clock,true);weekly.start();
 }
 SlackHistoryService history(){return new SlackHistoryService(db,configs,transport,new SlackInboxService(db,mapper,null,configs),new SlackOvertimeService(db,mapper,null),new SlackBacklogService(db,mapper,null),clock,true);}
 JsonNode message(String ts,String text){return mapper.valueToTree(Map.of("type","message","ts",ts,"user","UTEST123","text",text));}
 int count(String table){return db.queryForObject("SELECT COUNT(*) FROM "+table,Integer.class);}
 @Test void allChannelsReuseValidationDedupAndNeverApprove(){
  var c=configs.load("","");var valid=message("1792180000.1",SlackOvertimeParser.EXAMPLE);assertTrue(history.accept(c,"OVERTIME",c.overtimeChannel(),valid));history.accept(c,"OVERTIME",c.overtimeChannel(),valid);
  history.accept(c,"DEFECT",c.channel(),message("1792180000.2",SlackPreviewTest.TEXT));history.accept(c,"BACKLOG",c.backlogChannel(),message("1792180000.3","#backlog\nTür: DEV\nBaşlık: Yeni iş\nAçıklama: Gerekli"));
  history.accept(c,"OVERTIME",c.overtimeChannel(),message("1792180000.4","#mesai\nSaat: geçersiz"));
  assertEquals(2,count("slack_overtime_inbox"));assertEquals(1,count("slack_inbox"));assertEquals(1,count("slack_backlog_inbox"));assertEquals(3,count("slack_receipt_reaction"));assertEquals(0,count("overtime_request"));assertEquals(0,count("backlog_item"));
  var thread=mapper.valueToTree(Map.of("type","message","ts","1792180000.5","thread_ts","1792180000.1","user","UTEST123","text",SlackOvertimeParser.EXAMPLE));assertFalse(history.accept(c,"OVERTIME",c.overtimeChannel(),thread));assertFalse(history.accept(c,"OVERTIME",c.overtimeChannel(),message("1792180000.6","Merhaba")));
 }
 @Test void scanPagesCheckpointOnlyAtEndRestartAndManualIdempotency()throws Exception{
  String request=UUID.randomUUID().toString();var input=Map.<String,Object>of("from","2026-10-12","to","2026-10-18","requestId",request);history.scan(input,"admin");history.scan(input,"admin");assertEquals(3,count("slack_history_job"));
  when(transport.call(eq("conversations.history"),anyString(),anyMap())).thenAnswer(a->{var fields=(Map<?,?>)a.getArgument(2);return mapper.valueToTree(fields.containsKey("cursor")?Map.of("messages",List.of(),"has_more",false):Map.of("messages",List.of(message("1792180000.1",SlackPreviewTest.TEXT)),"has_more",true,"response_metadata",Map.of("next_cursor","page2")));});
  history.tick();assertEquals(0,count("slack_history_checkpoint"));assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM slack_history_job WHERE page_cursor='page2'",Integer.class));
  // Only the selected page remains runnable; reconstruct the worker like a process restart.
  db.update("UPDATE slack_history_job SET next_at='2099-01-01T00:00:00Z' WHERE page_cursor<> 'page2'");clock.now=clock.now.plusSeconds(70);history=history();history.tick();assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM slack_history_job WHERE state='SUCCESS'",Integer.class));
  verify(transport).call(eq("conversations.history"),anyString(),argThat(f->"page2".equals(f.get("cursor"))));
 }
 @Test void rateLimitRetainsPageAndRespectsRetryAfter(){
  when(transport.call(eq("conversations.history"),anyString(),anyMap())).thenThrow(new SlackTransport.RateLimited(600));history.tick();assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM slack_history_job WHERE state='RETRY'",Integer.class));clock.now=clock.now.plusSeconds(599);history.tick();verify(transport,times(1)).call(eq("conversations.history"),anyString(),anyMap());clock.now=clock.now.plusSeconds(2);history.tick();verify(transport,times(2)).call(eq("conversations.history"),anyString(),anyMap());assertEquals(0,count("slack_history_checkpoint"));
 }
 @Test void disabledOrWrongWorkspaceNeverImports(){configs.enabled(false);history.tick();verifyNoInteractions(transport);configs.enabled(true);when(transport.call(eq("auth.test"),anyString(),anyMap())).thenReturn(mapper.valueToTree(Map.of("team_id","TOTHER99","bot_id","B123")));history.tick();verify(transport,never()).call(eq("conversations.history"),anyString(),anyMap());}
 @Test void manualRangeAndSettingsAreValidated(){assertThrows(IllegalArgumentException.class,()->history.scan(Map.of("from","2025-01-01","to","2026-10-18","requestId",UUID.randomUUID().toString()),"admin"));assertThrows(IllegalArgumentException.class,()->weekly.save(Map.of("enabled",true,"weekday",9,"sendTime","09:00","version",0)));weekly.save(Map.of("enabled",true,"weekday",1,"sendTime","09:00","version",0));assertThrows(IllegalArgumentException.class,()->weekly.save(Map.of("enabled",true,"weekday",1,"sendTime","09:00","version",0)));}
 @Test void weeklyMondayNineTurkeyAndNoDuplicateAfterRestart(){
  assertEquals("2026-10-19T06:00:00Z",weekly.status().get("nextSendAt"));weekly.tick();assertEquals(0,count("slack_weekly_run"));clock.now=Instant.parse("2026-10-19T06:00:00Z");weekly.tick();assertEquals("SUCCESS",db.queryForObject("SELECT state FROM slack_weekly_run",String.class));assertEquals("2026-10-12",db.queryForObject("SELECT period_start FROM slack_weekly_run",String.class));weekly.start();weekly.tick();verify(transport,times(1)).call(eq("files.completeUploadExternal"),anyString(),anyMap());assertEquals("2026-10-26T06:00:00Z",weekly.status().get("nextSendAt"));
 }
 @Test void manualIsIdempotentAndPreviewDoesNotSend(){weekly.preview();verifyNoInteractions(transport);var request=Map.<String,Object>of("requestId",UUID.randomUUID().toString(),"channelId","COT12345");weekly.manual(request,"admin");weekly.manual(request,"admin");verify(transport,times(1)).call(eq("files.completeUploadExternal"),anyString(),anyMap());assertThrows(IllegalArgumentException.class,()->weekly.manual(Map.of("requestId",UUID.randomUUID().toString(),"channelId","COTHER99"),"admin"));}
 @Test void publicationTimeoutNeverAutomaticallyRetries(){when(transport.call(eq("files.completeUploadExternal"),anyString(),anyMap())).thenThrow(new IllegalStateException());clock.now=Instant.parse("2026-10-19T06:00:00Z");weekly.tick();assertEquals("UNCERTAIN",db.queryForObject("SELECT state FROM slack_weekly_run",String.class));weekly.start();clock.now=clock.now.plusSeconds(600);weekly.tick();verify(transport,times(1)).call(eq("files.completeUploadExternal"),anyString(),anyMap());}
 @Test void publicationJournalFailureCannotBecomeRetryable(){
  var failing=spy(db);ReflectionTestUtils.setField(weekly,"db",failing);String sql="UPDATE slack_weekly_run SET state=?,message=?,updated_at=? WHERE id=?";
  doAnswer(a->{if(Set.of("SUCCESS","UNCERTAIN").contains(a.getArgument(1)))throw new IllegalStateException("DB unavailable");return a.callRealMethod();}).when(failing).update(eq(sql),any(),any(),any(),any());
  clock.now=Instant.parse("2026-10-19T06:00:00Z");assertThrows(IllegalStateException.class,()->weekly.tick());assertEquals("PUBLISHING",db.queryForObject("SELECT state FROM slack_weekly_run",String.class));ReflectionTestUtils.setField(weekly,"db",db);weekly.start();weekly.tick();verify(transport,times(1)).call(eq("files.completeUploadExternal"),anyString(),anyMap());
 }
 @Test void weeklyTotalsRespectDatesActivePeoplePlansSnapshotsAndNoDoubleLeaveDebit(){
  db.update("INSERT INTO member(id,name,title,role,team_role,engagement,active) VALUES('m','<İsa>','','DEVELOPER','DEVELOPER','CORE',TRUE),('inactive','Passive','','DEVELOPER','DEVELOPER','CORE',FALSE)");
  db.update("INSERT INTO sprint(id,number,name,goal,start_date,end_date,status,story_points_available) VALUES('s',1,'Sprint 1','','2026-10-01','2026-10-31','active',FALSE)");
  db.update("INSERT INTO overtime_snapshot VALUES('old','m','s',20,8,12)");
  db.update("INSERT INTO overtime_entry(id,member_id,sprint_id,earned_hours,used_hours,planned_hours,created_at) VALUES('actual','m','s',4,0,0,CURRENT_TIMESTAMP),('plan','m','s',0,0,16,CURRENT_TIMESTAMP),('undated','m','s',2,0,0,CURRENT_TIMESTAMP)");
  db.update("INSERT INTO overtime_request(id,member_id,sprint_id,requester,work_date,hours,reason,status,created_at,entry_id) VALUES('r','m','s','admin','2026-10-17',4,'PRIVATE','APPROVED',CURRENT_TIMESTAMP,'actual'),('pending','m','s','admin','2026-10-17',3,'PRIVATE','PENDING',CURRENT_TIMESTAMP,NULL)");
  db.update("INSERT INTO leave_record(id,member_id,sprint_id,days,precision_label,status,start_on,end_on,leave_type,overtime_hours,overtime_accounting) VALUES('l','m','s',1,'exact','recorded','2026-10-15','2026-10-15','OVERTIME',8,'DEBIT'),('oldLeave','m','s',1,'sprint-level','recorded',NULL,NULL,'OVERTIME',8,'IN_SNAPSHOT'),('annual','m','s',1,'exact','recorded','2026-10-16','2026-10-16','ANNUAL',0,'NONE')");
  var result=report.build(LocalDate.parse("2026-10-12"),clock.now);assertEquals(1,result.people().size());var row=result.people().getFirst();assertEquals(4d,row.get("weeklyHours"));assertEquals(1d,row.get("weeklyDays"));assertEquals(26d,row.get("totalEarned"));assertEquals(2d,row.get("totalDays"));assertEquals(10d,row.get("balanceHours"));assertEquals(3d,row.get("pendingHours"));assertEquals(22d,row.get("undatedHours"));assertTrue(result.html().contains("&lt;İsa&gt;"));assertFalse(result.html().contains("PRIVATE"));assertFalse(result.html().contains("Passive"));
 }
}
