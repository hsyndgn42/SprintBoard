package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
class MemberReportBuilderTest {
 private Map<String,Object> member(String id,String role,String engagement){return Map.of("id",id,"name",id,"teamRole",role,"engagement",engagement);}
 private Map<String,Object> assignment(String id,double hours,boolean x){return Map.of("memberId",id,"memberName",id,"estimatedHours",hours,"supportOnly",x);}
 private Map<String,Object> task(String kind,List<Map<String,Object>> assignments){return Map.of("workKind",kind,"taskCategory","LEAVE".equals(kind)?"BAU":"DEV","status","done","size","SMALL","assignments",assignments);}
 private Map<String,Object> cap(String id,boolean support,boolean explicit){return Map.of("memberId",id,"memberName",id,"role","DEVELOPER","allocatedDays",5,"availableHours",24,"leaveDays",2,"nonWorkingDays",1,"overtimeHours",0,"supportMember",support,"allocationExplicit",explicit);}
 private Map<String,Object> sprint(boolean frozen,List<Map<String,Object>> tasks){return Map.of("id","s","number",1,"name","Sprint 1","closureFrozen",frozen,"items",tasks);}
 @Test void deduplicatesTasksExcludesLeaveAndDoesNotTurnXIntoHours(){
   var tasks=List.of(task("DEVELOPMENT",List.of(assignment("a",8,false),assignment("a",4,false),assignment("b",0,true))),task("LEAVE",List.of(assignment("a",999,true))));
   var rows=MemberReportBuilder.build(sprint(false,tasks),List.of(cap("a",false,true),cap("b",true,false)),List.of(member("a","DEVELOPER","CORE"),member("b","ARCHITECT","SUPPORT")),Map.of(),Set.of());
   var a=rows.get(0);var b=rows.get(1);
   assertEquals(1d,a.get("taskCount"));assertEquals(12d,a.get("effortHours"));assertEquals(0d,a.get("supportTaskCount"));assertEquals(2d,a.get("leaveDays"));assertEquals(24d,a.get("availableHours"));
   assertEquals(1d,b.get("taskCount"));assertEquals(1d,b.get("supportTaskCount"));assertEquals(0d,b.get("effortHours"));assertNull(b.get("availableHours"));assertNull(b.get("allocatedDays"));assertEquals("UNSPECIFIED_SUPPORT",b.get("capacitySource"));
 }
 @Test void includesLeaveAndExplicitAllocationWithoutInventingTasksOrParticipation(){
   var noLeave=new HashMap<>(cap("unrelated",false,false));noLeave.put("leaveDays",0);
   var rows=MemberReportBuilder.build(sprint(false,List.of()),List.of(cap("a",false,true),noLeave),List.of(member("a","DEVELOPER","CORE"),member("unrelated","DEVELOPER","CORE")),Map.of("outside",3d),Set.of("a"));
   assertEquals(2,rows.size());assertEquals(0d,rows.get(0).get("taskCount"));
   var outside=rows.stream().filter(r->"outside".equals(r.get("memberId"))).findFirst().orElseThrow();assertNull(outside.get("availableHours"));assertEquals(3d,outside.get("leaveDays"));
 }
 @Test void frozenRowsUseCapturedNameRoleAndCapacityInsteadOfTodaysSupportDefault(){
   var c=new HashMap<>(cap("a",true,false));c.put("memberName","Old name");
   var rows=MemberReportBuilder.build(sprint(true,List.of()),List.of(c),List.of(member("a","ARCHITECT","SUPPORT")),Map.of("new",100d),Set.of("new"));
   assertEquals(1,rows.size());assertEquals("Old name",rows.getFirst().get("memberName"));assertEquals("DEVELOPER",rows.getFirst().get("teamRole"));assertEquals("FROZEN",rows.getFirst().get("capacitySource"));assertEquals(24d,rows.getFirst().get("availableHours"));
 }
 @Test void zeroEffortIsNotAutomaticallyX(){
   var rows=MemberReportBuilder.build(sprint(false,List.of(task("DEVELOPMENT",List.of(assignment("a",0,false))))),List.of(),List.of(),Map.of(),Set.of());
   assertEquals(0d,rows.getFirst().get("supportTaskCount"));assertEquals(1d,rows.getFirst().get("unestimatedTaskCount"));assertNull(rows.getFirst().get("availableHours"));
 }
}
