package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.jdbc.core.JdbcTemplate;

/** Repeating finished work may now land straight in a sprint that has not started yet. */
@SpringBootTest(properties="spring.datasource.url=jdbc:h2:mem:backlogrepeat;DB_CLOSE_DELAY=-1")
@Transactional
class BacklogRepeatTest {
 @Autowired WorkspaceService w;@Autowired JdbcTemplate db;

 String item(String title){return w.createBacklog(Map.of("title",title,"taskCategory","DEV","size","SMALL","criteria","kapsam","estimatedHours",4)).get("id").toString();}
 String planned(String name,String start,String end){return w.createSprint(Map.of("name",name,"start",start,"end",end)).get("id").toString();}
 String state(String id){return db.queryForObject("SELECT state FROM backlog_item WHERE id=?",String.class,id);}

 @Test void repeatingWithoutASprintStillLandsInThePool(){
   String source=item("Havuza tekrar");
   var result=w.repeatBacklog(source,Map.of("sprintId",""));
   assertNotEquals(source,result.get("id"));
   assertEquals(source,result.get("repeatOfId"));
   assertNull(result.get("sprintId"));
   assertNull(result.get("taskId"));
   assertEquals("Ready",state(result.get("id").toString()));
   assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM sprint_task WHERE backlog_id=?",Integer.class,result.get("id")));
 }

 @Test void repeatingIntoAPlannedSprintCreatesBothTheCopyAndItsTask(){
   String source=item("Sprinte tekrar"),sprint=planned("Tekrar QA","2030-03-04","2030-03-22");
   var result=w.repeatBacklog(source,Map.of("sprintId",sprint));
   String copy=result.get("id").toString();
   assertEquals(sprint,result.get("sprintId"));
   assertNotNull(result.get("taskId"));
   assertEquals("IN_SPRINT",state(copy),"the copy follows its task instead of staying in the pool");
   assertEquals(copy,db.queryForObject("SELECT backlog_id FROM sprint_task WHERE id=?",String.class,result.get("taskId").toString()));
   assertEquals("Ready",state(source),"the original work item is never touched by a repeat");
 }

 @Test void theCopyCarriesTheScopeAndDependenciesOfTheOriginal(){
   String blocker=item("Önce bu");
   String source=w.createBacklog(Map.of("title","Bağımlı iş","taskCategory","DEV","size","LARGE","criteria","kapsam","estimatedHours",9,"priority","HIGH","dependencyIds",List.of(blocker))).get("id").toString();
   String copy=w.repeatBacklog(source,Map.of()).get("id").toString();
   var row=db.queryForMap("SELECT title,criteria,size_code,estimated_hours,priority FROM backlog_item WHERE id=?",copy);
   assertEquals("Bağımlı iş",row.get("TITLE"));
   assertEquals("LARGE",row.get("SIZE_CODE"));
   assertEquals("HIGH",row.get("PRIORITY"));
   assertEquals(9d,((Number)row.get("ESTIMATED_HOURS")).doubleValue());
   assertEquals(List.of(blocker),db.queryForList("SELECT depends_on_id FROM backlog_dependency WHERE backlog_id=?",String.class,copy));
 }

 @Test void anOpenDependencyIsReportedRatherThanSilentlyAccepted(){
   String blocker=item("Önce bu");
   String source=w.createBacklog(Map.of("title","Bağımlı iş","taskCategory","DEV","size","SMALL","criteria","kapsam","estimatedHours",4,"dependencyIds",List.of(blocker))).get("id").toString();
   var result=w.repeatBacklog(source,Map.of("sprintId",planned("Uyarı QA","2030-04-01","2030-04-19")));
   assertNotNull(result.get("taskId"),"the work is still planned; the operator asked for it");
   assertFalse(((List<?>)result.get("readinessWarnings")).isEmpty(),"but the open dependency must come back in the answer");
 }

 @Test void anActiveOrClosedSprintRefusesARepeatBecauseThatWouldBeAnUnrecordedScopeChange(){
   String source=item("Aktif denemesi"),sprint=planned("Aktif QA","2030-05-06","2030-05-24");
   w.startSprint(sprint);
   var failure=assertThrows(IllegalArgumentException.class,()->w.repeatBacklog(source,Map.of("sprintId",sprint)));
   assertTrue(failure.getMessage().contains("başlamamış"));
   assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM backlog_item WHERE repeat_of_id=?",Integer.class,source),"a rejected repeat leaves no orphan copy behind");
 }

 @Test void anUnknownSprintIsRejectedAndAnUnknownItemIsNotFound(){
   String source=item("Bilinmeyen sprint");
   assertThrows(IllegalArgumentException.class,()->w.repeatBacklog(source,Map.of("sprintId","sprint-yok")));
   assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM backlog_item WHERE repeat_of_id=?",Integer.class,source));
   assertNull(w.repeatBacklog("backlog-yok",Map.of()));
 }
}
