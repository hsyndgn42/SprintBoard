package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import java.time.*;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class JiraPbiTest {
 @TempDir Path folder;
 JdbcTemplate db; JiraConfigStore configs; JiraTransport transport; JiraOutbox outbox; JiraPbiService pbi; JiraSettingsService settings;
 ObjectMapper mapper=new ObjectMapper();
 Clock clock=Clock.fixed(Instant.parse("2026-10-26T09:00:00Z"),ZoneOffset.UTC);

 @BeforeEach void setup()throws Exception{
  var ds=new DriverManagerDataSource("jdbc:h2:mem:jira-pbi-"+UUID.randomUUID()+";DB_CLOSE_DELAY=-1","sa","");
  Flyway.configure().dataSource(ds).load().migrate();
  db=new JdbcTemplate(ds);
  configs=new JiraConfigStore(db,new JiraSecretVault("",folder.resolve("key").toString()));
  transport=mock(JiraTransport.class);
  outbox=new JiraOutbox(db,configs,clock);
  pbi=new JiraPbiService(db,configs,transport,mapper,clock);
  settings=new JiraSettingsService(configs,transport,db,mapper,clock);
  when(transport.post(anyString(),anyString(),anyString(),any())).thenReturn(created("VBCRF-1001",9001L));
 }

 void enableIntegration(){
  var input=new LinkedHashMap<String,Object>();
  input.put("baseUrl","https://jira.local");input.put("projectKey","VBCRF");input.put("boardId","");
  input.put("defectJql","");input.put("fieldDefaults","");input.put("enabled",true);input.put("version",0);input.put("pat","secret-pat");
  settings.save(input);
 }

 void backlogItem(String id,String roadmapId,String category,String size,Double points){
  var subtype="DEFECT".equals(category)?"PROD_DEFECT":"BAU".equals(category)?"SUPPORT":null;
  db.update("INSERT INTO backlog_item(id,roadmap_id,title,criteria,work_kind,type,state,estimated_hours,story_points,created_at,size_code,task_category,task_subtype,priority) "
    +"VALUES(?,?,'Fatura ekranı','Kabul kriteri','FEATURE','DEV','POOL',8,?,CURRENT_TIMESTAMP,?,?,?,'HIGH')",id,roadmapId,points,size,category,subtype);
 }
 void roadmapWithEpic(String id,String epicKey){
  db.update("INSERT INTO roadmap_item(id,title,description,status,created_at,item_kind,priority,jira_epic_key) VALUES(?,'Hedef','x','active',CURRENT_TIMESTAMP,'PROJECT','NORMAL',?)",id,epicKey);
 }
 JsonNode created(String key,long id)throws Exception{return mapper.readTree("{\"key\":\""+key+"\",\"id\":"+id+"}");}
 String state(String backlogId){return db.queryForObject("SELECT state FROM jira_issue_link WHERE local_id=?",String.class,backlogId);}

 @Test void aQueuedItemBecomesAPbiCarryingTheEpicLinkAndStoryPoints()throws Exception{
  enableIntegration();
  roadmapWithEpic("roadmap-1","VBCRF-4");
  backlogItem("backlog-1","roadmap-1","DEV","MEDIUM",null);
  outbox.enqueueBacklog("backlog-1");

  assertTrue(pbi.sendNext());

  assertEquals("SENT",state("backlog-1"));
  assertEquals("VBCRF-1001",db.queryForObject("SELECT jira_issue_key FROM jira_issue_link WHERE local_id='backlog-1'",String.class));
  var body=ArgumentCaptor.forClass(JsonNode.class);
  verify(transport).post(anyString(),anyString(),eq("/rest/api/2/issue"),body.capture());
  var fields=body.getValue().path("fields");
  assertEquals("11500",fields.path("issuetype").path("id").asText());
  assertEquals("VBCRF-4",fields.path("customfield_12873").asText());
  assertEquals(3,fields.path("customfield_10663").asInt());
  assertEquals("30023",fields.path("customfield_17670").path("id").asText());
  assertEquals("10000",fields.path("priority").path("id").asText());
  assertEquals("RRCA-11438",fields.path("customfield_32981").get(0).path("key").asText());
 }

 @Test void anExplicitStoryPointEstimateWinsOverTheSizeMapping()throws Exception{
  enableIntegration();
  roadmapWithEpic("roadmap-1","VBCRF-4");
  backlogItem("backlog-1","roadmap-1","DEFECT","SMALL",13d);
  outbox.enqueueBacklog("backlog-1");
  pbi.sendNext();

  var body=ArgumentCaptor.forClass(JsonNode.class);
  verify(transport).post(anyString(),anyString(),anyString(),body.capture());
  assertEquals(13,body.getValue().path("fields").path("customfield_10663").asInt());
  assertEquals("30025",body.getValue().path("fields").path("customfield_17670").path("id").asText());
 }

 @Test void withoutAnEpicTheItemIsBlockedInsteadOfSentWithAGuess(){
  enableIntegration();
  db.update("INSERT INTO roadmap_item(id,title,description,status,created_at,item_kind,priority) VALUES('roadmap-1','Hedef','x','active',CURRENT_TIMESTAMP,'PROJECT','NORMAL')");
  backlogItem("backlog-1","roadmap-1","DEV","SMALL",null);
  outbox.enqueueBacklog("backlog-1");

  pbi.sendNext();

  assertEquals("BLOCKED",state("backlog-1"));
  assertTrue(db.queryForObject("SELECT last_error FROM jira_issue_link WHERE local_id='backlog-1'",String.class).contains("epic"));
  verifyNoInteractions(transport);
 }

 @Test void movingWorkBetweenSprintsNeverOpensASecondPbi()throws Exception{
  enableIntegration();
  roadmapWithEpic("roadmap-1","VBCRF-4");
  backlogItem("backlog-1","roadmap-1","DEV","SMALL",null);
  outbox.enqueueBacklog("backlog-1");
  pbi.sendNext();

  outbox.enqueueBacklog("backlog-1");
  assertFalse(pbi.sendNext());

  assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM jira_issue_link WHERE local_id='backlog-1'",Integer.class));
  verify(transport,times(1)).post(anyString(),anyString(),anyString(),any());
  assertThrows(IllegalArgumentException.class,()->outbox.retry("backlog-1"));
 }

 @Test void nothingIsQueuedWhileTheIntegrationIsOff(){
  roadmapWithEpic("roadmap-1","VBCRF-4");
  backlogItem("backlog-1","roadmap-1","DEV","SMALL",null);
  outbox.enqueueBacklog("backlog-1");
  assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM jira_issue_link",Integer.class));
  assertFalse(pbi.sendNext());
 }

 @Test void aRejectedPayloadStopsAndWaitsForAPersonWhileATransientFailureRetriesItself()throws Exception{
  enableIntegration();
  roadmapWithEpic("roadmap-1","VBCRF-4");
  backlogItem("backlog-1","roadmap-1","DEV","SMALL",null);
  backlogItem("backlog-2","roadmap-1","DEV","SMALL",null);
  when(transport.post(anyString(),anyString(),anyString(),any()))
    .thenThrow(new JiraTransport.Rejected("customfield_27228: Business Value is required"))
    .thenThrow(new IllegalStateException("Bağlantı kurulamadı"))
    .thenReturn(created("VBCRF-1002",9L));

  outbox.enqueueBacklog("backlog-1");
  pbi.sendNext();
  assertEquals("FAILED",state("backlog-1"));

  outbox.enqueueBacklog("backlog-2");
  pbi.sendNext();
  assertEquals("PENDING",state("backlog-2"));
  assertNotNull(db.queryForObject("SELECT next_attempt_at FROM jira_issue_link WHERE local_id='backlog-2'",String.class));
  // The retry is scheduled for later, so the queue stays quiet until then.
  assertFalse(pbi.sendNext());

  outbox.retry("backlog-1");
  assertEquals("PENDING",state("backlog-1"));
  pbi.sendNext();
  assertEquals("SENT",state("backlog-1"));
 }

 @Test void startingASprintQueuesEverythingPlannedIntoItWithoutDuplicating()throws Exception{
  enableIntegration();
  roadmapWithEpic("roadmap-1","VBCRF-4");
  backlogItem("backlog-1","roadmap-1","DEV","SMALL",null);
  backlogItem("backlog-2","roadmap-1","BAU","SMALL",null);
  db.update("INSERT INTO sprint(id,number,name,goal,start_date,end_date,status,story_points_available) VALUES('sprint-17',17,'Sprint 17','Hedef','2026-10-26','2026-11-08','planned',TRUE)");
  db.update("INSERT INTO sprint_task(id,sprint_id,backlog_id,title,criteria,type,work_kind,status,task_category,task_subtype) VALUES('task-1','sprint-17','backlog-1','Fatura ekranı','Kriter','DEV','FEATURE','todo','DEV',NULL)");
  db.update("INSERT INTO sprint_task(id,sprint_id,backlog_id,title,criteria,type,work_kind,status,task_category,task_subtype) VALUES('task-2','sprint-17','backlog-2','BAU','Kriter','DEV','FEATURE','todo','BAU','SUPPORT')");
  outbox.enqueueBacklog("backlog-1");

  outbox.enqueueSprint("sprint-17");

  assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM jira_issue_link WHERE local_id='backlog-1'",Integer.class));
  assertEquals("PENDING",state("backlog-2"));
 }

 @Test void deletingLocalWorkDropsTheLinkWithoutDeletingTheJiraIssue()throws Exception{
  enableIntegration();
  roadmapWithEpic("roadmap-1","VBCRF-4");
  backlogItem("backlog-1","roadmap-1","DEV","SMALL",null);
  outbox.enqueueBacklog("backlog-1");
  pbi.sendNext();

  outbox.forgetBacklog("backlog-1");

  assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM jira_issue_link WHERE local_id='backlog-1'",Integer.class));
  verify(transport,never()).post(anyString(),anyString(),contains("/issue/"),any());
 }
}
