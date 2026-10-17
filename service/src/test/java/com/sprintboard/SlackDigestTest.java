package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.test.util.ReflectionTestUtils;

class SlackDigestTest {
 JdbcTemplate db;SlackDigestService service;SlackTransport slack;SlackConfigStore secrets;SprintDigestSnapshot snapshots;ObjectMapper mapper=new ObjectMapper();
 static class TestClock extends Clock {Instant now=Instant.parse("2026-10-18T04:59:00Z");public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId z){return this;}public Instant instant(){return now;}}
 TestClock clock;
 @BeforeEach void setup(){
  var ds=new DriverManagerDataSource("jdbc:h2:mem:digest"+UUID.randomUUID()+";DB_CLOSE_DELAY=-1","sa","");new ResourceDatabasePopulator(new ClassPathResource("db/migration/V41__slack_sprint_digest.sql")).execute(ds);db=new JdbcTemplate(ds);
  db.execute("CREATE TABLE audit_event(occurred_at TIMESTAMP,entity_type VARCHAR,entity_id VARCHAR,action VARCHAR,detail_json CLOB)");
  slack=mock(SlackTransport.class);secrets=mock(SlackConfigStore.class);snapshots=mock(SprintDigestSnapshot.class);clock=new TestClock();
  when(secrets.load(anyString(),anyString())).thenReturn(new SlackConfigStore.Config("T123456","CDEFECT", "","encrypted","",false,1));when(secrets.decrypt("encrypted")).thenReturn("fake-bot");
  when(snapshots.build(any(),any())).thenAnswer(a->new SprintDigestSnapshot.Snapshot(a.getArgument(0)==null?"active":a.getArgument(0),"Sprint 16",16,"Snapshot","<html>Review</html>"));
  when(slack.call(eq("auth.test"),anyString(),anyMap())).thenReturn(mapper.valueToTree(Map.of("ok",true,"team_id","T123456","bot_id","B123")));
  when(slack.call(eq("files.getUploadURLExternal"),anyString(),anyMap())).thenReturn(mapper.valueToTree(Map.of("ok",true,"file_id","F123","upload_url","https://files.slack.com/upload/abc")));
  when(slack.call(eq("files.completeUploadExternal"),anyString(),anyMap())).thenReturn(mapper.valueToTree(Map.of("ok",true)));
  service=new SlackDigestService(db,slack,secrets,snapshots,mapper,clock);ReflectionTestUtils.setField(service,"fallbackTeam","T123456");ReflectionTestUtils.setField(service,"schedulerEnabled",true);service.start();
 }
 void enable(boolean weekends){service.save(Map.of("enabled",true,"channelId","C0CA4QFAU49","sendTime","08:00","weekends",weekends,"version",1));}
 String state(){return db.queryForObject("SELECT state FROM slack_digest_run ORDER BY created_at DESC LIMIT 1",String.class);}
 @Test void dailyTurkeyTimeAndRestartAndManualSelectedSprint(){
  enable(true);service.tick();assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM slack_digest_run",Integer.class));
  clock.now=Instant.parse("2026-10-18T05:00:00Z");service.tick();assertEquals("SUCCESS",state());service.tick();service.start();service.tick();verify(slack,times(1)).call(eq("files.completeUploadExternal"),anyString(),anyMap());
  String request=UUID.randomUUID().toString();service.manual("closed-sprint",request,"admin");service.manual("closed-sprint",request,"admin");verify(snapshots).build(eq("closed-sprint"),any());verify(slack,times(2)).call(eq("files.completeUploadExternal"),anyString(),anyMap());
  verify(slack,times(2)).call(eq("files.completeUploadExternal"),anyString(),argThat(m->m.get("channel_id").equals("C0CA4QFAU49")&&!m.containsKey("initial_comment")&&m.get("blocks").contains("Snapshot")&&m.get("files").contains("F123")));
 }
 @Test void weekendDisabledNoBackfillAndPaused(){enable(false);clock.now=Instant.parse("2026-10-18T08:00:00Z");service.tick();verifyNoInteractions(slack);assertEquals("2026-10-19T05:00:00Z",service.status().get("nextSendAt"));clock.now=Instant.parse("2026-10-19T11:00:00Z");service.tick();assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM slack_digest_run",Integer.class));assertEquals("SUCCESS",state());}
 @Test void noActiveSprintSkippedAndNoExternalWrite(){enable(true);when(snapshots.build(isNull(),any())).thenReturn(null);clock.now=Instant.parse("2026-10-18T05:00:00Z");service.tick();assertEquals("SKIPPED",state());service.tick();verifyNoInteractions(slack);}
 @Test void prepublishFailuresRetryAtMostThree(){enable(true);when(slack.call(eq("files.getUploadURLExternal"),anyString(),anyMap())).thenThrow(new IllegalStateException("Eksik files:write"));for(int i=0;i<8;i++){clock.now=Instant.parse("2026-10-18T05:00:00Z").plusSeconds(i*301);service.tick();}assertEquals("FAILED",state());assertEquals(3,db.queryForObject("SELECT attempts FROM slack_digest_run",Integer.class));verify(slack,never()).call(eq("files.completeUploadExternal"),anyString(),anyMap());}
 @Test void ambiguousPublicationNeverRetriedEvenAfterRestart(){enable(true);when(slack.call(eq("files.completeUploadExternal"),anyString(),anyMap())).thenThrow(new IllegalStateException("Network timeout"));clock.now=Instant.parse("2026-10-18T05:00:00Z");service.tick();assertEquals("UNCERTAIN",state());service.start();clock.now=clock.now.plusSeconds(600);service.tick();verify(slack,times(1)).call(eq("files.completeUploadExternal"),anyString(),anyMap());}
 @Test void interruptedPublicationRecoveredAndBoundedHistory(){enable(true);clock.now=Instant.parse("2026-10-18T05:00:00Z");service.tick();db.update("UPDATE slack_digest_run SET state='PUBLISHING'");service.start();assertEquals("UNCERTAIN",state());for(int i=0;i<11;i++)service.manual("s1",UUID.randomUUID().toString(),"admin");assertEquals(10,((List<?>)service.status().get("history")).size());assertFalse(service.status().toString().contains("fake-bot"));}
 @Test void invalidSettingsAndOptimisticConflictAndPreviewNoSend(){assertThrows(IllegalArgumentException.class,()->service.save(Map.of("channelId","https://evil","sendTime","08:00")));enable(true);assertThrows(IllegalArgumentException.class,()->enable(true));assertNotNull(service.preview("s1"));verifyNoInteractions(slack);}
 @Test void wrongTeamAndMissingCredentialsCannotPublish(){when(secrets.decrypt("encrypted")).thenReturn("");service.manual("s1",UUID.randomUUID().toString(),"admin");assertEquals("FAILED",state());verifyNoInteractions(slack);when(secrets.decrypt("encrypted")).thenReturn("fake");when(slack.call(eq("auth.test"),anyString(),anyMap())).thenReturn(mapper.valueToTree(Map.of("team_id","TWRONG","bot_id","B1")));clock.now=clock.now.plusSeconds(1);service.manual("s1",UUID.randomUUID().toString(),"admin");assertEquals("FAILED",state());verify(slack,never()).upload(anyString(),any());}
 @Test void uploadUrlRejectsUntrustedDestinations(){for(String url:List.of("http://files.slack.com/upload/x","https://files.slack.com.evil.com/upload/x","https://user@files.slack.com/upload/x","https://127.0.0.1/upload/x","https://files.slack.com/other","https://files.slack.com:999/upload/x"))assertThrows(IllegalStateException.class,()->SlackTransport.uploadUri(url));assertEquals("files.slack.com",SlackTransport.uploadUri("https://files.slack.com/upload/abc").getHost());}
 @Test void failedJournalAfterPublishingCannotBecomeRetryable(){
  enable(true);var failing=spy(db);ReflectionTestUtils.setField(service,"db",failing);
  String sql="UPDATE slack_digest_run SET state=?,message=?,updated_at=? WHERE id=?";
  doAnswer(a->{if(Set.of("SUCCESS","UNCERTAIN").contains(a.getArgument(1)))throw new IllegalStateException("DB unavailable");return a.callRealMethod();}).when(failing).update(eq(sql),any(),any(),any(),any());
  clock.now=Instant.parse("2026-10-18T05:00:00Z");assertThrows(IllegalStateException.class,()->service.tick());assertEquals("PUBLISHING",state());
  ReflectionTestUtils.setField(service,"db",db);service.start();clock.now=clock.now.plusSeconds(600);service.tick();assertEquals("UNCERTAIN",state());verify(slack,times(1)).call(eq("files.completeUploadExternal"),anyString(),anyMap());
 }
 @Test void reviewNumbersPrivacyAndEscaping(){
  var task=new LinkedHashMap<String,Object>(Map.of("name","<script>alert(1)</script>","taskCategory","DEV","status","done","estimatedHours",16,"assignments",List.of(Map.of("memberName","İsa","estimatedHours",16)),"size","MEDIUM"));
  var leave=Map.<String,Object>of("name","Private sick reason","workKind","LEAVE","taskCategory","BAU","status","todo","assignments",List.of(Map.of("memberName","Private person","leaveDays",5)));
  var defect=Map.<String,Object>of("name","Private defect description","taskCategory","DEFECT","taskSubtype","TEST_DEFECT","status","doing","reserveTaskId","reserve");
  var sprint=Map.<String,Object>of("id","s1","number",1,"name","Sprint 1","items",List.of(task,leave,defect));
  var caps=List.<Map<String,Object>>of(Map.of("supportMember",false,"availableHours",80,"plannedHours",88),Map.of("supportMember",true,"memberId","support","memberName","Support person","plannedHours",16,"availableHours",100));
  var entries=List.<Map<String,Object>>of(Map.of("sprintId","s1","plannedHours",16,"planActualHours",20),Map.of("sprintId","s1","earnedHours",20,"planClassification","PLANNED"),Map.of("sprintId","s1","earnedHours",3,"planClassification","UNPLANNED"),Map.of("sprintId","other","earnedHours",1000));
  var result=SprintDigestSnapshot.render(sprint,caps,List.of(),Map.of("estimationMode","SIZE_AND_HOURS"),List.of(),entries,clock.now);
  assertTrue(result.summary().contains("1 / 2 Done"));assertTrue(result.summary().contains("80 / 88 sa"));assertTrue(result.summary().contains("23 sa gerçekleşen"));assertTrue(result.html().contains("&lt;script&gt;"));assertFalse(result.html().contains("<script>"));assertFalse(result.html().contains("Private sick reason"));assertFalse(result.html().contains("Private person"));assertFalse(result.html().contains("Private defect description"));assertTrue(result.html().contains("TEST DEFECT"));assertTrue(result.html().contains("Defect Support kapsamında: 1 iş"));assertTrue(result.html().contains("Planı aşan"));assertTrue(result.html().contains("MEDIUM · 1 iş"));
 }
 @Test void cardFieldsArePairedBoundedAndSafePlainText()throws Exception{
  var tasks=List.<Map<String,Object>>of(Map.of("taskCategory","DEV","status","done"),Map.of("taskCategory","DEFECT","taskSubtype","TEST_DEFECT","status","doing"));
  var blocks=mapper.valueToTree(SlackDigestPresentation.blocks("<@everyone>"+"a".repeat(200),"18.10.2026 08:00",tasks,1,832,808,136,6,0));
  assertTrue(blocks.get(0).path("text").path("text").asText().length()<=150);assertEquals("plain_text",blocks.get(0).path("text").path("type").asText());
  assertEquals(6,blocks.get(3).path("fields").size());assertEquals(2,blocks.get(5).path("fields").size());assertTrue(blocks.toString().contains("832 / 808 sa"));assertTrue(blocks.toString().contains("50%"));assertTrue(blocks.toString().contains("0 çözülen · 1 açık"));assertFalse(blocks.toString().contains("mrkdwn"));
 }
 @Test void personHoursAndLeavesAreSprintScopedAndNoPrivateNotes(){
  var history=List.<Map<String,Object>>of(Map.of("sprintNumber",16,"memberId","i","memberName","İsa","earnedHours",2,"note","PRIVATE"),Map.of("sprintNumber",15,"memberId","i","memberName","İsa","earnedHours",999));
  var entries=List.<Map<String,Object>>of(Map.of("sprintId","s16","memberId","i","memberName","İsa","earnedHours",4,"plannedHours",8),Map.of("sprintId","s16","memberId","e","memberName","<Elçim>","earnedHours",3),Map.of("sprintId","s15","memberId","e","earnedHours",777));
  String html=SlackDigestPresentation.overtimePeople(16,"s16",history,entries);assertTrue(html.contains("İsa"));assertTrue(html.contains("6 sa"));assertTrue(html.contains("9 sa"));assertTrue(html.contains("8 sa"));assertTrue(html.contains("&lt;Elçim&gt;"));assertFalse(html.contains("999"));assertFalse(html.contains("777"));assertFalse(html.contains("PRIVATE"));
  String leaves=SlackDigestPresentation.leaves(List.of(Map.of("memberName","İsa","leaveDays",1,"note","PRIVATE"),Map.of("memberName","Görkem","leaveDays",1.5),Map.of("memberName","Not on leave","leaveDays",0,"nonWorkingDays",2)));
  assertTrue(leaves.contains("İsa"));assertTrue(leaves.contains("1,5 gün"));assertTrue(leaves.contains("2,5 kişi-gün"));assertFalse(leaves.contains("Not on leave"));assertFalse(leaves.contains("PRIVATE"));assertTrue(SlackDigestPresentation.leaves(List.of()).contains("izin yok"));assertTrue(SlackDigestPresentation.overtimePeople(16,"s16",List.of(),List.of()).contains("mesai yok"));
 }
}
