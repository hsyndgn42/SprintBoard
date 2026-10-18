package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:defectplanningeffort;DB_CLOSE_DELAY=-1","sprintboard.auto-backup.enabled=false"})
@Transactional
class DefectPlanningEffortTest {
 @Autowired WorkspaceService w;
 Map<String,Object> assignment(String member,double hours,boolean x){return Map.of("memberId",member,"estimatedHours",hours,"supportOnly",x);}
 String create(String sprint,String category,String subtype,String reserve,double estimate,List<Map<String,Object>> assignments){
  return w.createSprintTask(sprint,Map.of("title","QA "+subtype,"taskCategory",category,"taskSubtype",subtype,"size","SMALL","criteria","QA","estimatedHours",estimate,"reserveTaskId",reserve,"assignments",assignments,"reason","QA","readinessAcknowledged",true)).get("id").toString();
 }
 @SuppressWarnings("unchecked") Map<String,Object> task(String sprint,String id){return ((List<Map<String,Object>>)w.sprint(sprint).get("items")).stream().filter(t->id.equals(t.get("id"))).findFirst().orElseThrow();}
 double total(String sprint){return w.workTypeReports().stream().filter(r->sprint.equals(r.get("sprintId"))).mapToDouble(r->DefectReserve.number(r,"effortHours")).sum();}
 double capacityPlan(String sprint,String member){return DefectReserve.number(w.capacity(sprint).stream().filter(r->member.equals(r.get("memberId"))).findFirst().orElseThrow(),"plannedHours");}
 String member(){return w.createMember(Map.of("name","Defect QA","role","Developer","teamRole","DEVELOPER","engagement","CORE","joinedOn","2026-01-01")).get("id").toString();}
 String sprint(){return w.createSprint(Map.of("name","Defect effort QA","start","2026-10-06","end","2026-10-26")).get("id").toString();}
 @Test void zeroIntakeEstimateUsesAssignmentsAndReserveIsCountedOnlyOnce(){
  String m=member(),s=sprint();w.startSprint(s);
  double baseline=total(s),baselineCapacity=capacityPlan(s,m);
  String reserve=create(s,"BAU","DEFECT_SUPPORT","",0,List.of(assignment(m,8,false)));
  String defect=create(s,"DEFECT","TEST_DEFECT",reserve,0,List.of());
  w.replaceAssignments(defect,Map.of("assignments",List.of(assignment(m,1,false))));
  assertEquals(0d,task(s,defect).get("estimatedHours"),"Keep original estimate, do not migrate stored data");
  assertEquals(1d,task(s,defect).get("planningHours"));
  assertEquals(1d,task(s,defect).get("reserveCoveredHours"));assertEquals(0d,task(s,defect).get("extraPlanHours"));
  assertEquals(false,task(s,defect).get("emergency"));assertEquals(7d,task(s,reserve).get("planningHours"));
  assertEquals(baseline+8,total(s));assertEquals(baselineCapacity+8,capacityPlan(s,m));
  w.replaceAssignments(defect,Map.of("assignments",List.of(assignment(m,10,false))));
  assertEquals(10d,task(s,defect).get("planningHours"));assertEquals(8d,task(s,defect).get("reserveCoveredHours"));assertEquals(2d,task(s,defect).get("extraPlanHours"));
  assertEquals(true,task(s,defect).get("emergency"));assertEquals(0d,task(s,reserve).get("planningHours"));
  assertEquals(baseline+10,total(s));assertEquals(baselineCapacity+10,capacityPlan(s,m));
  w.linkDefectReserve(defect,Map.of("reserveTaskId",""));
  assertEquals(10d,task(s,defect).get("planningHours"));assertEquals(10d,task(s,defect).get("extraPlanHours"));assertEquals(baseline+18,total(s));
 }
 @Test void prodDefectUsesMultipleAssignmentsExcludesXAndRetainsUnassignedEstimate(){
  String a=member(),b=member(),s=sprint();
  String defect=create(s,"DEFECT","PROD_DEFECT","",5,List.of());
  assertEquals(5d,task(s,defect).get("planningHours"));
  w.replaceAssignments(defect,Map.of("assignments",List.of(assignment(a,1,false),assignment(b,2,false))));
  assertEquals(3d,task(s,defect).get("planningHours"));assertEquals(3d,task(s,defect).get("extraPlanHours"));
  w.replaceAssignments(defect,Map.of("assignments",List.of(assignment(a,1,false),assignment(b,0,true))));
  assertEquals(1d,task(s,defect).get("planningHours"));
  w.replaceAssignments(defect,Map.of("assignments",List.of(assignment(a,0,true))));
  assertEquals(0d,task(s,defect).get("planningHours"));
  w.replaceAssignments(defect,Map.of("assignments",List.of()));assertEquals(5d,task(s,defect).get("planningHours"));
 }
}
