package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@org.junit.jupiter.api.Tag("historical")
@org.springframework.test.context.ActiveProfiles("historical-tests")
@SpringBootTest(properties="spring.datasource.url=jdbc:h2:mem:leave-ledger;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
@Transactional
class LeaveLedgerTest {
  @Autowired WorkspaceService w; @Autowired JdbcTemplate j; @Autowired ObjectMapper m; @Autowired BackupService backups; @Autowired MockMvc mvc;
  String member,sprint;
  @BeforeEach void setup(){member=w.createMember(Map.of("name","Leave QA")).get("id").toString();sprint=w.createSprint(Map.of("name","Leave QA Sprint","start","2027-06-07","end","2027-06-25")).get("id").toString();}
  Map<String,Object> leave(String type,double days){return new HashMap<>(Map.of("memberId",member,"sprintId",sprint,"leaveType",type,"days",days,"overtimeAccounting","DEBIT"));}
  void earn(double hours){w.createOvertimeEntry(Map.of("memberId",member,"sprintId",sprint,"earnedHours",hours));}
  double balance(){return ((Number)w.overtimeBalances().stream().filter(r->member.equals(r.get("memberId"))).findFirst().orElseThrow().get("balanceHours")).doubleValue();}
  double capacity(){return ((Number)w.capacity(sprint).stream().filter(r->member.equals(r.get("memberId"))).findFirst().orElseThrow().get("availableHours")).doubleValue();}
  Map<String,Object> planChange(double before,double after){return Map.of("expectedHours",before,"expectedIncluded",true,"plannedHours",after,"confirmed",true);}
  @Test void editAndDeletePlanUpdateCapacityWithoutTouchingEarnedOvertime(){
    double base=capacity();String id=w.createOvertimeEntry(Map.of("memberId",member,"sprintId",sprint,"plannedHours",8,"includeInCapacity",true)).get("id").toString();
    w.changeOvertimePlan(id,planChange(8,4),false);assertEquals(base+4,capacity());assertEquals(0,balance());
    assertThrows(IllegalArgumentException.class,()->w.changeOvertimePlan(id,planChange(8,2),false));
    for(double invalid:new double[]{0,-1,501,Double.NaN})assertThrows(IllegalArgumentException.class,()->w.changeOvertimePlan(id,planChange(4,invalid),false));
    assertThrows(IllegalArgumentException.class,()->w.changeOvertimePlan(id,Map.of("expectedHours",4,"expectedIncluded",true),true));
    w.changeOvertimePlan(id,planChange(4,0),true);assertEquals(base,capacity());assertEquals(0,balance());assertEquals(0,j.queryForObject("SELECT COUNT(*) FROM overtime_entry WHERE id=?",Integer.class,id));
    String mixed=w.createOvertimeEntry(Map.of("memberId",member,"sprintId",sprint,"earnedHours",3,"plannedHours",6,"includeInCapacity",true)).get("id").toString();
    w.changeOvertimePlan(mixed,planChange(6,2),false);assertEquals(3,balance());assertEquals(base+2,capacity());
    w.changeOvertimePlan(mixed,planChange(2,0),true);assertEquals(3,balance());assertEquals(base,capacity());assertEquals(1,j.queryForObject("SELECT COUNT(*) FROM overtime_entry WHERE id=?",Integer.class,mixed));
    assertEquals(4,j.queryForObject("SELECT COUNT(*) FROM audit_event WHERE entity_id IN (?,?) AND action IN ('plan-updated','plan-removed')",Integer.class,id,mixed));
  }
  @Test void closedSprintAndActualOnlyEntriesCannotBeEditedAsPlans(){
    String actual=w.createOvertimeEntry(Map.of("memberId",member,"sprintId",sprint,"earnedHours",4)).get("id").toString();
    assertThrows(IllegalArgumentException.class,()->w.changeOvertimePlan(actual,planChange(0,2),false));
    String plan=w.createOvertimeEntry(Map.of("memberId",member,"sprintId",sprint,"plannedHours",8,"includeInCapacity",true)).get("id").toString();
    j.update("UPDATE sprint SET status='completed' WHERE id=?",sprint);
    assertThrows(IllegalArgumentException.class,()->w.changeOvertimePlan(plan,planChange(8,4),false));
    assertThrows(IllegalArgumentException.class,()->w.changeOvertimePlan(plan,planChange(8,0),true));assertEquals(4,balance());
  }
  @Test void annualAndCompanyLeaveNeverDebitOvertime(){earn(40);double cap=capacity();w.createLeave(leave("ANNUAL",1));w.createLeave(leave("COMPANY_GRANTED",.5));assertEquals(40,balance());assertEquals(cap-12,capacity());}
  @Test void compensatoryLeaveDebitsExactlyOnceAndEditingRefundsOldAmount(){earn(40);double cap=capacity();String id=w.createLeave(leave("OVERTIME",2)).get("id").toString();assertEquals(24,balance());assertEquals(cap-16,capacity());assertEquals(0,j.queryForObject("SELECT SUM(used_hours) FROM overtime_entry WHERE member_id=?",Double.class,member));w.updateLeave(id,leave("OVERTIME",1));assertEquals(32,balance());w.updateLeave(id,leave("OVERTIME",1));assertEquals(32,balance());w.updateLeave(id,leave("ANNUAL",1));assertEquals(40,balance());}
  @Test void focusDoesNotReduceDebitAndStoredHoursSurvivePolicyChanges(){j.update("UPDATE sprint_member_policy SET hours_per_day=6,focus_percent=50 WHERE sprint_id=? AND member_id=?",sprint,member);earn(30);String id=w.createLeave(leave("OVERTIME",1)).get("id").toString();assertEquals(24,balance());j.update("UPDATE sprint_member_policy SET hours_per_day=8 WHERE sprint_id=? AND member_id=?",sprint,member);w.updateLeave(id,leave("OVERTIME",1));assertEquals(24,balance());}
  @Test void insufficientBalanceAndInvalidInputsHaveNoPartialEffects(){earn(4);int count=w.leaves().size();assertThrows(IllegalArgumentException.class,()->w.createLeave(leave("OVERTIME",1)));assertEquals(count,w.leaves().size());assertEquals(4,balance());for(double d:new double[]{0,-1,.3,Double.NaN,Double.POSITIVE_INFINITY})assertThrows(IllegalArgumentException.class,()->w.createLeave(leave("ANNUAL",d)));assertThrows(IllegalArgumentException.class,()->w.createLeave(leave("UNSPECIFIED",1)));}
  @Test void historicalUsageIsNotDebitedAgain(){j.update("INSERT INTO overtime_snapshot VALUES (?,?,?,?,?,?)","qa-snapshot",member,sprint,40,16,24);var input=leave("OVERTIME",2);input.put("overtimeAccounting","IN_SNAPSHOT");w.createLeave(input);assertEquals(24,balance());assertThrows(IllegalArgumentException.class,()->{var invalid=leave("OVERTIME",1);invalid.put("memberId","legacy-member-cemil");invalid.put("overtimeAccounting","IN_SNAPSHOT");w.createLeave(invalid);});}
  @Test void onlyLatestSnapshotAndIncrementalEntriesAreSummed(){j.update("INSERT INTO overtime_snapshot VALUES (?,?,?,?,?,?)","qa-old",member,"legacy-sprint-01",40,8,32);j.update("INSERT INTO overtime_snapshot VALUES (?,?,?,?,?,?)","qa-new",member,"legacy-sprint-02",0,16,24);earn(8);w.createLeave(leave("OVERTIME",1));assertEquals(24,balance());}
  @Test void datesMustFitSprintAndNotOverlapOrChargeHolidays(){var input=leave("ANNUAL",1);input.put("start","2027-06-07");input.put("end","2027-06-07");w.createNonWorkingDay(Map.of("date","2027-06-07","title","QA holiday"));assertThrows(IllegalArgumentException.class,()->w.createLeave(input));input.put("start","2027-06-08");input.put("end","2027-06-08");w.createLeave(input);assertThrows(IllegalArgumentException.class,()->w.createLeave(input));input.put("start","2027-06-28");input.put("end","2027-06-28");assertThrows(IllegalArgumentException.class,()->w.createLeave(input));}
  @Test void manualUsageIsRejectedAndPlannedHoursAreNotEarned(){assertThrows(IllegalArgumentException.class,()->w.createOvertimeEntry(Map.of("memberId",member,"sprintId",sprint,"usedHours",8)));assertThrows(IllegalArgumentException.class,()->earn(Double.NaN));double cap=capacity();w.createOvertimeEntry(Map.of("memberId",member,"sprintId",sprint,"earnedHours",0,"plannedHours",8,"includeInCapacity",true));assertEquals(0,balance());assertEquals(cap+8,capacity());}
  @Test void backupRoundTripAndV28UpgradePreserveUnknownHistory(){earn(24);w.createLeave(leave("OVERTIME",1));ObjectNode current=m.valueToTree(backups.exportData());assertEquals(41, current.path("schemaVersion").asInt());assertNotNull(backups.preview(current));ObjectNode old=current.deepCopy();((ObjectNode)old.path("tables")).remove("member_photo");old.put("schemaVersion",28);BackupFixtureV41.removeMatching(old);old.path("tables").path("overtime_entry").forEach(r->((ObjectNode)r).remove(java.util.List.of("task_id","task_title","roadmap_id","roadmap_title")));((ObjectNode)old.path("tables")).remove(java.util.List.of("task_activity","overtime_request","leave_request","defect_reserve_link"));old.path("tables").path("leave_record").forEach(r->{var o=(ObjectNode)r;o.remove("overtime_hours");o.remove("overtime_accounting");o.put("leave_type","UNSPECIFIED");});var preview=backups.preview(old);backups.restore(m.valueToTree(Map.of("backup",old,"confirmation","GERİ YÜKLE","currentFingerprint",preview.get("currentFingerprint"),"backupFingerprint",preview.get("backupFingerprint"))));assertTrue(w.leaves().stream().allMatch(r->"UNSPECIFIED".equals(r.get("leaveType"))));assertEquals(24,balance());preview=backups.preview(current);backups.restore(m.valueToTree(Map.of("backup",current,"confirmation","GERİ YÜKLE","currentFingerprint",preview.get("currentFingerprint"),"backupFingerprint",preview.get("backupFingerprint"))));assertEquals(16,balance());var invalid=current.deepCopy();((ObjectNode)invalid.path("tables").path("leave_record").get(0)).put("overtime_hours",-1);assertThrows(IllegalArgumentException.class,()->backups.preview(invalid));}
  @Test void readOnlyUsersCannotChangeLeave()throws Exception{mvc.perform(put("/api/leaves/test").with(user("reader").roles("USER")).with(csrf()).contentType("application/json").content(m.writeValueAsString(leave("ANNUAL",1)))).andExpect(status().isForbidden());mvc.perform(post("/api/leaves").with(user("admin").roles("ADMIN")).contentType("application/json").content(m.writeValueAsString(leave("ANNUAL",1)))).andExpect(status().isForbidden());mvc.perform(get("/api/overtime/balances").with(user("reader").roles("USER"))).andExpect(status().isOk());}
}
