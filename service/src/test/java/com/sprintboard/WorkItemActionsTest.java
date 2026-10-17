package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
@org.junit.jupiter.api.Tag("historical")
@org.springframework.test.context.ActiveProfiles("historical-tests")
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:workactions;DB_CLOSE_DELAY=-1","sprintboard.backup-directory=./tmp/work-actions-backups"})
@AutoConfigureMockMvc @Transactional
class WorkItemActionsTest{
 @Autowired WorkspaceService w;@Autowired JdbcTemplate db;@Autowired MockMvc mvc;@Autowired BackupService backups;@Autowired ObjectMapper mapper;
 String sprint="legacy-sprint-14";
 Map<String,Object> draft(){return Map.of("title","QA title","size","SMALL","taskCategory","DEV","criteria","QA","readinessAcknowledged",true,"reason","QA");}
 String pool(){return w.createBacklog(draft()).get("id").toString();}
 Map<String,Object> deletion(String title){return Map.of("confirmed",true,"expectedTitle",title);}
 @Test void renameSynchronizesAndAuditsWithoutChangingPlanOrScope(){
  var task=w.createSprintTask(sprint,draft());String id=task.get("id").toString(),backlog=task.get("backlogId").toString();
  var before=db.queryForMap("SELECT * FROM sprint_task WHERE id=?",id);int scope=db.queryForObject("SELECT COUNT(*) FROM sprint_scope_event",Integer.class);
  w.renameTask(id,Map.of("title","  Yeni görev  ","expectedTitle","QA title"));
  assertEquals("Yeni görev",db.queryForObject("SELECT title FROM backlog_item WHERE id=?",String.class,backlog));
  var after=db.queryForMap("SELECT * FROM sprint_task WHERE id=?",id);before.put("TITLE","Yeni görev");assertEquals(before,after);
  assertEquals(scope,db.queryForObject("SELECT COUNT(*) FROM sprint_scope_event",Integer.class));
  String detail=db.queryForObject("SELECT detail_json FROM task_activity WHERE task_id=? AND kind='title-changed'",String.class,id);assertTrue(detail.contains("QA title"));assertTrue(detail.contains("Yeni görev"));
  assertThrows(IllegalArgumentException.class,()->w.renameTask(id,Map.of("title","Stale","expectedTitle","QA title")));
  assertThrows(IllegalArgumentException.class,()->w.renameTask(id,Map.of("title"," ","expectedTitle","Yeni görev")));
  assertThrows(IllegalArgumentException.class,()->w.renameTask(id,Map.of("title","x".repeat(301),"expectedTitle","Yeni görev")));
  assertDoesNotThrow(()->backups.preview(mapper.valueToTree(backups.exportData())));
 }
 @Test void plannedAllowedCompletedRejectedAndAssignedCannotBeDeleted(){
  var task=w.createSprintTask(sprint,draft());String id=task.get("id").toString(),backlog=task.get("backlogId").toString();
  assertThrows(IllegalArgumentException.class,()->w.deleteBacklog(backlog,deletion("QA title")));
  db.update("UPDATE sprint SET status='planned' WHERE id=?",sprint);w.renameTask(id,Map.of("title","Plan","expectedTitle","QA title"));
  db.update("UPDATE sprint SET status='completed' WHERE id=?",sprint);
  assertThrows(IllegalArgumentException.class,()->w.renameTask(id,Map.of("title","Closed","expectedTitle","Plan")));
 }
 @Test void confirmedPoolDeletionRemovesOnlyTargetAndPreservesAudit(){
  String id=pool(),other=pool();
  assertThrows(IllegalArgumentException.class,()->w.deleteBacklog(id,Map.of("expectedTitle","QA title")));
  assertThrows(IllegalArgumentException.class,()->w.deleteBacklog(id,deletion("Old title")));
  w.deleteBacklog(id,deletion("QA title"));
  assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM backlog_item WHERE id=?",Integer.class,id));
  assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM backlog_item WHERE id=?",Integer.class,other));
  assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM audit_event WHERE entity_id=? AND action='deleted'",Integer.class,id));
  assertNull(w.deleteBacklog(id,deletion("QA title")));
  assertDoesNotThrow(()->backups.preview(mapper.valueToTree(backups.exportData())));
 }
 @Test void dependenciesRepeatsAndDefectReferencesProtectLinkedItems(){
  String id=pool(),other=pool();
  db.update("INSERT INTO backlog_dependency VALUES (?,?)",other,id);
  assertThrows(IllegalArgumentException.class,()->w.deleteBacklog(id,deletion("QA title")));
  db.update("DELETE FROM backlog_dependency WHERE backlog_id=?",other);
  db.update("UPDATE backlog_item SET repeat_of_id=? WHERE id=?",id,other);
  assertThrows(IllegalArgumentException.class,()->w.deleteBacklog(id,deletion("QA title")));
  db.update("UPDATE backlog_item SET repeat_of_id=NULL WHERE id=?",other);
  var defect=new HashMap<String,Object>(draft());defect.put("taskCategory","DEFECT");defect.put("taskSubtype","TEST_DEFECT");defect.put("defect",Map.of("severity","LOW","environment","SAT","verification","NOT_CHECKED","relatedId",id));
  String d=w.createBacklog(defect).get("id").toString();assertThrows(IllegalArgumentException.class,()->w.deleteBacklog(id,deletion("QA title")));
  w.deleteBacklog(d,deletion("QA title"));w.deleteBacklog(id,deletion("QA title"));
 }
 @Test void returnedTaskCanBeDeletedWithoutErasingSprintDiary(){
  var added=w.createSprintTask(sprint,draft());String id=added.get("id").toString(),backlog=added.get("backlogId").toString();
  var data=(List<Map<String,Object>>)w.sprint(sprint).get("items");var task=data.stream().filter(t->id.equals(t.get("id"))).findFirst().orElseThrow();
  w.removeTask(id,Map.of("confirmed",true,"fingerprint",task.get("flowFingerprint"),"reason","No longer needed"));
  int events=db.queryForObject("SELECT COUNT(*) FROM task_activity WHERE task_id=?",Integer.class,id);
  w.deleteBacklog(backlog,deletion("QA title"));
  assertEquals(events,db.queryForObject("SELECT COUNT(*) FROM task_activity WHERE task_id=?",Integer.class,id));
  assertDoesNotThrow(()->backups.preview(mapper.valueToTree(backups.exportData())));
 }
 @Test void adminAndCsrfRequired()throws Exception{
  String id=pool();String body=mapper.writeValueAsString(deletion("QA title"));
  mvc.perform(post("/api/backlog/"+id+"/delete").with(user("member").roles("USER")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isForbidden());
  mvc.perform(post("/api/backlog/"+id+"/delete").with(user("admin").roles("ADMIN")).contentType("application/json").content(body)).andExpect(status().isForbidden());
  mvc.perform(put("/api/tasks/missing/title").with(user("member").roles("USER")).with(csrf()).contentType("application/json").content("{}")).andExpect(status().isForbidden());
  mvc.perform(put("/api/tasks/missing/title").with(user("admin").roles("ADMIN")).contentType("application/json").content("{}")).andExpect(status().isForbidden());
  mvc.perform(post("/api/backlog/"+id+"/delete").with(user("admin").roles("ADMIN")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isOk());
 }
}
