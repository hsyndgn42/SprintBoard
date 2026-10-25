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

class JiraEpicTest {
 @TempDir Path folder;
 JdbcTemplate db; JiraConfigStore configs; JiraTransport transport; JiraEpicService epics; JiraSettingsService settings;
 ObjectMapper mapper=new ObjectMapper();
 Clock clock=Clock.fixed(Instant.parse("2026-10-26T09:00:00Z"),ZoneOffset.UTC);

 @BeforeEach void setup(){
  var ds=new DriverManagerDataSource("jdbc:h2:mem:jira-epic-"+UUID.randomUUID()+";DB_CLOSE_DELAY=-1","sa","");
  Flyway.configure().dataSource(ds).load().migrate();
  db=new JdbcTemplate(ds);
  configs=new JiraConfigStore(db,new JiraSecretVault("",folder.resolve("key").toString()));
  transport=mock(JiraTransport.class);
  epics=new JiraEpicService(db,configs,transport,mapper,clock);
  settings=new JiraSettingsService(configs,transport,db,mapper,clock);
 }

 void enableIntegration(){
  var input=new LinkedHashMap<String,Object>();
  input.put("baseUrl","https://jira.local");input.put("projectKey","VBCRF");input.put("boardId","");
  input.put("defectJql","");input.put("fieldDefaults","");input.put("enabled",true);input.put("version",0);input.put("pat","secret-pat");
  settings.save(input);
 }

 void roadmap(String id,String title,String description,String priority){
  db.update("INSERT INTO roadmap_item(id,title,description,status,created_at,item_kind,priority) VALUES(?,?,?,'active',CURRENT_TIMESTAMP,'PROJECT',?)",id,title,description,priority);
 }

 JsonNode created(String key,long id)throws Exception{return mapper.readTree("{\"key\":\""+key+"\",\"id\":"+id+"}");}

 @Test void opensAnEpicAndRemembersBothTheKeyAndTheNumericId()throws Exception{
  enableIntegration();
  roadmap("roadmap-1","Migration Platform Development","Migration isleri","HIGH");
  when(transport.post(anyString(),eq("secret-pat"),eq("/rest/api/2/issue"),any())).thenReturn(created("VBCRF-900",4992800L));

  var result=epics.create("roadmap-1");

  assertEquals("VBCRF-900",result.get("jiraEpicKey"));
  assertEquals("VBCRF-900",db.queryForObject("SELECT jira_epic_key FROM roadmap_item WHERE id='roadmap-1'",String.class));
  var link=db.queryForMap("SELECT state,jira_issue_id,jira_issue_key FROM jira_issue_link WHERE local_id='roadmap-1'");
  assertEquals("SENT",link.get("state"));
  assertEquals(4992800L,((Number)link.get("jira_issue_id")).longValue());
 }

 @Test void sendsEpicNameSeparatelyAndMapsRoadmapPriorityToJiraPriority()throws Exception{
  enableIntegration();
  roadmap("roadmap-1","Czech VIBE Requirement Analyze","","CRITICAL");
  when(transport.post(anyString(),anyString(),anyString(),any())).thenReturn(created("VBCRF-901",1L));

  epics.create("roadmap-1");

  var body=ArgumentCaptor.forClass(JsonNode.class);
  verify(transport).post(anyString(),anyString(),eq("/rest/api/2/issue"),body.capture());
  var fields=body.getValue().path("fields");
  assertEquals("Czech VIBE Requirement Analyze",fields.path("summary").asText());
  assertEquals("Czech VIBE Requirement Analyze",fields.path("customfield_12874").asText());
  assertEquals("238",fields.path("issuetype").path("id").asText());
  assertEquals("VBCRF",fields.path("project").path("key").asText());
  assertEquals("2",fields.path("priority").path("id").asText());
  assertFalse(fields.path("description").asText().isBlank());
 }

 @Test void refusesASecondEpicForTheSameRoadmap()throws Exception{
  enableIntegration();
  roadmap("roadmap-1","Tek epic","aciklama","NORMAL");
  when(transport.post(anyString(),anyString(),anyString(),any())).thenReturn(created("VBCRF-902",2L));
  epics.create("roadmap-1");

  assertThrows(IllegalArgumentException.class,()->epics.create("roadmap-1"));
  verify(transport,times(1)).post(anyString(),anyString(),anyString(),any());
 }

 @Test void aFailedAttemptIsRecordedAndCanBeRetried()throws Exception{
  enableIntegration();
  roadmap("roadmap-1","Yeniden denenecek","aciklama","NORMAL");
  when(transport.post(anyString(),anyString(),anyString(),any()))
    .thenThrow(new IllegalStateException("Jira isteği reddetti — customfield_12874: Epic Name is required"))
    .thenReturn(created("VBCRF-903",3L));

  assertThrows(IllegalStateException.class,()->epics.create("roadmap-1"));
  var failed=db.queryForMap("SELECT state,attempts,last_error FROM jira_issue_link WHERE local_id='roadmap-1'");
  assertEquals("FAILED",failed.get("state"));
  assertEquals(1,((Number)failed.get("attempts")).intValue());
  assertTrue(String.valueOf(failed.get("last_error")).contains("Epic Name"));

  assertEquals("VBCRF-903",epics.create("roadmap-1").get("jiraEpicKey"));
  assertEquals("SENT",db.queryForObject("SELECT state FROM jira_issue_link WHERE local_id='roadmap-1'",String.class));
 }

 @Test void refusesWhileTheIntegrationIsOff(){
  roadmap("roadmap-1","Kapali entegrasyon","aciklama","NORMAL");
  assertThrows(IllegalArgumentException.class,()->epics.create("roadmap-1"));
  verifyNoInteractions(transport);
 }

 @Test void refusesAnUnknownRoadmap(){
  enableIntegration();
  assertThrows(IllegalArgumentException.class,()->epics.create("roadmap-yok"));
 }

 @Test void fallsBackToBuiltInDefaultsWhenTheSavedJsonPredatesAKey()throws Exception{
  enableIntegration();
  var stored=settings.status();
  var input=new LinkedHashMap<String,Object>();
  input.put("baseUrl","https://jira.local");input.put("projectKey","VBCRF");input.put("boardId","");
  input.put("defectJql","");input.put("fieldDefaults","{\"sizePoints\":{\"SMALL\":1}}");
  input.put("enabled",true);input.put("version",stored.get("version"));input.put("pat","");
  settings.save(input);
  roadmap("roadmap-1","Eski ayar","aciklama","LOW");
  when(transport.post(anyString(),anyString(),anyString(),any())).thenReturn(created("VBCRF-904",4L));

  epics.create("roadmap-1");

  var body=ArgumentCaptor.forClass(JsonNode.class);
  verify(transport).post(anyString(),anyString(),anyString(),body.capture());
  var fields=body.getValue().path("fields");
  assertEquals("238",fields.path("issuetype").path("id").asText());
  assertEquals("4",fields.path("priority").path("id").asText());
  assertEquals("Eski ayar",fields.path("customfield_12874").asText());
 }
}
