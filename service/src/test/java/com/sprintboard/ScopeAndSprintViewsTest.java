package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.jdbc.core.JdbcTemplate;
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:scopeviews;DB_CLOSE_DELAY=-1","sprintboard.slack.worker-enabled=false","sprintboard.auto-backup.enabled=false"})
@Transactional
class ScopeAndSprintViewsTest {
 @Autowired WorkspaceService w;@Autowired JdbcTemplate db;
 String sprint(){return w.createSprint(Map.of("name","QA sprint","start","2026-10-06","end","2026-10-26")).get("id").toString();}
 String member(){return w.createMember(Map.of("name","Developer","role","Member","teamRole","DEVELOPER","engagement","CORE","joinedOn","2026-01-01")).get("id").toString();}
 String task(String s,String m,String category,String subtype,String reserve,double hours){return w.createSprintTask(s,Map.of("title","QA "+subtype,"criteria","QA","taskCategory",category,"taskSubtype",subtype,"size","SMALL","readinessAcknowledged",true,"reason","QA","reserveTaskId",reserve,"assignments",List.of(Map.of("memberId",m,"estimatedHours",hours,"supportOnly",false)))).get("id").toString();}
 @SuppressWarnings("unchecked") Map<String,Object> task(String s,String id){return ((List<Map<String,Object>>)w.sprint(s).get("items")).stream().filter(t->id.equals(t.get("id"))).findFirst().orElseThrow();}
 @SuppressWarnings("unchecked") Map<String,Object> flow(String s){return (Map<String,Object>)w.sprint(s).get("flow");}
 void count(String s,int added,int removed){assertEquals(added,((Number)flow(s).get("added")).intValue());assertEquals(removed,((Number)flow(s).get("removed")).intValue());}
 @Test void reserveExecutionNotScopeGrowthAndNoDoubleCounting(){
  String m=member(),s=sprint(),r=task(s,m,"BAU","DEFECT_SUPPORT","",8);w.startSprint(s);
  String d=task(s,m,"DEFECT","TEST_DEFECT",r,3);count(s,0,0);assertEquals(false,task(s,d).get("emergency"));assertEquals(5d,task(s,r).get("planningHours"));assertEquals(3d,task(s,d).get("planningHours"));
  String before=db.queryForObject("SELECT task_json FROM sprint_scope_event WHERE sprint_id=?",String.class,s);
  w.linkDefectReserve(d,Map.of("reserveTaskId",""));count(s,1,0);assertEquals(true,task(s,d).get("emergency"));
  w.linkDefectReserve(d,Map.of("reserveTaskId",r));count(s,0,0);assertEquals(before,db.queryForObject("SELECT task_json FROM sprint_scope_event WHERE sprint_id=?",String.class,s));
  w.removeTask(d,Map.of("confirmed",true,"fingerprint",task(s,d).get("flowFingerprint"),"reason","Return"));count(s,0,0);assertEquals(2,((List<?>)flow(s).get("events")).size());assertEquals(8d,task(s,r).get("planningHours"));
 }
 @Test void laterReserveLinkReclassifiesAndOverageRemainsExtraScope(){
  String m=member(),s=sprint(),r=task(s,m,"BAU","DEFECT_SUPPORT","",8);w.startSprint(s);
  String d=task(s,m,"DEFECT","PROD_DEFECT","",2);count(s,1,0);w.linkDefectReserve(d,Map.of("reserveTaskId",r));count(s,0,0);
  w.replaceAssignments(d,Map.of("assignments",List.of(Map.of("memberId",m,"estimatedHours",10,"supportOnly",false))));count(s,1,0);assertEquals(2d,task(s,d).get("extraPlanHours"));assertEquals(true,task(s,d).get("emergency"));
  w.replaceAssignments(d,Map.of("assignments",List.of(Map.of("memberId",m,"estimatedHours",0,"supportOnly",true))));count(s,0,0);assertEquals(false,task(s,d).get("emergency"));
 }
 @Test void overviewAndBacklogUseSprintStatusNotTaskStatus(){
  String m=member(),closed=sprint();db.update("UPDATE sprint SET status='completed' WHERE id=?",closed);
  String active=sprint();w.startSprint(active);String planned=sprint();String a=task(active,m,"DEV","","",1),p=task(planned,m,"DEV","","",1);w.updateTask(a,Map.of("status","done"));
  var o=w.overview();assertEquals(3,o.get("totalSprints"));assertEquals(1,o.get("completedSprints"));assertEquals(1L,o.get("activeSprints"));assertEquals(1L,o.get("plannedSprints"));
  var ai=w.backlog().stream().filter(t->a.equals(t.get("taskId"))).findFirst().orElseThrow();var pi=w.backlog().stream().filter(t->p.equals(t.get("taskId"))).findFirst().orElseThrow();assertEquals("Done",ai.get("state"));assertEquals("active",ai.get("sprintStatus"));assertEquals("planned",pi.get("sprintStatus"));assertEquals("QA sprint",pi.get("sprintName"));
 }
}
