package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:defectreserve;DB_CLOSE_DELAY=-1","sprintboard.backup-directory=./tmp/defect-reserve-test-backups"})
@AutoConfigureMockMvc @Transactional
@org.junit.jupiter.api.Tag("historical")
@org.springframework.test.context.ActiveProfiles("historical-tests")
class DefectReserveTest {
 @Autowired WorkspaceService w;@Autowired BackupService backups;@Autowired JdbcTemplate db;@Autowired ObjectMapper m;@Autowired MockMvc mvc;
 String sprint="legacy-sprint-14",isa="legacy-member-isa",cemil="legacy-member-cemil";
 Map<String,Object> assignment(String member,double hours,boolean x){return Map.of("memberId",member,"estimatedHours",hours,"supportOnly",x);}
 String create(String category,String subtype,String reserve,List<Map<String,Object>> assignments){
  return w.createSprintTask(sprint,Map.of("title","QA "+subtype,"taskCategory",category,"taskSubtype",subtype,"size","SMALL","criteria","QA","estimatedHours",0,"reserveTaskId",reserve,"assignments",assignments,"reason","QA","readinessAcknowledged",true)).get("id").toString();
 }
 String reserve(){return create("BAU","DEFECT_SUPPORT","",List.of(assignment(isa,16,false),assignment(cemil,8,false)));}
 @SuppressWarnings("unchecked") List<Map<String,Object>> tasks(){return (List<Map<String,Object>>)w.sprint(sprint).get("items");}
 Map<String,Object> task(String id){return tasks().stream().filter(t->id.equals(t.get("id"))).findFirst().orElseThrow();}
 double cap(String member){return DefectReserve.number(w.capacity(sprint).stream().filter(r->member.equals(r.get("memberId"))).findFirst().orElseThrow(),"plannedHours");}
 @SuppressWarnings("unchecked") Map<String,Object> summary(){return ((List<Map<String,Object>>)w.sprint(sprint).get("defectReserves")).getFirst();}
 void remove(String id){w.removeTask(id,Map.of("confirmed",true,"fingerprint",task(id).get("flowFingerprint"),"reason","QA geri dönüş"));}
 @Test void reserveCoverageDeterminesEmergencyInAdmissionOrder(){
  String r=reserve();
  String first=create("DEFECT","TEST_DEFECT",r,List.of(assignment(isa,10,false)));
  String second=create("DEFECT","TEST_DEFECT",r,List.of(assignment(isa,10,false)));
  assertEquals(false,task(first).get("emergency"));assertEquals(10d,task(first).get("reserveCoveredHours"));
  assertEquals(true,task(second).get("emergency"));assertEquals(4d,task(second).get("extraPlanHours"));
  w.replaceAssignments(second,Map.of("assignments",List.of(assignment(isa,6,false))));
  assertEquals(false,task(second).get("emergency"));
  w.linkDefectReserve(first,Map.of("reserveTaskId",""));
  assertEquals(true,task(first).get("emergency"));assertEquals(10d,task(first).get("extraPlanHours"));
  assertEquals(false,task(second).get("emergency"));
  w.replaceAssignments(first,Map.of("assignments",List.of(assignment(isa,0,true))));
  assertEquals(false,task(first).get("emergency"));assertEquals(0d,task(first).get("extraPlanHours"));
 }
 @Test void perPersonBalanceCannotMaskAnotherPersonsOverageAndXDoesNotConsume(){
  double before=cap(isa),cb=cap(cemil);String r=reserve();
  String d=create("DEFECT","PROD_DEFECT",r,List.of(assignment(isa,10,false),assignment(cemil,12,false)));
  assertEquals(before+16,cap(isa));assertEquals(cb+12,cap(cemil));
  assertEquals(24d,summary().get("reservedHours"));assertEquals(22d,summary().get("allocatedHours"));
  assertEquals(6d,summary().get("remainingHours"));assertEquals(4d,summary().get("overHours"));assertEquals(6d,task(r).get("planningHours"));
  assertEquals("todo",task(d).get("status"),"BAU automatic result must not complete defects");
  w.replaceAssignments(d,Map.of("assignments",List.of(assignment(isa,0,true))));
  assertEquals(before+16,cap(isa));assertEquals(cb+8,cap(cemil));assertEquals(0d,summary().get("allocatedHours"));
 }
 @Test void assignmentsUnlinkRemovalAndReportsNeverDoubleCount(){
  double before=cap(isa);String r=reserve(),d=create("DEFECT","TEST_DEFECT",r,List.of(assignment(isa,20,false)));
  assertEquals(before+20,cap(isa));assertEquals(4d,summary().get("overHours"));
  w.linkDefectReserve(d,Map.of("reserveTaskId",""));assertEquals(before+36,cap(isa));
  w.linkDefectReserve(d,Map.of("reserveTaskId",r));assertEquals(before+20,cap(isa));
  var person=MemberReportBuilder.build(w.sprint(sprint),w.capacity(sprint),w.team(),Map.of(),Set.of()).stream().filter(x->isa.equals(x.get("memberId"))).findFirst().orElseThrow();
  assertEquals(cap(isa),DefectReserve.number(person,"effortHours"));
  var reserveType=w.workTypeReports().stream().filter(x->sprint.equals(x.get("sprintId"))&&"DEFECT_SUPPORT".equals(x.get("taskSubtype"))).findFirst().orElseThrow();
  assertEquals(8d,reserveType.get("effortHours"));assertEquals(summary().get("allocatedHours"),w.defectReserveReports().getFirst().get("allocatedHours"));
  remove(d);assertEquals(before+16,cap(isa));assertEquals(24d,summary().get("remainingHours"));
  assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM defect_reserve_link",Integer.class));
 }
 @Test void validationAuthorizationAndFrozenClosure()throws Exception{
  String r=reserve(),d=create("DEFECT","TEST_DEFECT",r,List.of(assignment(isa,10,false)));
  assertThrows(IllegalArgumentException.class,()->w.linkDefectReserve(r,Map.of("reserveTaskId",d)));
  assertThrows(IllegalArgumentException.class,()->w.linkDefectReserve(d,Map.of("reserveTaskId","missing")));
  assertThrows(IllegalArgumentException.class,()->w.updateTask(d,Map.of("taskCategory","DEV","taskSubtype","")));
  assertThrows(IllegalArgumentException.class,()->remove(r));
  String second=w.createSprint(Map.of("name","QA next","start","2027-01-04","end","2027-01-22")).get("id").toString();
  String other=db.queryForObject("SELECT id FROM sprint_task WHERE sprint_id=? AND task_subtype='DEFECT_SUPPORT'",String.class,second);
  assertThrows(IllegalArgumentException.class,()->w.linkDefectReserve(d,Map.of("reserveTaskId",other)));
  mvc.perform(put("/api/tasks/"+d+"/reserve").with(user("member").roles("USER")).with(csrf()).contentType("application/json").content("{}")).andExpect(status().isForbidden());
  mvc.perform(put("/api/tasks/"+d+"/reserve").with(user("admin").roles("ADMIN")).contentType("application/json").content("{}")).andExpect(status().isForbidden());
  var preview=w.closurePreview(sprint);w.completeSprint(sprint,Map.of("confirmed",true,"fingerprint",preview.get("fingerprint"),"carryTaskIds",List.of(d)));
  var frozen=m.valueToTree(w.sprint(sprint));assertTrue(frozen.path("closureFrozen").asBoolean());
  assertEquals("undone",task(d).get("status"));
  assertThrows(IllegalArgumentException.class,()->w.linkDefectReserve(d,Map.of("reserveTaskId","")));
  assertEquals(frozen,m.valueToTree(w.sprint(sprint)));
  var person=w.memberReports().stream().filter(x->sprint.equals(x.get("sprintId"))&&isa.equals(x.get("memberId"))).findFirst().orElseThrow();assertEquals(cap(isa),DefectReserve.number(person,"effortHours"));
  String next=db.queryForObject("SELECT id FROM backlog_item WHERE repeat_of_id=?",String.class,task(d).get("backlogId"));
  assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM sprint_task WHERE backlog_id=?",Integer.class,next));
 }
 @Test void backupRoundTripAndOldV32Upgrade(){
  ObjectNode old=m.valueToTree(backups.exportData());old.put("schemaVersion",32);BackupFixtureV41.removeMatching(old);((ObjectNode)old.path("tables")).remove("defect_reserve_link");
  assertDoesNotThrow(()->backups.preview(old));
  String r=reserve();create("DEFECT","TEST_DEFECT",r,List.of(assignment(isa,10,false)));
  ObjectNode saved=m.valueToTree(backups.exportData());assertEquals(41,saved.path("schemaVersion").asInt());
  var p=backups.preview(saved);var request=m.createObjectNode();request.set("backup",saved);request.put("confirmation","GERİ YÜKLE");p.forEach((k,v)->request.set(k,m.valueToTree(v)));
  var expected=m.valueToTree(w.sprint(sprint));backups.restore(request);assertEquals(expected,m.valueToTree(w.sprint(sprint)));
  var bad=saved.deepCopy();((ObjectNode)bad.path("tables").path("defect_reserve_link").get(0)).put("reserve_task_id","missing");
  assertThrows(IllegalArgumentException.class,()->backups.preview(bad));
 }
}
