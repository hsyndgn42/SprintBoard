package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import java.util.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import com.fasterxml.jackson.databind.ObjectMapper;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:slackcorrections;DB_CLOSE_DELAY=-1","sprintboard.slack.worker-enabled=false","sprintboard.slack.resolve-names=false","sprintboard.auto-backup.enabled=false"})
@AutoConfigureMockMvc @Transactional @WithMockUser(username="admin",roles="ADMIN")
class SlackMessageCorrectionTest {
 @Autowired SlackMessageCorrectionService service;@Autowired SlackBacklogService backlog;@Autowired SlackInboxService defect;@Autowired JdbcTemplate db;@Autowired ObjectMapper mapper;@Autowired MockMvc mvc;
 String table(boolean b){return b?"slack_backlog_inbox":"slack_inbox";}
 String endpoint(boolean b){return "/api/admin/slack/"+(b?"backlog-inbox":"inbox");}
 String text(boolean b){return b?"#backlog\nTür: DEV\nBaşlık: Düzeltilmiş iş\nAçıklama: CSV ihtiyacı":"#defect\nTür: TEST\nBaşlık: Düzeltilmiş defect\nOrtam: SAT\nÖnem: HIGH\nHedef: BACKLOG";}
 String receive(boolean b,String raw){if(b)backlog.accept("TQA","CQA","1.1","UQA",raw,SlackBacklogParser.DEFAULT_TEMPLATE,1);else defect.accept("TQA","CQA","1.1","UQA",raw,SlackDefectParser.DEFAULT_TEMPLATE,1);return db.queryForObject("SELECT id FROM "+table(b),String.class);}
 @SuppressWarnings("unchecked") Map<String,Object> row(boolean b){return ((List<Map<String,Object>>)(b?backlog.list("ALL",0):defect.list("ALL",0)).get("items")).getFirst();}
 Map<String,Object> input(boolean b,String text){return Map.of("text",text,"fingerprint",row(b).get("fingerprint"));}
 Map<String,Object> approve(boolean b,String id,Map<String,Object> input){return b?backlog.decide(id,input,"admin"):defect.decide(id,input,"admin");}
 int count(String t){return db.queryForObject("SELECT COUNT(*) FROM "+t,Integer.class);}
 @ParameterizedTest @ValueSource(booleans={true,false}) void invalidCorrectionPreservesSourceAndNeedsSeparateApproval(boolean b){
  String original=b?"#backlog\nTür: WRONG":"#defect\nOrtam: ADSAT",id=receive(b,original);int before=count("backlog_item");
  db.update("UPDATE "+table(b)+" SET reporter_name='Original Sender'");
  var request=new HashMap<>(input(b,text(b)));request.put("userId","forged");request.put("reporterName","forged");service.correct(b,id,request,"admin");
  var p=row(b);assertEquals("PENDING",p.get("status"));assertEquals(original,p.get("originalRaw"));assertEquals(text(b),p.get("raw"));assertEquals("UQA",p.get("userId"));assertEquals("Original Sender",p.get("reporterName"));assertEquals(before,count("backlog_item"));assertEquals(0,count("sprint_task"));assertEquals(1,count("slack_receipt_reaction"));
  String audit=db.queryForObject("SELECT detail_json FROM audit_event WHERE entity_id=? AND action='CORRECTED'",String.class,id);assertTrue(audit.contains("before"));assertTrue(audit.contains("after"));assertTrue(audit.contains("admin"));assertFalse(audit.contains("forged"));
  var approval=Map.<String,Object>of("action","APPROVE","size","SMALL","estimatedHours",2,"fingerprint",p.get("fingerprint"));var added=approve(b,id,approval);assertEquals(before+1,count("backlog_item"));
  if(!b)assertEquals("Original Sender",db.queryForObject("SELECT reporter_name FROM defect_detail WHERE backlog_id=?",String.class,added.get("backlogId")));
  assertThrows(IllegalArgumentException.class,()->approve(b,id,approval));assertThrows(IllegalArgumentException.class,()->service.correct(b,id,input(b,text(b)),"admin"));assertEquals(before+1,count("backlog_item"));
 }
 @ParameterizedTest @ValueSource(booleans={true,false}) void invalidStaleAndRejectedCannotChangeOrCreate(boolean b){
  String id=receive(b,text(b));var initial=input(b,text(b));
  assertThrows(IllegalArgumentException.class,()->service.correct(b,id,input(b,"#wrong"),"admin"));
  assertThrows(IllegalArgumentException.class,()->service.correct(b,id,input(b,"x".repeat(12001)),"admin"));
  assertEquals(text(b),row(b).get("raw"));service.correct(b,id,input(b,text(b).replace("Düzeltilmiş","Yeni")),"admin");
  assertThrows(IllegalArgumentException.class,()->service.correct(b,id,initial,"admin"));
  assertThrows(IllegalArgumentException.class,()->approve(b,id,Map.of("action","APPROVE","size","SMALL")));
  assertThrows(IllegalArgumentException.class,()->approve(b,id,Map.of("action","APPROVE","size","SMALL","fingerprint",initial.get("fingerprint"))));
  service.correct(b,id,input(b,text(b)),"admin");assertEquals(1,count("slack_receipt_reaction"));assertEquals(0,count("backlog_item"));
  approve(b,id,Map.of("action","REJECT","fingerprint",row(b).get("fingerprint")));assertThrows(IllegalArgumentException.class,()->service.correct(b,id,input(b,text(b)),"admin"));assertEquals(0,count("backlog_item"));
 }
 @ParameterizedTest @ValueSource(booleans={true,false}) void correctionUsesConfiguredTemplateAndApprovalStillValidates(boolean b){
  String id=receive(b,"#wrong");
  db.update("INSERT INTO slack_config(id,team_id,channel_id,template,bot_secret,app_secret,enabled,version,backlog_template) VALUES(1,'TQA','CQA',?,'','',FALSE,7,?)",SlackDefectParser.DEFAULT_TEMPLATE.replace("TEST,PROD","PROD"),SlackBacklogParser.DEFAULT_TEMPLATE.replace("DEV,DESIGN,ANALYZE,TEST,BAU","DESIGN"));
  assertThrows(IllegalArgumentException.class,()->service.correct(b,id,input(b,text(b)),"admin"));
  service.correct(b,id,input(b,text(b).replace(b?"Tür: DEV":"Tür: TEST",b?"Tür: DESIGN":"Tür: PROD")),"admin");assertEquals(7,row(b).get("correctionConfigVersion"));
  assertThrows(IllegalArgumentException.class,()->approve(b,id,Map.of("action","APPROVE","fingerprint",row(b).get("fingerprint"))));
  if(!b)assertThrows(IllegalArgumentException.class,()->approve(false,id,Map.of("action","APPROVE","fingerprint",row(false).get("fingerprint"),"target","SPRINT","sprintId","missing","confirmed",true,"size","SMALL")));
  assertEquals(0,count("backlog_item"));assertEquals("PENDING",row(b).get("status"));
 }
 @ParameterizedTest @ValueSource(booleans={true,false}) void endpointRequiresAdminAndCsrf(boolean b)throws Exception{
  String id=receive(b,"#wrong"),url=endpoint(b)+"/"+id+"/correction",body=mapper.writeValueAsString(input(b,text(b)));
  mvc.perform(post(url).with(user("member").roles("USER")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isForbidden());
  mvc.perform(post(url).contentType("application/json").content(body)).andExpect(status().isForbidden());
  mvc.perform(post(url).with(csrf()).contentType("application/json").content(body)).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PENDING"));assertEquals(0,count("backlog_item"));
 }
}
