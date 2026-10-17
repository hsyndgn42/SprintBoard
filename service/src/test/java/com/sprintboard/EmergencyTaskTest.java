package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
@org.junit.jupiter.api.Tag("historical")
@org.springframework.test.context.ActiveProfiles("historical-tests")
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:emergency;DB_CLOSE_DELAY=-1","sprintboard.backup-directory=./tmp/emergency-test-backups"})
@AutoConfigureMockMvc
class EmergencyTaskTest{
 @Autowired WorkspaceService workspace;@Autowired JdbcTemplate db;@Autowired MockMvc mvc;@Autowired ObjectMapper mapper;@Autowired BackupService backups;
 String sprint;
 @BeforeEach void setup(){db.update("UPDATE sprint SET status='completed' WHERE status='active'");sprint="emergency-"+UUID.randomUUID();db.update("INSERT INTO sprint(id,number,name,goal,start_date,end_date,status,story_points_available) VALUES (?,?,'Emergency test','',DATE '2026-10-06',DATE '2026-10-26','active',FALSE)",sprint,db.queryForObject("SELECT MAX(number)+1 FROM sprint",Integer.class));}
 Map<String,Object> draft(){var m=new LinkedHashMap<String,Object>();m.put("title","Urgent <script>");m.put("criteria","Production recovery");m.put("size","SMALL");m.put("storyPoints",2);m.put("taskCategory","DEV");m.put("estimatedHours",8);m.put("reason","Production outage");m.put("emergency",true);m.put("readinessAcknowledged",true);m.put("assignments",List.of(Map.of("memberId","legacy-member-elcim","estimatedHours",8,"supportOnly",false)));return m;}
 List<Map<String,Object>> tasks(){return (List<Map<String,Object>>)workspace.sprint(sprint).get("items");}
 Map<String,Object> task(String id){return tasks().stream().filter(t->id.equals(t.get("id"))).findFirst().orElseThrow();}
 @Test void directCreateIsAtomicAndRetryOfExistingBacklogCannotDuplicate(){
  int before=db.queryForObject("SELECT COUNT(*) FROM backlog_item",Integer.class);
  var bad=draft();bad.put("assignments",List.of(Map.of("memberId","not-a-member","estimatedHours",8)));
  assertThrows(IllegalArgumentException.class,()->workspace.createSprintTask(sprint,bad));
  assertEquals(before,db.queryForObject("SELECT COUNT(*) FROM backlog_item",Integer.class));assertTrue(tasks().isEmpty());
  var added=workspace.createSprintTask(sprint,draft());var t=task(added.get("id").toString());
  assertEquals(true,t.get("emergency"));assertEquals(true,t.get("addedDuringSprint"));assertEquals(1,((List<?>)t.get("assignments")).size());
  var f=(Map<?,?>)workspace.sprint(sprint).get("flow");assertTrue(((List<?>)f.get("baseline")).isEmpty());
  var event=(Map<?,?>)((List<?>)f.get("events")).getFirst();assertEquals(true,((Map<?,?>)event.get("task")).get("emergency"));
  assertThrows(IllegalArgumentException.class,()->workspace.addTask(sprint,Map.of("backlogId",added.get("backlogId"),"reason","retry")));
 }
 @Test void returnToBacklogPreservesNotesAndAssignmentsWithoutUndoneAndSurvivesClosure(){
  String urgent=workspace.createSprintTask(sprint,draft()).get("id").toString();var normal=draft();normal.put("emergency",false);normal.put("title","Deferred normal work");
  String deferred=workspace.createSprintTask(sprint,normal).get("id").toString();assertEquals(false,task(deferred).get("emergency"));
  workspace.updateTask(deferred,Map.of("status","doing"));var original=task(deferred);
  workspace.removeTask(deferred,Map.of("confirmed",true,"fingerprint",original.get("flowFingerprint"),"reason","Make room","replacementTaskId",urgent));
  assertEquals("Ready",workspace.readiness(original.get("backlogId").toString()).get("state"));
  assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM sprint_task WHERE id=?",Integer.class,deferred));
  assertTrue(db.queryForObject("SELECT COUNT(*) FROM task_activity WHERE task_id=?",Integer.class,deferred)>0);
  var flow=(Map<?,?>)workspace.sprint(sprint).get("flow");var events=(List<Map<String,Object>>)flow.get("events");
  var removed=(Map<?,?>)events.getLast().get("task");assertEquals("doing",removed.get("status"));assertEquals(urgent,removed.get("replacementTaskId"));assertEquals(1,((List<?>)removed.get("assignments")).size());
  workspace.updateTask(urgent,Map.of("status","done"));var preview=workspace.closurePreview(sprint);workspace.completeSprint(sprint,Map.of("confirmed",true,"fingerprint",preview.get("fingerprint"),"carryTaskIds",List.of()));
  assertEquals(true,task(urgent).get("emergency"));assertEquals("done",task(urgent).get("status"));assertEquals(1,tasks().size());
 }
 @Test void permissionCsrfAndClosedSprintChecks()throws Exception{
  String body=mapper.writeValueAsString(draft()),url="/api/sprints/"+sprint+"/tasks/new";
  mvc.perform(post(url).with(user("viewer").roles("USER")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
  mvc.perform(post(url).with(user("admin").roles("ADMIN")).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
  mvc.perform(get("/api/reports/scope")).andExpect(status().isUnauthorized());
  mvc.perform(get("/api/reports/scope").with(user("viewer").roles("USER"))).andExpect(status().isOk());
  db.update("UPDATE sprint SET status='completed' WHERE id=?",sprint);
  assertThrows(IllegalArgumentException.class,()->workspace.createSprintTask(sprint,draft()));assertTrue(tasks().isEmpty());
 }
 @Test void invalidReasonEmergencyAndReplacementAreRejected(){
  var bad=draft();bad.put("reason"," ");assertThrows(IllegalArgumentException.class,()->workspace.createSprintTask(sprint,bad));assertTrue(tasks().isEmpty());
  bad.put("reason","Incident");bad.put("emergency","true");assertThrows(IllegalArgumentException.class,()->workspace.createSprintTask(sprint,bad));
  String id=workspace.createSprintTask(sprint,draft()).get("id").toString();var t=task(id);
  assertThrows(IllegalArgumentException.class,()->workspace.removeTask(id,Map.of("confirmed",true,"fingerprint",t.get("flowFingerprint"),"reason","Later","replacementTaskId","foreign")));
  assertEquals(1,tasks().size());
 }
 @Test void backupRoundTripPreservesEmergencyAndRejectsInvalidFlag(){
  String id=workspace.createSprintTask(sprint,draft()).get("id").toString();var backup=(ObjectNode)mapper.valueToTree(backups.exportData());var preview=backups.preview(backup);
  backups.restore(mapper.valueToTree(Map.of("backup",backup,"confirmation","GERİ YÜKLE","backupFingerprint",preview.get("backupFingerprint"),"currentFingerprint",preview.get("currentFingerprint"))));
  assertEquals(true,task(id).get("emergency"));
  var bad=backup.deepCopy();for(var event:bad.path("tables").path("sprint_scope_event"))if(sprint.equals(event.path("sprint_id").asText())){
   try{var t=(ObjectNode)mapper.readTree(event.path("task_json").asText());t.put("emergency","invalid");((ObjectNode)event).put("task_json",t.toString());}catch(Exception e){throw new RuntimeException(e);}
  }
  assertThrows(IllegalArgumentException.class,()->backups.preview(bad));
 }
}
