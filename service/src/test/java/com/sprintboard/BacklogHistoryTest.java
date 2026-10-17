package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties="spring.datasource.url=jdbc:h2:mem:backloghistory;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc @Transactional
@org.junit.jupiter.api.Tag("historical")
@org.springframework.test.context.ActiveProfiles("historical-tests")
class BacklogHistoryTest {
 @Autowired BacklogHistoryService history;@Autowired WorkspaceService w;@Autowired JdbcTemplate db;@Autowired ObjectMapper m;@Autowired MockMvc mvc;
 final String sprint="legacy-sprint-14";
 String item(String title){return w.createBacklog(Map.of("title",title,"taskCategory","DEV","size","SMALL","criteria","test")).get("id").toString();}
 String add(String id,String s){var r=w.readiness(id);return w.addTask(s,Map.of("backlogId",id,"reason","Planlama","readinessAcknowledged",true,"readinessFingerprint",((Map<?,?>)r.get("readiness")).get("fingerprint"))).get("id").toString();}
 @Test void relatedUndoneContinuationAndDoneRepeatPreserveFrozenOutcome(){
   String first=item("Aynı başlık"),unrelated=item("Aynı başlık"),task=add(first,sprint);
   w.updateTask(task,Map.of("status","undone","note","Doğrulama yetişmedi"));
   var p=w.closurePreview(sprint);w.completeSprint(sprint,Map.of("confirmed",true,"fingerprint",p.get("fingerprint"),"carryTaskIds",List.of(task)));
   String next=db.queryForObject("SELECT id FROM backlog_item WHERE repeat_of_id=?",String.class,first);
   String third=w.repeatBacklog(next).get("id").toString();
   var result=m.valueToTree(history.read(third));
   assertEquals(3,result.path("records").size());assertFalse(result.toString().contains(unrelated));
   var root=result.path("records").findValues("attempts").getFirst().get(0);
   assertEquals("undone",root.path("status").asText());assertTrue(root.path("frozen").asBoolean());
   assertEquals("Doğrulama yetişmedi",root.path("statusNote").asText());
   assertTrue(result.toString().contains("sprint-closed"));
   db.update("UPDATE sprint_task SET status='done' WHERE id=?",task);
   assertEquals(result,m.valueToTree(history.read(third)),"Frozen history must not use mutable task result");
 }
 @Test void removedTasksRemainInJourneyAndReentryGetsSeparateAttempt(){
   String id=item("Geri dönen iş"),task=add(id,sprint);
   var current=(List<Map<String,Object>>)w.sprint(sprint).get("items");
   String fingerprint=current.stream().filter(t->task.equals(t.get("id"))).findFirst().orElseThrow().get("flowFingerprint").toString();
   w.removeTask(task,Map.of("confirmed",true,"fingerprint",fingerprint,"reason","Acil işe yer açıldı"));
   String next=add(id,sprint);var result=m.valueToTree(history.read(id));
   var attempts=result.path("records").get(0).path("attempts");assertEquals(2,attempts.size());
   assertEquals(1,attempts.findValues("status").stream().filter(v->"removed".equals(v.asText())).count());
   assertTrue(result.toString().contains("Acil işe yer açıldı"));assertTrue(result.toString().contains(next));
 }
 @Test void plannedRemovalUsesDurableActivityWhenNoScopeEventExists(){
   String id=item("Plan değişti");
   String planned=w.createSprint(Map.of("name","Planlı QA","start","2026-10-27","end","2026-11-16")).get("id").toString(),task=add(id,planned);
   var tasks=(List<Map<String,Object>>)w.sprint(planned).get("items");var t=tasks.stream().filter(a->task.equals(a.get("id"))).findFirst().orElseThrow();
   w.removeTask(task,Map.of("confirmed",true,"fingerprint",t.get("flowFingerprint"),"reason","Öncelik değişti"));
   assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM sprint_scope_event WHERE sprint_id=?",Integer.class,planned));
   assertEquals("removed",m.valueToTree(history.read(id)).path("records").get(0).path("attempts").get(0).path("status").asText());
 }
 @Test void readOnlyAuthenticatedMissingAndLegacyWithoutInventedEvents()throws Exception{
   String id=item("Sadece havuz");int count=db.queryForObject("SELECT COUNT(*) FROM audit_event",Integer.class);
   var value=m.valueToTree(history.read(id));assertEquals(0,value.path("records").get(0).path("attempts").size());
   assertEquals(count,db.queryForObject("SELECT COUNT(*) FROM audit_event",Integer.class));
   mvc.perform(get("/api/backlog/"+id+"/history")).andExpect(status().isUnauthorized());
   mvc.perform(get("/api/backlog/"+id+"/history").with(user("reader").roles("USER"))).andExpect(status().isOk());
   mvc.perform(get("/api/backlog/missing/history").with(user("reader").roles("USER"))).andExpect(status().isNotFound());
   String old=db.queryForObject("SELECT t.backlog_id FROM sprint_task t JOIN sprint s ON s.id=t.sprint_id WHERE s.status='completed' ORDER BY s.number,t.id LIMIT 1",String.class);
   var attempt=m.valueToTree(history.read(old)).path("records").get(0).path("attempts").get(0);
   assertEquals(0,attempt.path("events").size());assertFalse(attempt.path("status").asText().isBlank());
 }
}
