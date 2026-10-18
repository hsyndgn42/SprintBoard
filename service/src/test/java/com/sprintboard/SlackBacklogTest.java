package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import com.fasterxml.jackson.databind.ObjectMapper;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:slackbacklog;DB_CLOSE_DELAY=-1","sprintboard.slack.worker-enabled=false","sprintboard.slack.resolve-names=false","sprintboard.auto-backup.enabled=false"})
@AutoConfigureMockMvc @Transactional @WithMockUser(username="admin",roles="ADMIN")
class SlackBacklogTest {
 @Autowired SlackBacklogService service;@Autowired JdbcTemplate db;@Autowired WorkspaceService w;@Autowired MockMvc mvc;@Autowired ObjectMapper mapper;@Autowired SlackPreviewService preview;@Autowired SlackConfigStore configs;@Autowired BackupService backups;
 static final String TEXT="#backlog\nTür: DEV\nBaşlık: CSV dışa aktarım\nAçıklama: Filtrelenmiş işlerin CSV olarak indirilebilmesi.";
 int serial=0;
 String receive(String text){String ts="1792180000."+(++serial);service.accept("TTEST123","CBACK123",ts,"UTEST123",text,SlackBacklogParser.DEFAULT_TEMPLATE,1);return db.queryForObject("SELECT id FROM slack_backlog_inbox WHERE message_ts=?",String.class,ts);}
 Map<String,Object> approve(){return new HashMap<>(Map.of("action","APPROVE","size","SMALL","estimatedHours",2,"note","QA"));}
 int count(String table){return db.queryForObject("SELECT COUNT(*) FROM "+table,Integer.class);}
 @Test void parserConfigBoldMentionMultilineAndValidation(){
  assertEquals(true,SlackBacklogParser.parse(TEXT,SlackBacklogParser.DEFAULT_TEMPLATE,"CBACK123").get("valid"));
  assertEquals("CSV dışa aktarım",SlackBacklogParser.parse(TEXT.replace("Başlık:","*Başlık:*"),SlackBacklogParser.DEFAULT_TEMPLATE,"CBACK123").get("title"));
  assertEquals(true,SlackBacklogParser.parse(TEXT.replace("#backlog","<#CBACK123|backlog>").replace("Tür: DEV","*Tür:* DEV")+"\nİkinci satır: sonuç",SlackBacklogParser.DEFAULT_TEMPLATE,"CBACK123").get("valid"));
  assertEquals(false,SlackBacklogParser.parse(TEXT+"\nTür: TEST",SlackBacklogParser.DEFAULT_TEMPLATE,"CBACK123").get("valid"));
  for(String type:List.of("DEFECT","DEV,TEST","OTHER"))assertEquals(false,SlackBacklogParser.parse(TEXT.replace("DEV",type),SlackBacklogParser.DEFAULT_TEMPLATE,"CBACK123").get("valid"));
  String narrow=SlackBacklogParser.DEFAULT_TEMPLATE.replace("DEV,DESIGN,ANALYZE,TEST,BAU","DESIGN");
  assertEquals(false,SlackBacklogParser.parse(TEXT,narrow,"CBACK123").get("valid"));
  assertThrows(IllegalArgumentException.class,()->SlackBacklogParser.template(narrow+"\nTür: DEV"));
  assertThrows(IllegalArgumentException.class,()->SlackBacklogParser.template(narrow.replace("DESIGN","INVALID")));
  assertFalse(SlackBacklogParser.parse(TEXT+"\nxoxb-secret-token",SlackBacklogParser.DEFAULT_TEMPLATE,"CBACK123").toString().contains("xoxb-secret-token"));
  assertEquals(false,SlackBacklogParser.parse(TEXT+"x".repeat(12000),SlackBacklogParser.DEFAULT_TEMPLATE,"CBACK123").get("valid"));
 }
 @Test void pendingThenApprovalCreatesExactlyOnePoolItemAndAudit(){
  int before=count("backlog_item"),tasks=count("sprint_task");String id=receive(TEXT);assertEquals(before,count("backlog_item"));assertEquals(1,count("slack_receipt_reaction"));
  service.accept("TTEST123","CBACK123","1792180000.1","UTEST123",TEXT,SlackBacklogParser.DEFAULT_TEMPLATE,1);assertEquals(1,count("slack_backlog_inbox"));
  String roadmap=w.createRoadmap(Map.of("title","QA Roadmap","kind","FEATURE_SET")).get("id").toString();
  var input=approve();input.put("title","Düzeltilen başlık");input.put("roadmapId",roadmap);input.put("reporterName","Forged");
  var result=service.decide(id,input,"admin");String item=result.get("backlogId").toString();var row=db.queryForMap("SELECT * FROM backlog_item WHERE id=?",item);
  assertEquals("Düzeltilen başlık",row.get("TITLE"));assertEquals("Ready",row.get("STATE"));assertEquals(roadmap,row.get("ROADMAP_ID"));assertEquals(2d,((Number)row.get("ESTIMATED_HOURS")).doubleValue());
  assertEquals(before+1,count("backlog_item"));assertEquals(tasks,count("sprint_task"));
  assertThrows(IllegalArgumentException.class,()->service.decide(id,input,"admin"));assertEquals(before+1,count("backlog_item"));
  assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM audit_event WHERE entity_id=? AND action='slack-request-approved'",Integer.class,item));
  assertFalse(db.queryForObject("SELECT detail_json FROM audit_event WHERE entity_id=? AND action='slack-request-approved'",String.class,item).contains("Forged"));
  assertTrue(db.queryForObject("SELECT criteria FROM backlog_item WHERE id=?",String.class,item).contains("https://app.slack.com/client/"));
 }
 @Test void invalidRejectAndFailedApprovalNeverCreateItemOrEraseRequest(){
  String invalid=receive("#backlog\nBaşlık: eksik");assertEquals(0,count("slack_receipt_reaction"));assertThrows(IllegalArgumentException.class,()->service.decide(invalid,approve(),"admin"));
  service.decide(invalid,Map.of("action","REJECT"),"admin");assertEquals(0,count("backlog_item"));
  String id=receive(TEXT);var input=approve();input.put("roadmapId","missing");assertThrows(IllegalArgumentException.class,()->service.decide(id,input,"admin"));assertEquals("PENDING",db.queryForObject("SELECT status FROM slack_backlog_inbox WHERE id=?",String.class,id));
  var negative=approve();negative.put("estimatedHours",-1);assertThrows(IllegalArgumentException.class,()->service.decide(id,negative,"admin"));
  var leave=approve();leave.put("taskCategory","BAU");leave.put("taskSubtype","LEAVE");assertThrows(IllegalArgumentException.class,()->service.decide(id,leave,"admin"));
 }
 @Test void subtypesPointsAndPaginationAreValidated(){
  String id=receive(TEXT.replace("DEV","TEST"));assertThrows(IllegalArgumentException.class,()->service.decide(id,approve(),"admin"));
  var input=approve();input.put("taskSubtype","E2E_TEST");service.decide(id,input,"admin");assertEquals("E2E_TEST",db.queryForObject("SELECT task_subtype FROM backlog_item",String.class));
  for(int i=0;i<21;i++)receive(TEXT);assertEquals(21,service.list("WAITING",0).get("pending"));assertEquals(20,((List<?>)service.list("WAITING",0).get("items")).size());assertEquals(1,((List<?>)service.list("WAITING",1).get("items")).size());
  assertThrows(IllegalArgumentException.class,()->service.list("SQL",-1));
  w.updateSettings(Map.of("estimationMode","POINTS_AND_HOURS"));String pointsId=receive(TEXT);var points=approve();points.put("storyPoints",3);String item=service.decide(pointsId,points,"admin").get("backlogId").toString();assertEquals(3d,db.queryForObject("SELECT story_points FROM backlog_item WHERE id=?",Double.class,item));
 }
 @Test void settingsPersistTemplateAndDistinctChannelWithoutExposingCredentials(){
  var input=new HashMap<String,Object>(Map.of("teamId","TTEST123","channelId","CDEF1234","overtimeChannelId","COT12345","backlogChannelId","CBACK123","backlogTemplate",SlackBacklogParser.DEFAULT_TEMPLATE,"botToken","xoxb-fake-test-12345","appToken","xapp-fake-test-12345"));
  var saved=preview.save(input);assertEquals("CBACK123",saved.get("backlogChannelId"));assertFalse(saved.toString().contains("xoxb-"));
  assertEquals("CBACK123",configs.load("","").backlogChannel());assertEquals(SlackBacklogParser.DEFAULT_TEMPLATE,configs.load("","").backlogTemplate());
  assertThrows(IllegalArgumentException.class,()->preview.save(Map.of("backlogChannelId","CDEF1234")));
  assertThrows(IllegalArgumentException.class,()->preview.save(Map.of("backlogChannelId","COT12345")));
  assertThrows(IllegalArgumentException.class,()->preview.save(Map.of("backlogTemplate","#backlog\nTür: DEFECT")));
 }
 @Test void adminAndCsrfRequiredAndJsonExportRemainsCompatible()throws Exception{
  String id=receive(TEXT);
  mvc.perform(get("/api/admin/slack/backlog-inbox").with(user("member").roles("USER"))).andExpect(status().isForbidden());
  mvc.perform(post("/api/admin/slack/backlog-inbox/"+id+"/decision").with(user("member").roles("USER")).with(csrf()).contentType("application/json").content(mapper.writeValueAsString(approve()))).andExpect(status().isForbidden());
  mvc.perform(post("/api/admin/slack/backlog-inbox/"+id+"/decision").contentType("application/json").content(mapper.writeValueAsString(approve()))).andExpect(status().isForbidden());
  mvc.perform(get("/api/admin/slack/backlog-inbox")).andExpect(status().isOk()).andExpect(jsonPath("$.pending").value(1));
  assertDoesNotThrow(()->backups.preview(mapper.valueToTree(backups.exportData())));
 }
}
