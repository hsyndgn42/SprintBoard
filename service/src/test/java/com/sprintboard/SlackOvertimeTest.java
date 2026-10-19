package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.security.core.context.SecurityContextHolder;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:slackot;DB_CLOSE_DELAY=-1","sprintboard.slack.resolve-names=false","sprintboard.slack.bot-token=","sprintboard.slack.app-token="})
@WithMockUser(username="admin",roles="ADMIN")
@org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
class SlackOvertimeTest {
 @Autowired org.springframework.test.web.servlet.MockMvc mvc;
 @Autowired SlackOvertimeService service;@Autowired JdbcTemplate db;@Autowired BackupService backup;@Autowired ObjectMapper mapper;@Autowired WorkspaceService workspace;
 String member,sprint;LocalDate date;int serial;
 @BeforeEach void setup(){
  db.update("DELETE FROM slack_receipt_reaction");db.update("DELETE FROM slack_overtime_inbox");db.update("DELETE FROM slack_member_link");
  member="ot-member-"+UUID.randomUUID();sprint="ot-sprint-"+UUID.randomUUID();date=LocalDate.now(ZoneId.of("Europe/Istanbul")).minusDays(1);
  db.update("INSERT INTO member(id,name,title,role,team_role,engagement,active) VALUES(?, 'Ada Yılmaz','Tester','TEST_ENGINEER','TESTER','CORE',TRUE)",member);
  db.update("INSERT INTO member_participation(id,member_id,closed) VALUES(?,?,FALSE)",UUID.randomUUID().toString(),member);
  int number=9000+db.queryForObject("SELECT COUNT(*) FROM sprint",Integer.class);
  db.update("INSERT INTO sprint(id,number,name,goal,start_date,end_date,status,story_points_available) VALUES(?,?,'Mesai QA','',?,?,'completed',FALSE)",sprint,number,date.minusDays(2),date.plusDays(1));
 }
 String text(){return "#mesai\nSprint: "+db.queryForObject("SELECT number FROM sprint WHERE id=?",Integer.class,sprint)+"\nTarih: "+date+"\nSaat: 2,5\nAçıklama: SAT defect çözümü";}
 String receive(String raw){String ts="1792180000."+(++serial);service.accept("TTEST123","COT12345",ts,"UTEST123",raw,1);return db.queryForObject("SELECT id FROM slack_overtime_inbox WHERE message_ts=?",String.class,ts);}
 Map<String,Object> approval(){return new HashMap<>(Map.of("action","APPROVE","memberId",member,"sprintId",sprint,"note","Çalışma doğrulandı","confirmed",true));}
 int entries(){return db.queryForObject("SELECT COUNT(*) FROM overtime_entry WHERE member_id=?",Integer.class,member);}
 @SuppressWarnings("unchecked") Map<String,Object> entry(String id){return ((List<Map<String,Object>>)service.list("ALL",0).get("items")).stream().filter(p->id.equals(p.get("id"))).findFirst().orElseThrow();}
 Map<String,Object> correction(String id,String text){return Map.of("text",text,"fingerprint",entry(id).get("fingerprint"));}
 @Test void normalizesSingleDigitCalendarDatesButRejectsImpossibleDates(){
  for(String value:List.of("2026-10-5","2026-1-05","2026-1-5","2024-2-29")){var p=SlackOvertimeParser.parse(text().replace(date.toString(),value));assertEquals(true,p.get("valid"));assertDoesNotThrow(()->LocalDate.parse(p.get("date").toString()));}
  assertEquals("2026-10-05",SlackOvertimeParser.parse(text().replace(date.toString(),"2026-10-5")).get("date"));
  for(String value:List.of("2026-2-29","2026-2-30","2026-13-5","2026-0-5","2026-10-0","2026-10-32","2026-010-5","26-10-5","5/10/2026"))assertEquals(false,SlackOvertimeParser.parse(text().replace(date.toString(),value)).get("valid"),value);
 }
 @Test void correctionPreservesSourceAndSenderRequiresSeparateApprovalAndIsAudited(){
  String raw=text().replace("2,5","25"),id=receive(raw);assertEquals("INVALID",entry(id).get("status"));assertEquals(0,entries());
  String originalUrl=entry(id).get("sourceUrl").toString();var edited=new HashMap<>(correction(id,text()));edited.put("userId","spoof");service.correct(id,edited,"admin");
  var p=entry(id);assertEquals("PENDING",p.get("status"));assertEquals(raw,p.get("originalRaw"));assertEquals(text(),p.get("raw"));assertEquals("UTEST123",p.get("userId"));assertEquals(originalUrl,p.get("sourceUrl"));assertEquals("admin",p.get("correctedBy"));assertEquals(0,entries());
  assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM slack_receipt_reaction",Integer.class));assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM audit_event WHERE entity_id=? AND action='CORRECTED'",Integer.class,id));
  var approve=approval();approve.put("fingerprint",p.get("fingerprint"));service.decide(id,approve,"admin");assertEquals(1,entries());assertEquals(2.5,db.queryForObject("SELECT earned_hours FROM overtime_entry WHERE member_id=?",Double.class,member));
  assertThrows(IllegalArgumentException.class,()->service.correct(id,correction(id,text()),"admin"));assertThrows(IllegalArgumentException.class,()->service.decide(id,approve,"admin"));
 }
 @Test void invalidAndStaleCorrectionsCannotOverwriteOrApproveChangedContent(){
  String id=receive(text()),fingerprint=entry(id).get("fingerprint").toString();
  assertThrows(IllegalArgumentException.class,()->service.correct(id,correction(id,text().replace("2,5","-4")),"admin"));assertEquals(fingerprint,entry(id).get("fingerprint"));
  service.correct(id,correction(id,text().replace("2,5","3")),"admin");
  assertThrows(IllegalArgumentException.class,()->service.correct(id,Map.of("text",text(),"fingerprint",fingerprint),"admin"));
  var stale=approval();stale.put("fingerprint",fingerprint);assertThrows(IllegalArgumentException.class,()->service.decide(id,stale,"admin"));assertThrows(IllegalArgumentException.class,()->service.decide(id,approval(),"admin"));assertEquals(0,entries());
  var current=approval();current.put("fingerprint",entry(id).get("fingerprint"));service.decide(id,current,"admin");assertEquals(3d,db.queryForObject("SELECT earned_hours FROM overtime_entry WHERE member_id=?",Double.class,member));
 }
 @Test void correctedDateStillMustFitSelectedSprint(){
  String id=receive(text());service.correct(id,correction(id,text().replace(date.toString(),date.minusDays(10).toString())),"admin");var input=approval();input.put("fingerprint",entry(id).get("fingerprint"));assertThrows(IllegalArgumentException.class,()->service.decide(id,input,"admin"));assertEquals(0,entries());assertEquals("PENDING",entry(id).get("status"));
 }
 @Test void correctionApiRequiresAdminAndCsrf()throws Exception{
  String id=receive("#mesai\nSaat: -2"),body=mapper.writeValueAsString(correction(id,text())),url="/api/admin/slack/overtime-inbox/"+id+"/correction";
  mvc.perform(post(url).with(user("member").roles("USER")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isForbidden());
  mvc.perform(post(url).contentType("application/json").content(body)).andExpect(status().isForbidden());
  mvc.perform(post(url).with(csrf()).contentType("application/json").content(body)).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PENDING"));assertEquals(0,entries());
 }
 @Test void slackApprovalMatchesPartialPlanAndOverrunWithoutDoubleCounting(){
  String plan=workspace.createOvertimeEntry(Map.of("memberId",member,"sprintId",sprint,"plannedHours",16,"includeInCapacity",true)).get("id").toString();
  var before=workspace.capacity(sprint);var input=approval();input.put("planMode","PLANNED");input.put("planId",plan);
  String first=receive(text().replace("2,5","8"));service.decide(first,input,"admin");
  String second=receive(text().replace("2,5","12"));service.decide(second,input,"admin");
  assertEquals(20d,workspace.overtimeEntries().stream().filter(e->plan.equals(e.get("id"))).findFirst().orElseThrow().get("planActualHours"));
  assertEquals(before,workspace.capacity(sprint));assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM overtime_plan_link WHERE plan_id=?",Integer.class,plan));
  assertThrows(IllegalArgumentException.class,()->service.decide(first,input,"admin"));
  String third=receive(text().replace("2,5","1"));var bad=approval();bad.put("planMode","PLANNED");bad.put("planId","nonexistent");assertThrows(IllegalArgumentException.class,()->service.decide(third,bad,"admin"));
  assertEquals("PENDING",db.queryForObject("SELECT status FROM slack_overtime_inbox WHERE id=?",String.class,third));assertEquals(3,entries());
  var unplanned=approval();unplanned.put("planMode","UNPLANNED");service.decide(third,unplanned,"admin");assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM overtime_entry WHERE member_id=? AND plan_classification='UNPLANNED'",Integer.class,member));assertEquals(before,workspace.capacity(sprint));
 }
 @Test void parserRequiresSingleDaySingleValueAndDoesNotAcceptImpersonation(){
  assertEquals(true,SlackOvertimeParser.parse(text()).get("valid"));
  for(String bad:List.of(text()+"\nSaat: 3",text()+"\nKişi: Başkası",text().replace("2,5","25"),text().replace("2,5","NaN"),text().replace("2,5","0.1"),text().replace(date.toString(),"2026-02-30"),"#mesai"))assertEquals(false,SlackOvertimeParser.parse(bad).get("valid"),bad);
  assertFalse(SlackOvertimeParser.matches("sohbet #mesai"));
  assertFalse(SlackOvertimeParser.parse(text()+"\nxoxb-secret-test-123456").toString().contains("xoxb-secret-test-123456"));
 }
 @Test void acceptsConfiguredChannelMentionAndSlackFormattingButNotOtherChannels(){
  String source=text();
  for(String tag:List.of("<#COT12345>","<#COT12345|mesai>","*<#COT12345>*","**#mesai**")){
   String formatted=source.replace("#mesai",tag);assertTrue(SlackOvertimeParser.matches(formatted,"COT12345"));
   assertEquals(true,SlackOvertimeParser.parse(formatted,"COT12345").get("valid"));
  }
  for(String formatted:List.of(source.lines().map(l->"*"+l+"*").collect(java.util.stream.Collectors.joining("\n")),"*"+source+"*","```\n"+source+"\n```",source.replace("Saat: 2,5","*Saat:* *2,5*")))
   assertEquals(true,SlackOvertimeParser.parse(formatted,"COT12345").get("valid"),formatted);
  assertFalse(SlackOvertimeParser.matches(source.replace("#mesai","<#COTHER99>"),"COT12345"));
  String id=receive(source.replace("#mesai","<#COT12345>"));assertEquals("PENDING",db.queryForObject("SELECT status FROM slack_overtime_inbox WHERE id=?",String.class,id));
  assertEquals(0,entries());
 }
 @Test void pendingRejectAndInvalidNeverAffectLedgerAndSourceIsDurablyDeduplicated(){
  String id=receive(text());service.accept("TTEST123","COT12345","1792180000.1","UTEST123",text(),1);assertEquals(1,service.list("ALL",0).get("total"));assertEquals(0,entries());
  service.decide(id,Map.of("action","REJECT","note","Çift gönderim"),"admin");assertEquals(0,entries());
  String invalid=receive("#mesai\nSaat: -2");assertThrows(IllegalArgumentException.class,()->service.decide(invalid,approval(),"admin"));assertEquals(0,entries());
  service.decide(invalid,Map.of("action","REJECT","note","Format eksik"),"admin");assertEquals(0,service.list("WAITING",0).get("total"));
 }
 @Test void approveOnceCreatesCanonicalRequestLedgerAndRememberedIdentityWithoutChangingCapacity(){
  String id=receive(text());var input=approval();input.put("hours",100);input.put("userId","forged");service.decide(id,input,"admin");
  assertEquals(1,entries());assertEquals(2.5,db.queryForObject("SELECT earned_hours FROM overtime_entry WHERE member_id=?",Double.class,member));
  assertEquals(0,db.queryForObject("SELECT planned_hours FROM overtime_entry WHERE member_id=?",Double.class,member));assertFalse(db.queryForObject("SELECT include_in_capacity FROM overtime_entry WHERE member_id=?",Boolean.class,member));
  assertEquals("slack:TTEST123:UTEST123",db.queryForObject("SELECT requester FROM overtime_request WHERE member_id=?",String.class,member));
  assertThrows(IllegalArgumentException.class,()->service.decide(id,approval(),"admin"));
  String second=receive(text());var items=(List<Map<String,Object>>)service.list("WAITING",0).get("items");assertEquals(member,items.getFirst().get("suggestedMemberId"));
  assertThrows(IllegalArgumentException.class,()->service.decide(second,approval(),"admin"));assertEquals(1,entries());
  var saved=mapper.valueToTree(backup.exportData());assertFalse(saved.path("tables").has("slack_overtime_inbox"));assertDoesNotThrow(()->backup.preview(saved));
 }
 @Test void approvalChecksMemberDateSprintAndExplicitConfirmationThenRollsBack(){
  String id=receive(text());var input=approval();input.put("confirmed",false);assertThrows(IllegalArgumentException.class,()->service.decide(id,input,"admin"));input.put("confirmed",true);
  db.update("UPDATE member SET active=FALSE WHERE id=?",member);assertThrows(IllegalArgumentException.class,()->service.decide(id,input,"admin"));db.update("UPDATE member SET active=TRUE WHERE id=?",member);
  db.update("UPDATE sprint SET status='planned' WHERE id=?",sprint);assertThrows(IllegalArgumentException.class,()->service.decide(id,input,"admin"));db.update("UPDATE sprint SET status='completed',end_date=? WHERE id=?",date.minusDays(1),sprint);
  assertThrows(IllegalArgumentException.class,()->service.decide(id,input,"admin"));assertEquals(0,entries());assertEquals("PENDING",db.queryForObject("SELECT status FROM slack_overtime_inbox WHERE id=?",String.class,id));
 }
 @Test void futureAndDailyTotalRejectedAndRegularPendingRequestPreventsDuplicate(){
  String future=receive(text().replace(date.toString(),date.plusDays(2).toString()));assertThrows(IllegalArgumentException.class,()->service.decide(future,approval(),"admin"));
  db.update("INSERT INTO overtime_request(id,member_id,sprint_id,requester,work_date,hours,reason,status,created_at) VALUES(?,?,?,'member',?,23,'Existing','PENDING',?)",UUID.randomUUID().toString(),member,sprint,date,Instant.now().toString());
  String id=receive(text());assertThrows(IllegalArgumentException.class,()->service.decide(id,approval(),"admin"));assertEquals(0,entries());
 }
 @Test void concurrentApprovalsCreateOnlyOneLedgerEntry()throws Exception{
  String id=receive(text());var auth=SecurityContextHolder.getContext().getAuthentication();
  try(var pool=Executors.newFixedThreadPool(2)){var futures=new ArrayList<Future<Boolean>>();for(int i=0;i<2;i++)futures.add(pool.submit(()->{SecurityContextHolder.getContext().setAuthentication(auth);try{service.decide(id,approval(),"admin");return true;}catch(IllegalArgumentException e){return false;}finally{SecurityContextHolder.clearContext();}}));int accepted=0;for(var f:futures)if(f.get(15,TimeUnit.SECONDS))accepted++;assertEquals(1,accepted);}assertEquals(1,entries());
 }
}
