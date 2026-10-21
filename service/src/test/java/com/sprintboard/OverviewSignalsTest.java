package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Covers the additive dashboard signals on overview() (D-1).
 *
 * These fields exist so the dashboard can point at work that needs
 * attention. They must never redefine an existing concept: delivery scope is
 * the inverse of BauPolicy, exactly as DELIVERY_FILTER already defines it,
 * and every field is a count so the client keeps every denominator.
 */
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:overviewsignals;DB_CLOSE_DELAY=-1","sprintboard.slack.worker-enabled=false","sprintboard.auto-backup.enabled=false"})
@Transactional
class OverviewSignalsTest {
 @Autowired WorkspaceService w;@Autowired JdbcTemplate db;@Autowired SprintFlowService flowService;

 String sprint(){return w.createSprint(Map.of("name","Signals sprint","start","2026-10-06","end","2026-10-26")).get("id").toString();}
 String member(){return w.createMember(Map.of("name","Developer","role","Member","teamRole","DEVELOPER","engagement","CORE","joinedOn","2026-01-01")).get("id").toString();}

 String task(String s,String category,String subtype,double hours,List<Map<String,Object>> assignments){
  return w.createSprintTask(s,Map.of("title","Signal "+category+" "+subtype,"criteria","QA","taskCategory",category,
    "taskSubtype",subtype,"size","SMALL","readinessAcknowledged",true,"reason","QA","estimatedHours",hours,
    "assignments",assignments)).get("id").toString();
 }

 List<Map<String,Object>> assigned(String m,double hours){
  return List.of(Map.of("memberId",m,"estimatedHours",hours,"supportOnly",false));
 }

 long count(Map<String,Object> overview,String key){return ((Number)overview.get(key)).longValue();}

 @Test void noActiveSprintReturnsSafeEmptySignals(){
  var o=w.overview();
  assertNull(o.get("activeSprint"),"precondition: no sprint is active");
  // Null, not zero: "no sprint" is not the same as "a sprint with no days left".
  assertNull(o.get("activeSprintDaysTotal"));
  assertNull(o.get("activeSprintDaysRemaining"));
  // Counts collapse to zero rather than null so the client never branches.
  assertEquals(0L,count(o,"activeSprintBlockedCount"));
  assertEquals(0L,count(o,"activeSprintAddedDuringCount"));
  assertEquals(0L,count(o,"activeSprintUnestimatedCount"));
  assertEquals(0L,count(o,"activeSprintUnassignedCount"));
  assertEquals(List.of(),o.get("activeSprintTypeBreakdown"));
 }

 @Test void daySpanIsInclusiveAndNeverNegative(){
  String s=sprint();w.startSprint(s);
  var o=w.overview();
  // 2026-10-06 .. 2026-10-26 inclusive is 21 days, not 20.
  assertEquals(21,((Number)o.get("activeSprintDaysTotal")).intValue());
  // The fixture end date is in the past relative to any real run of this
  // suite, so remaining must clamp at zero rather than going negative.
  assertTrue(((Number)o.get("activeSprintDaysRemaining")).intValue()>=0,"days remaining must never be negative");
 }

 @Test void unestimatedAndUnassignedCountDeliveryWorkOnly(){
  String m=member(),s=sprint();
  // BAU is excluded from delivery scope, so neither of its gaps may count.
  task(s,"BAU","DEFECT_SUPPORT",0,List.of());
  // Delivery work with no estimate and no assignee: counts in both.
  task(s,"DEV","",0,List.of());
  // Delivery work that is fully specified: counts in neither.
  task(s,"DEV","",4,assigned(m,4));
  // Delivery work estimated but unassigned: counts only as unassigned.
  task(s,"TEST","GENERAL_TEST",2,List.of());
  w.startSprint(s);

  var o=w.overview();
  assertEquals(1L,count(o,"activeSprintUnestimatedCount"),"only the unestimated delivery task counts");
  assertEquals(2L,count(o,"activeSprintUnassignedCount"),"both unassigned delivery tasks count, BAU does not");
 }

 @Test void typeBreakdownCoversDeliveryWorkAndTracksDone(){
  String m=member(),s=sprint();
  String first=task(s,"DEV","",3,assigned(m,3));
  task(s,"DEV","",3,assigned(m,3));
  task(s,"TEST","GENERAL_TEST",2,assigned(m,2));
  task(s,"BAU","DEFECT_SUPPORT",5,assigned(m,5));
  w.startSprint(s);
  w.updateTask(first,Map.of("status","done"));

  @SuppressWarnings("unchecked")
  var breakdown=(List<Map<String,Object>>)w.overview().get("activeSprintTypeBreakdown");

  // BAU never appears: the breakdown describes delivery scope only.
  assertFalse(breakdown.stream().anyMatch(r->"BAU".equals(r.get("category"))),"BAU must stay out of delivery breakdown");

  // Ordered by descending task count, so the client renders it as-is.
  assertEquals("DEV",breakdown.getFirst().get("category"));
  assertEquals(2,((Number)breakdown.getFirst().get("taskCount")).intValue());
  assertEquals(1L,((Number)breakdown.getFirst().get("doneCount")).longValue());

  var test=breakdown.stream().filter(r->"TEST".equals(r.get("category"))).findFirst().orElseThrow();
  assertEquals(1,((Number)test.get("taskCount")).intValue());
  assertEquals(0L,((Number)test.get("doneCount")).longValue());

  // The breakdown must reconcile with the delivery count already shown.
  long breakdownTotal=breakdown.stream().mapToLong(r->((Number)r.get("taskCount")).longValue()).sum();
  @SuppressWarnings("unchecked")
  var active=(Map<String,Object>)w.overview().get("activeSprint");
  assertEquals(((Number)active.get("deliveryTaskCount")).longValue(),breakdownTotal,
    "breakdown must sum to deliveryTaskCount, not redefine delivery scope");
 }

 @Test void blockedCountMatchesFlowAndExcludesBau(){
  String m=member(),s=sprint();
  String blocked=task(s,"DEV","",3,assigned(m,3));
  task(s,"BAU","DEFECT_SUPPORT",5,assigned(m,5));
  w.startSprint(s);
  flowService.setBlocker(blocked,Map.of("blocked",true,"reason","Harici bağımlılık bekleniyor","version",0));

  var o=w.overview();
  assertEquals(1L,count(o,"activeSprintBlockedCount"));

  // The dashboard must report exactly what the sprint board reports; a
  // second, slightly different definition of "blocked" would be worse than
  // no signal at all.
  @SuppressWarnings("unchecked")
  var flow=(Map<String,Object>)w.sprint(s).get("flow");
  assertEquals(((Number)flow.get("blocked")).longValue(),count(o,"activeSprintBlockedCount"));
 }

 @Test void existingOverviewFieldsAreUnchanged(){
  String m=member(),s=sprint();task(s,"DEV","",3,assigned(m,3));w.startSprint(s);
  var o=w.overview();
  // Regression lock: the 19 fields the dashboard already consumed must all
  // still be present, so an older client keeps working unchanged.
  for(String key:List.of("totalSprints","completedSprints","activeSprints","plannedSprints","deliveredTasks",
    "undoneTasks","deliveryRate","activeSprint","recentSprints","roadmapCount","backlogCount","backlogLinkedCount",
    "backlogReadyCount","backlogInSprintCount","activeMemberCount","activeSprintCapacityHours",
    "activeSprintPlannedHours","todayCapacityHours","monthCapacityHours")){
   assertTrue(o.containsKey(key),"overview lost pre-existing field "+key);
  }
 }
}
