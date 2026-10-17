package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@org.junit.jupiter.api.Tag("historical")
@org.springframework.test.context.ActiveProfiles("historical-tests")
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:leaverequest;DB_CLOSE_DELAY=-1","sprintboard.backup-directory=./tmp/leave-request-test-backups"})
@AutoConfigureMockMvc
@org.springframework.transaction.annotation.Transactional
class LeaveRequestTest {
 @Autowired WorkspaceService workspace;@Autowired MockMvc mvc;@Autowired JdbcTemplate db;@Autowired ObjectMapper mapper;@Autowired BackupService backups;
 MockHttpSession admin,user,other;static final String PASS="collab-test-only-123";
 @BeforeEach void setup()throws Exception{
  db.update("DELETE FROM leave_request");db.update("DELETE FROM overtime_request");db.update("DELETE FROM task_activity");db.update("DELETE FROM login_throttle");db.update("DELETE FROM app_user");
  mvc.perform(post("/api/auth/setup").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json(Map.of("username","admin","password",PASS)))).andExpect(status().isCreated());admin=login("admin");
  for(String name:List.of("elcim.test","other.test"))mvc.perform(body(post("/api/admin/users"),admin,Map.of("username",name,"password",PASS))).andExpect(status().isCreated());
  mvc.perform(body(put("/api/admin/users/elcim.test/member"),admin,Map.of("memberId","legacy-member-elcim"))).andExpect(status().isOk());
  user=login("elcim.test");other=login("other.test");
  db.update("MERGE INTO sprint(id,number,name,goal,start_date,end_date,status,story_points_available) KEY(id) VALUES ('collab-sprint',900,'Collab Sprint','',DATE '2026-10-01',DATE '2026-10-26','active',FALSE)");
  for(String id:List.of("own","foreign")){
   db.update("MERGE INTO backlog_item(id,title,criteria,work_kind,type,state,created_at,task_category) KEY(id) VALUES (?,?,'','DEV','DEV','IN_SPRINT',CURRENT_TIMESTAMP,'DEV')","collab-"+id,id);
   db.update("MERGE INTO sprint_task(id,sprint_id,backlog_id,title,criteria,type,work_kind,status,task_category) KEY(id) VALUES (?,'collab-sprint',?,?,'','DEV','DEV','todo','DEV')","collab-"+id,"collab-"+id,id);
  }
  db.update("DELETE FROM task_blocker WHERE task_id='collab-own'");
  db.update("MERGE INTO assignment(id,task_id,member_id,estimated_hours) KEY(id) VALUES ('collab-a','collab-own','legacy-member-elcim',8)");
 }
 String json(Object o)throws Exception{return mapper.writeValueAsString(o);}
 MockHttpSession login(String username)throws Exception{return (MockHttpSession)mvc.perform(formLogin().user(username).password(PASS)).andExpect(redirectedUrl("/#/overview")).andReturn().getRequest().getSession(false);}
 MockHttpServletRequestBuilder body(MockHttpServletRequestBuilder b,MockHttpSession s,Object o)throws Exception{return b.session(s).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json(o));}

 Map<String,Object> leave(String id,String kind,String date){return Map.of("requestId",id,"sprintId","collab-sprint","start",date,"end",date,"days",1,"leaveType",kind,"reason","İzin talebi");}
 double available(){return ((Number)workspace.capacity("collab-sprint").stream().filter(r->"legacy-member-elcim".equals(r.get("memberId"))).findFirst().orElseThrow().get("availableHours")).doubleValue();}
 double balance(){return ((Number)workspace.overtimeBalances().stream().filter(r->"legacy-member-elcim".equals(r.get("memberId"))).findFirst().orElseThrow().get("balanceHours")).doubleValue();}
 void decide(String id,String status,int expected)throws Exception{mvc.perform(body(post("/api/admin/leave-requests/"+id+"/decision"),admin,Map.of("status",status,"note","Kontrol edildi"))).andExpect(status().is(expected));}
 @Test void pendingAndRejectedDoNotAffectCapacityOrBalanceAndArePrivate()throws Exception{
   String id=UUID.randomUUID().toString();var request=leave(id,"ANNUAL","2026-10-08");
   double capacity=available(),hours=balance();int count=workspace.leaves().size();
   mvc.perform(body(post("/api/self/leave-requests"),user,request)).andExpect(status().isOk());
   mvc.perform(body(post("/api/self/leave-requests"),user,request)).andExpect(status().isOk());
   assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM leave_request",Integer.class));
   assertEquals(count,workspace.leaves().size());assertEquals(capacity,available());assertEquals(hours,balance());
   mvc.perform(get("/api/self/leave-requests").session(other)).andExpect(content().json("[]"));
   mvc.perform(get("/api/self/leave-requests")).andExpect(status().isUnauthorized());
   mvc.perform(body(post("/api/self/leave-requests"),other,leave(UUID.randomUUID().toString(),"ANNUAL","2026-10-09"))).andExpect(status().isForbidden());
   mvc.perform(body(post("/api/admin/leave-requests/"+id+"/decision"),user,Map.of("status","APPROVED","note","x"))).andExpect(status().isForbidden());
   mvc.perform(post("/api/self/leave-requests").session(user).contentType(MediaType.APPLICATION_JSON).content(json(request))).andExpect(status().isForbidden());
   var forged=new HashMap<>(request);forged.put("memberId","legacy-member-isa");
   mvc.perform(body(post("/api/self/leave-requests"),user,forged)).andExpect(status().isBadRequest());
   decide(id,"REJECTED",200);assertEquals(count,workspace.leaves().size());assertEquals(capacity,available());assertEquals(hours,balance());
 }
 @Test void annualApprovalAppliesOnceAndKeepsTaskEffortAndAdminDirectPermission()throws Exception{
   String id=UUID.randomUUID().toString();double before=available(),hours=balance();
   int count=workspace.leaves().size();
   mvc.perform(body(post("/api/self/leave-requests"),user,leave(id,"ANNUAL","2026-10-08"))).andExpect(status().isOk());
   decide(id,"APPROVED",200);decide(id,"APPROVED",400);
   assertEquals(before-8,available());assertEquals(hours,balance());assertEquals(count+1,workspace.leaves().size());
   assertEquals(8d,db.queryForObject("SELECT estimated_hours FROM assignment WHERE id='collab-a'",Double.class));
   assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM audit_event WHERE entity_type='leave-request' AND entity_id=?",Integer.class,id));
   mvc.perform(body(post("/api/leaves"),user,Map.of("memberId","legacy-member-elcim","sprintId","collab-sprint","days",1,"leaveType","ANNUAL"))).andExpect(status().isForbidden());
   mvc.perform(body(post("/api/leaves"),admin,Map.of("memberId","legacy-member-isa","sprintId","collab-sprint","days",1,"leaveType","ANNUAL"))).andExpect(status().isCreated());
 }
 @Test void overtimeApprovalDebitsOnceAndRechecksBalance()throws Exception{
   workspace.createOvertimeEntry(Map.of("memberId","legacy-member-elcim","sprintId","collab-sprint","earnedHours",16));
   double before=balance();String id=UUID.randomUUID().toString();
   mvc.perform(body(post("/api/self/leave-requests"),user,leave(id,"OVERTIME","2026-10-08"))).andExpect(status().isOk());
   assertEquals(before,balance());decide(id,"APPROVED",200);assertEquals(before-8,balance());
   String pending=UUID.randomUUID().toString();
   mvc.perform(body(post("/api/self/leave-requests"),user,leave(pending,"OVERTIME","2026-10-09"))).andExpect(status().isOk());
   db.update("UPDATE overtime_snapshot SET balance_hours=0 WHERE member_id='legacy-member-elcim'");
   db.update("UPDATE overtime_entry SET earned_hours=0 WHERE member_id='legacy-member-elcim'");
   decide(pending,"APPROVED",400);
   assertEquals("PENDING",db.queryForObject("SELECT status FROM leave_request WHERE id=?",String.class,pending));
 }
 @Test void invalidDatesOverlapAndClosedSprintNeverApplyLeave()throws Exception{
   for(String date:List.of("2026-09-30","2026-10-31","2026-10-10"))
     mvc.perform(body(post("/api/self/leave-requests"),user,leave(UUID.randomUUID().toString(),"ANNUAL",date))).andExpect(status().isBadRequest());
   String id=UUID.randomUUID().toString();
   mvc.perform(body(post("/api/self/leave-requests"),user,leave(id,"ANNUAL","2026-10-08"))).andExpect(status().isOk());
   mvc.perform(body(post("/api/self/leave-requests"),user,leave(UUID.randomUUID().toString(),"OVERTIME","2026-10-08"))).andExpect(status().isBadRequest());
   workspace.createLeave(Map.of("memberId","legacy-member-elcim","sprintId","collab-sprint","days",1,"start","2026-10-08","end","2026-10-08","leaveType","ANNUAL"));
   decide(id,"APPROVED",400);
   db.update("UPDATE sprint SET status='completed' WHERE id='collab-sprint'");
   decide(id,"APPROVED",400);decide(id,"REJECTED",200);
 }
 @Test void backupRoundTripAndV31UpgradePreserveRequestLinks()throws Exception{
   String id=UUID.randomUUID().toString();
   mvc.perform(body(post("/api/self/leave-requests"),user,leave(id,"ANNUAL","2026-10-08"))).andExpect(status().isOk());decide(id,"APPROVED",200);
   db.update("UPDATE sprint SET status='completed' WHERE id<>'collab-sprint' AND status='active'");
   ObjectNode exported=mapper.valueToTree(backups.exportData());assertEquals(40,exported.path("schemaVersion").asInt());
   var preview=backups.preview(exported);var restore=new HashMap<String,Object>(preview);restore.put("backup",exported);restore.put("confirmation","GERİ YÜKLE");
   backups.restore(mapper.valueToTree(restore));
   assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM leave_request WHERE status='APPROVED' AND entry_id IS NOT NULL",Integer.class));
   var old=exported.deepCopy();old.put("schemaVersion",31);BackupFixtureV40.removeMatching(old);((ObjectNode)old.path("tables")).remove("leave_request");((ObjectNode)old.path("tables")).remove("defect_reserve_link");assertDoesNotThrow(()->backups.preview(old));
   ((ObjectNode)exported.path("tables").path("leave_request").get(0)).put("entry_id","missing");assertThrows(IllegalArgumentException.class,()->backups.preview(exported));
 }
}
