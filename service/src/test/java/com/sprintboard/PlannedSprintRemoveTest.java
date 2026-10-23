package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.jdbc.core.JdbcTemplate;

/** Pulling work out of a sprint that has not started is a planning correction: the item goes back to the
 *  pool, it is not Undone, and it must not show up as a scope change in the sprint's flow record. */
@SpringBootTest(properties="spring.datasource.url=jdbc:h2:mem:plannedremove;DB_CLOSE_DELAY=-1")
@Transactional
class PlannedSprintRemoveTest {
 @Autowired WorkspaceService w;@Autowired JdbcTemplate db;

 String item(String title){return w.createBacklog(Map.of("title",title,"taskCategory","DEV","size","SMALL","criteria","kapsam","estimatedHours",4)).get("id").toString();}
 String sprint(String name,String start,String end){return w.createSprint(Map.of("name",name,"start",start,"end",end)).get("id").toString();}
 List<Map<String,Object>> tasks(String sprint){return (List<Map<String,Object>>)w.sprint(sprint).get("items");}
 Map<String,Object> task(String sprint,String id){return tasks(sprint).stream().filter(t->id.equals(t.get("id"))).findFirst().orElseThrow();}
 Map<String,Object> state(String sprint){return (Map<String,Object>)w.sprint(sprint).get("flow");}
 String add(String sprint,String backlog){var check=(Map<?,?>)w.readiness(backlog).get("readiness");
   return w.addTask(sprint,Map.of("backlogId",backlog,"readinessAcknowledged",true,"readinessFingerprint",check.get("fingerprint"))).get("id").toString();}
 Map<String,Object> removeInput(Map<String,Object> t){return Map.of("confirmed",true,"fingerprint",t.get("flowFingerprint"),"reason","Bağımlılık çözülmedi, sonraki sprinte bırakıldı");}

 @Test void workReturnsToThePoolAndCanBePlannedAgain(){
   String b=item("Geri gidecek"),s=sprint("Planlı QA","2030-03-04","2030-03-22");
   String task=add(s,b);
   assertEquals("IN_SPRINT",db.queryForObject("SELECT state FROM backlog_item WHERE id=?",String.class,b));
   w.removeTask(task,removeInput(task(s,task)));
   assertEquals("Ready",w.readiness(b).get("state"),"the item is selectable again, not Undone");
   assertTrue(tasks(s).stream().noneMatch(t->task.equals(t.get("id"))),"and it no longer sits in the sprint");
   String again=add(s,b);
   assertNotEquals(task,again,"replanning creates a fresh task rather than reviving the old one");
 }

 @Test void aPlanningCorrectionIsNotRecordedAsAScopeChange(){
   String b=item("Kapsam dışı"),s=sprint("Kapsam QA","2030-04-01","2030-04-19");
   String task=add(s,b);
   w.removeTask(task,removeInput(task(s,task)));
   var flow=state(s);
   assertEquals("UNTRACKED",flow.get("origin"),"a sprint that never started has no baseline to change");
   assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM sprint_flow WHERE sprint_id=?",Integer.class,s));
 }

 @Test void theOperatorMustSayWhyAndConfirmWithAFreshView(){
   String b=item("Gerekçe"),s=sprint("Gerekçe QA","2030-05-06","2030-05-24");
   String task=add(s,b);
   var current=task(s,task);
   assertThrows(IllegalArgumentException.class,()->w.removeTask(task,Map.of("confirmed",true,"fingerprint",current.get("flowFingerprint"),"reason"," ")),"a blank reason is refused");
   assertThrows(IllegalArgumentException.class,()->w.removeTask(task,Map.of("fingerprint",current.get("flowFingerprint"),"reason","Gerekçe")),"an unconfirmed removal is refused");
   assertNotNull(current.get("flowFingerprint"),"a planned sprint still fingerprints its tasks, so the stale-view check is real");
   w.renameTask(task,Map.of("title","Gerekçe · ad değişti","expectedTitle",current.get("name")));
   assertThrows(IllegalArgumentException.class,()->w.removeTask(task,removeInput(current)),"a view taken before the edit is stale");
   w.removeTask(task,removeInput(task(s,task)));
   assertEquals("Ready",w.readiness(b).get("state"));
 }

 @Test void automaticBauWorkStaysPutBecauseNobodyPlannedItByHand(){
   String s=sprint("BAU QA","2030-06-03","2030-06-21");
   var bau=tasks(s).stream().filter(t->String.valueOf(t.get("externalId")).startsWith("BAU-AUTO:")).findFirst();
   bau.ifPresent(t->assertThrows(IllegalArgumentException.class,()->w.removeTask(t.get("id").toString(),removeInput(t))));
 }

 @Test void removingFromASprintThatAlreadyClosedIsRefused(){
   String b=item("Kapanmış"),s=sprint("Kapanış QA","2030-07-01","2030-07-19");
   String task=add(s,b);
   var current=task(s,task);
   w.startSprint(s);
   var preview=w.closurePreview(s);
   w.completeSprint(s,Map.of("confirmed",true,"fingerprint",preview.get("fingerprint"),"carryTaskIds",List.of()));
   assertThrows(IllegalArgumentException.class,()->w.removeTask(task,removeInput(current)));
 }
}
