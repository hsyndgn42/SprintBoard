package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

@org.junit.jupiter.api.Tag("historical")
@org.springframework.test.context.ActiveProfiles("historical-tests")
@SpringBootTest(properties="spring.datasource.url=jdbc:h2:mem:planmatching;DB_CLOSE_DELAY=-1")
@Transactional
class OvertimePlanMatchingTest {
 @Autowired WorkspaceService w;@Autowired JdbcTemplate db;@Autowired BackupService backups;@Autowired ObjectMapper mapper;
 String member,sprint;
 @BeforeEach void setup(){member=w.createMember(Map.of("name","Plan QA")).get("id").toString();sprint=w.createSprint(Map.of("name","Plan QA","start","2027-06-07","end","2027-06-25")).get("id").toString();}
 Map<String,Object> input(){return new HashMap<>(Map.of("memberId",member,"sprintId",sprint));}
 String plan(double hours){var in=input();in.put("plannedHours",hours);in.put("includeInCapacity",true);return w.createOvertimeEntry(in).get("id").toString();}
 String actual(String plan,double hours){var in=input();in.put("earnedHours",hours);in.put("planMode",plan==null?"UNPLANNED":"PLANNED");in.put("planId",plan==null?"":plan);return w.createOvertimeEntry(in).get("id").toString();}
 Map<String,Object> row(String id){return w.overtimeEntries().stream().filter(e->e.get("id").equals(id)).findFirst().orElseThrow();}
 double cap(){return ((Number)w.capacity(sprint).stream().filter(e->e.get("memberId").equals(member)).findFirst().orElseThrow().get("availableHours")).doubleValue();}
 @Test void partialAndOverrunNeverAddCapacityOrAssignmentsAndCancelledPlanKeepsActuals(){
  double base=cap();String plan=plan(16);int assignments=db.queryForObject("SELECT COUNT(*) FROM assignment",Integer.class);
  actual(plan,8);assertEquals(8d,row(plan).get("planActualHours"));assertEquals(base+16,cap());
  actual(plan,12);String unplanned=actual(null,3);assertEquals(20d,row(plan).get("planActualHours"));assertEquals("UNPLANNED",row(unplanned).get("planClassification"));assertEquals(base+16,cap());
  w.changeOvertimePlan(plan,Map.of("expectedHours",16,"expectedIncluded",true,"plannedHours",10),false);assertEquals(base+10,cap());
  w.changeOvertimePlan(plan,Map.of("expectedHours",10,"expectedIncluded",true,"confirmed",true),true);assertEquals(base,cap());assertEquals(20d,row(plan).get("planActualHours"));assertEquals(0d,row(plan).get("plannedHours"));
  assertEquals(23d,db.queryForObject("SELECT SUM(earned_hours) FROM overtime_entry WHERE member_id=?",Double.class,member));assertEquals(assignments,db.queryForObject("SELECT COUNT(*) FROM assignment",Integer.class));
  assertThrows(IllegalArgumentException.class,()->actual(plan,1));
 }
 @Test void wrongMemberSprintTaskAndDoubleCapacityAreRejected(){
  String plan=plan(16);var in=input();in.put("earnedHours",4);in.put("planMode","PLANNED");in.put("planId",plan);
  in.put("includeInCapacity",true);assertThrows(IllegalArgumentException.class,()->w.createOvertimeEntry(in));in.put("includeInCapacity",false);
  in.put("plannedHours",4);assertThrows(IllegalArgumentException.class,()->w.createOvertimeEntry(in));in.put("plannedHours",0);
  in.put("memberId","legacy-member-isa");assertThrows(IllegalArgumentException.class,()->w.createOvertimeEntry(in));in.put("memberId",member);
  in.put("sprintId","legacy-sprint-01");assertThrows(IllegalArgumentException.class,()->w.createOvertimeEntry(in));in.put("sprintId",sprint);
  db.update("UPDATE overtime_entry SET task_id='plan-task' WHERE id=?",plan);assertThrows(IllegalArgumentException.class,()->w.createOvertimeEntry(in));
  assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM overtime_plan_link",Integer.class));
 }
 @Test void backupRoundTripPreservesLinksAndV39DoesNotInventMatches(){
  String plan=plan(16);actual(plan,8);actual(null,2);ObjectNode saved=mapper.valueToTree(backups.exportData());assertEquals(41,saved.path("schemaVersion").asInt());
  var preview=backups.preview(saved);backups.restore(mapper.valueToTree(Map.of("backup",saved,"confirmation","GERİ YÜKLE","currentFingerprint",preview.get("currentFingerprint"),"backupFingerprint",preview.get("backupFingerprint"))));assertEquals(8d,row(plan).get("planActualHours"));
  var bad=saved.deepCopy();((ObjectNode)bad.path("tables").path("overtime_plan_link").get(0)).put("plan_id","missing");assertThrows(IllegalArgumentException.class,()->backups.preview(bad));
  var old=saved.deepCopy();old.put("schemaVersion",39);BackupFixtureV41.removeMatching(old);var p=backups.preview(old);backups.restore(mapper.valueToTree(Map.of("backup",old,"confirmation","GERİ YÜKLE","currentFingerprint",p.get("currentFingerprint"),"backupFingerprint",p.get("backupFingerprint"))));
  assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM overtime_plan_link",Integer.class));assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM overtime_entry WHERE plan_classification<>'LEGACY'",Integer.class));assertEquals(10d,db.queryForObject("SELECT SUM(earned_hours) FROM overtime_entry WHERE member_id=?",Double.class,member));
 }
}
