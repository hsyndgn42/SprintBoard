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

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:collaboration;DB_CLOSE_DELAY=-1","sprintboard.backup-directory=./tmp/collaboration-test-backups"})
@AutoConfigureMockMvc
@org.junit.jupiter.api.Tag("historical")
@org.springframework.test.context.ActiveProfiles("historical-tests")
class CollaborationTest {
 @Autowired MockMvc mvc;@Autowired JdbcTemplate db;@Autowired ObjectMapper mapper;@Autowired BackupService backups;
 MockHttpSession admin,user,other;static final String PASS="collab-test-only-123";
 @BeforeEach void setup()throws Exception{
  db.update("DELETE FROM overtime_request");db.update("DELETE FROM task_activity");db.update("DELETE FROM login_throttle");db.update("DELETE FROM app_user");
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
 @Test void linkedUserCanOnlyProgressAssignedActiveTasksAndAuditIsAtomic()throws Exception{
  mvc.perform(get("/api/auth/session").session(user)).andExpect(jsonPath("$.memberId").value("legacy-member-elcim"));
  mvc.perform(body(patch("/api/self/tasks/collab-own/status"),user,Map.of("status","doing","expectedStatus","todo"))).andExpect(status().isOk());
  assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM task_activity WHERE task_id='collab-own' AND actor='elcim.test' AND kind='status-changed'",Integer.class));
  mvc.perform(body(patch("/api/self/tasks/collab-own/status"),user,Map.of("status","done","expectedStatus","todo"))).andExpect(status().isBadRequest());
  mvc.perform(body(patch("/api/self/tasks/collab-foreign/status"),user,Map.of("status","doing","expectedStatus","todo"))).andExpect(status().isForbidden());
  mvc.perform(body(patch("/api/tasks/collab-own"),user,Map.of("status","done"))).andExpect(status().isForbidden());
  mvc.perform(body(patch("/api/self/tasks/collab-own/status"),user,Map.of("status","done","expectedStatus","doing","taskCategory","BAU"))).andExpect(status().isBadRequest());
  mvc.perform(body(put("/api/self/tasks/collab-own/blocker"),user,Map.of("blocked",true,"reason","Bekleyen bağımlılık","version",0))).andExpect(status().isOk());
  mvc.perform(body(patch("/api/self/tasks/collab-own/status"),user,Map.of("status","done","expectedStatus","doing"))).andExpect(status().isBadRequest());
  mvc.perform(body(put("/api/self/tasks/collab-own/blocker"),user,Map.of("blocked",false,"reason","Bağımlılık çözüldü","version",1))).andExpect(status().isOk());
  mvc.perform(body(patch("/api/self/tasks/collab-own/status"),user,Map.of("status","undone","expectedStatus","doing","note","Kapsam yetişmedi"))).andExpect(status().isOk());
  assertEquals(4,db.queryForObject("SELECT COUNT(*) FROM task_activity WHERE task_id='collab-own'",Integer.class));
  db.update("UPDATE sprint SET status='completed' WHERE id='collab-sprint'");
  mvc.perform(body(patch("/api/self/tasks/collab-own/status"),user,Map.of("status","done","expectedStatus","undone"))).andExpect(status().isBadRequest());
 }
 @Test void dailyNotesAreSharedImmutableAndServerOwned()throws Exception{
  mvc.perform(body(post("/api/self/tasks/collab-own/notes"),user,Map.of("date","2026-10-10","message","<script>alert(1)</script> Tasarım tamamlandı","actor","admin"))).andExpect(status().isOk());
  mvc.perform(get("/api/sprints/collab-sprint/journal").session(other)).andExpect(status().isOk()).andExpect(jsonPath("$[0].actor").value("elcim.test")).andExpect(jsonPath("$[0].date").value("2026-10-10"));
  mvc.perform(body(post("/api/self/tasks/collab-foreign/notes"),user,Map.of("date","2026-10-10","message","test"))).andExpect(status().isForbidden());
  mvc.perform(body(post("/api/self/tasks/collab-own/notes"),user,Map.of("date","2026-09-01","message","test"))).andExpect(status().isBadRequest());
  mvc.perform(body(post("/api/self/tasks/collab-own/notes"),other,Map.of("date","2026-10-10","message","test"))).andExpect(status().isForbidden());
  mvc.perform(post("/api/self/tasks/collab-own/notes").session(user).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
  mvc.perform(get("/api/sprints/collab-sprint/journal")).andExpect(status().isUnauthorized());
 }
 @Test void plannedOvertimeEditAndDeleteRequireAdminAndCsrf()throws Exception{
  String id="plan-permission-check";
  for(var method:List.of(put("/api/overtime/entries/"+id+"/plan"),delete("/api/overtime/entries/"+id+"/plan"))){
   mvc.perform(body(method,user,Map.of("expectedHours",8,"expectedIncluded",true,"plannedHours",4,"confirmed",true))).andExpect(status().isForbidden());
  }
  mvc.perform(put("/api/overtime/entries/"+id+"/plan").session(admin).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
 }
 @Test void overtimeTaskIsAssignedSameSprintAndSnapshotSurvivesRename()throws Exception{
  String id=UUID.randomUUID().toString();var payload=new HashMap<>(request(id));payload.put("taskId","collab-foreign");
  mvc.perform(body(post("/api/self/overtime-requests"),user,payload)).andExpect(status().isBadRequest());
  payload.put("taskId","collab-own");mvc.perform(body(post("/api/self/overtime-requests"),user,payload)).andExpect(status().isOk());
  var changed=new HashMap<>(payload);changed.put("taskId","");mvc.perform(body(post("/api/self/overtime-requests"),user,changed)).andExpect(status().isBadRequest());
  mvc.perform(body(post("/api/admin/overtime-requests/"+id+"/decision"),admin,Map.of("status","APPROVED","note","Uygun"))).andExpect(status().isOk());
  assertEquals("collab-own",db.queryForObject("SELECT task_id FROM overtime_entry WHERE id=(SELECT entry_id FROM overtime_request WHERE id=?)",String.class,id));
  db.update("UPDATE sprint_task SET title='Renamed' WHERE id='collab-own'");
  assertEquals("own",db.queryForObject("SELECT task_title FROM overtime_entry WHERE id=(SELECT entry_id FROM overtime_request WHERE id=?)",String.class,id));
  mvc.perform(body(post("/api/overtime/entries"),admin,Map.of("memberId","legacy-member-elcim","sprintId","legacy-sprint-13","taskId","collab-own","earnedHours",1))).andExpect(status().isBadRequest());
 }
 Map<String,Object> request(String id){return Map.of("requestId",id,"sprintId","collab-sprint","date","2026-10-10","hours",2,"reason","Test doğrulaması","memberId","legacy-member-isa");}
 @Test void approvalIsExactlyOnceAndRejectDoesNotCreditAndAdminDirectEntryStillWorks()throws Exception{
  String id=UUID.randomUUID().toString();int before=db.queryForObject("SELECT COUNT(*) FROM overtime_entry",Integer.class);
  mvc.perform(body(post("/api/self/overtime-requests"),user,request(id))).andExpect(status().isOk());
  mvc.perform(body(post("/api/self/overtime-requests"),user,request(id))).andExpect(status().isOk());
  assertEquals(before,db.queryForObject("SELECT COUNT(*) FROM overtime_entry",Integer.class));
  assertEquals("legacy-member-elcim",db.queryForObject("SELECT member_id FROM overtime_request WHERE id=?",String.class,id));
  mvc.perform(get("/api/self/overtime-requests").session(other)).andExpect(content().json("[]"));
  mvc.perform(body(post("/api/admin/overtime-requests/"+id+"/decision"),user,Map.of("status","APPROVED","note","ok"))).andExpect(status().isForbidden());
  mvc.perform(body(post("/api/admin/overtime-requests/"+id+"/decision"),admin,Map.of("status","APPROVED","note","Kontrol edildi"))).andExpect(status().isOk());
  mvc.perform(body(post("/api/admin/overtime-requests/"+id+"/decision"),admin,Map.of("status","APPROVED","note","Tekrar"))).andExpect(status().isBadRequest());
  assertEquals(before+1,db.queryForObject("SELECT COUNT(*) FROM overtime_entry",Integer.class));
  assertEquals(2d,db.queryForObject("SELECT earned_hours FROM overtime_entry WHERE id=(SELECT entry_id FROM overtime_request WHERE id=?)",Double.class,id));
  String rejected=UUID.randomUUID().toString();var payload=new HashMap<>(request(rejected));payload.put("hours",3);
  mvc.perform(body(post("/api/self/overtime-requests"),user,payload)).andExpect(status().isOk());
  mvc.perform(body(post("/api/admin/overtime-requests/"+rejected+"/decision"),admin,Map.of("status","REJECTED","note","Mükerrer çalışma"))).andExpect(status().isOk());
  assertEquals(before+1,db.queryForObject("SELECT COUNT(*) FROM overtime_entry",Integer.class));
  mvc.perform(body(post("/api/overtime/entries"),user,Map.of("memberId","legacy-member-elcim","sprintId","collab-sprint","earnedHours",1))).andExpect(status().isForbidden());
  mvc.perform(body(post("/api/overtime/entries"),admin,Map.of("memberId","legacy-member-elcim","sprintId","collab-sprint","earnedHours",1))).andExpect(status().isCreated());
  mvc.perform(body(post("/api/leaves"),admin,Map.of("memberId","legacy-member-elcim","sprintId","collab-sprint","days",1,"leaveType","ANNUAL"))).andExpect(status().isCreated());
 }
 @Test void linkingIsAdminOnlyUniqueAndRevokesSessions()throws Exception{
  mvc.perform(body(put("/api/admin/users/other.test/member"),other,Map.of("memberId","legacy-member-isa"))).andExpect(status().isForbidden());
  mvc.perform(body(put("/api/admin/users/other.test/member"),admin,Map.of("memberId","legacy-member-elcim"))).andExpect(status().isBadRequest());
  mvc.perform(body(put("/api/admin/users/elcim.test/member"),admin,Map.of("memberId",""))).andExpect(status().isOk());
  mvc.perform(get("/api/sprints").session(user)).andExpect(status().isUnauthorized());
  user=login("elcim.test");mvc.perform(body(post("/api/self/overtime-requests"),user,request(UUID.randomUUID().toString()))).andExpect(status().isForbidden());
 }
 @Test void backupContainsHistoryAndRequestsButNotAccountLinkAndValidatesApproval()throws Exception{
  mvc.perform(body(post("/api/self/tasks/collab-own/notes"),user,Map.of("date","2026-10-10","message","Kalıcı günlük"))).andExpect(status().isOk());
  String id=UUID.randomUUID().toString();mvc.perform(body(post("/api/self/overtime-requests"),user,request(id))).andExpect(status().isOk());
  mvc.perform(body(post("/api/admin/overtime-requests/"+id+"/decision"),admin,Map.of("status","APPROVED","note","Uygun"))).andExpect(status().isOk());
  // Keep only the fixture active for full-workspace validation.
  db.update("UPDATE sprint SET status='completed' WHERE id<>'collab-sprint' AND status='active'");
  ObjectNode export=mapper.valueToTree(backups.exportData());assertEquals(40,export.path("schemaVersion").asInt());assertFalse(export.path("tables").has("app_user"));
  assertEquals(1,export.path("tables").path("task_activity").size());assertDoesNotThrow(()->backups.preview(export));
  var preview=backups.preview(export);var restore=new HashMap<String,Object>(preview);restore.put("backup",export);restore.put("confirmation","GERİ YÜKLE");
  String password=db.queryForObject("SELECT password_hash FROM app_user WHERE username='elcim.test'",String.class);
  backups.restore(mapper.valueToTree(restore));
  assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM task_activity WHERE kind='WORK_NOTE'",Integer.class));
  assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM overtime_request WHERE status='APPROVED'",Integer.class));
  assertNull(db.queryForObject("SELECT member_id FROM app_user WHERE username='elcim.test'",String.class));
  assertEquals(password,db.queryForObject("SELECT password_hash FROM app_user WHERE username='elcim.test'",String.class));
  ((ObjectNode)export.path("tables").path("overtime_request").get(0)).put("hours",9);assertThrows(IllegalArgumentException.class,()->backups.preview(export));
 }
}
