package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import java.time.*;import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

@org.junit.jupiter.api.Tag("historical")
@org.springframework.test.context.ActiveProfiles("historical-tests")
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:memberpolicytest;DB_CLOSE_DELAY=-1","sprintboard.backup-directory=./tmp/member-policy-test"})
@AutoConfigureMockMvc @Transactional
class MemberCapacityTest {
 @Autowired WorkspaceService w;@Autowired MemberCapacityService p;@Autowired JdbcTemplate j;@Autowired BackupService b;@Autowired ObjectMapper m;@Autowired MockMvc mvc;
 String today(){return LocalDate.now(ZoneId.of("Europe/Istanbul")).toString();}
 Map<String,Object> input(Double hours,int focus){Map<String,Object> i=new HashMap<>();i.put("effectiveFrom",today());i.put("hoursPerDay",hours);i.put("focusPercent",focus);return i;}
 Map<String,Object> row(String sprint,String member){return w.capacity(sprint).stream().filter(r->member.equals(r.get("memberId"))).findFirst().orElseThrow();}
 String sprint(){LocalDate start=LocalDate.now(ZoneId.of("Europe/Istanbul")).plusDays(30);while(start.getDayOfWeek()!=DayOfWeek.MONDAY)start=start.plusDays(1);return w.createSprint(Map.of("name","Policy test","start",start.toString(),"end",start.plusDays(4).toString())).get("id").toString();}
 @Test void historicalDataAndCapacityStayUntouched(){var capacities=w.sprints().stream().map(s->w.capacity(s.get("id").toString())).toList();var before=m.valueToTree(b.exportData()).path("tables");p.save("legacy-member-akin",input(6d,80));assertEquals(capacities,w.sprints().stream().map(s->w.capacity(s.get("id").toString())).toList());var after=m.valueToTree(b.exportData()).path("tables");before.properties().forEach(e->{if(!e.getKey().equals("member_capacity_policy"))assertEquals(e.getValue(),after.path(e.getKey()));});}
 @Test void newSprintFreezesPersonalHoursAndFocusButBauIsNotDiscounted(){
  String member=w.createMember(Map.of("name","Policy QA")).get("id").toString();p.save(member,input(6d,80));String sprint=sprint();assertEquals(24d,row(sprint,member).get("availableHours"));
  assertEquals(12d,j.queryForObject("SELECT a.estimated_hours FROM assignment a JOIN sprint_task t ON t.id=a.task_id WHERE t.sprint_id=? AND t.work_kind='MEETING' AND a.member_id=?",Double.class,sprint,member));
  p.save(member,input(4d,50));assertEquals(24d,row(sprint,member).get("availableHours"));
  w.createLeave(Map.of("leaveType","ANNUAL","memberId",member,"sprintId",sprint,"days",1));assertEquals(19.2,((Number)row(sprint,member).get("availableHours")).doubleValue(),.00001);
  w.createOvertimeEntry(Map.of("memberId",member,"sprintId",sprint,"plannedHours",2,"earnedHours",0,"usedHours",0,"includeInCapacity",true));assertEquals(21.2,((Number)row(sprint,member).get("availableHours")).doubleValue(),.00001);
  var items=(List<Map<String,Object>>)w.sprint(sprint).get("items");var leave=items.stream().filter(t->"LEAVE".equals(t.get("workKind"))).findFirst().orElseThrow();var assignments=(List<Map<String,Object>>)leave.get("assignments");assertEquals(6d,assignments.stream().filter(a->member.equals(a.get("memberId"))).findFirst().orElseThrow().get("hoursPerDay"));
 }
 @Test void supportRequiresAllocatedDaysAndZeroFocusIsAllowed(){String member=w.createMember(Map.of("name","Support QA","engagement","SUPPORT")).get("id").toString();p.save(member,input(6d,50));String sprint=sprint();assertEquals(0d,row(sprint,member).get("availableHours"));w.setSprintMemberAllocation(sprint,member,Map.of("allocatedDays",2));assertEquals(6d,row(sprint,member).get("availableHours"));p.save(member,input(null,0));assertEquals(0d,p.at(member,LocalDate.parse(today()),8).planningHours());}
 @Test void validationBackupRoundTripAndLegacyUpgrade(){
  String member="legacy-member-akin";for(double h:new double[]{0,25,7.2})assertThrows(IllegalArgumentException.class,()->p.save(member,input(h,100)));for(int focus:new int[]{-1,101})assertThrows(IllegalArgumentException.class,()->p.save(member,input(null,focus)));
  p.save(member,input(null,85));String sprint=sprint();ObjectNode current=m.valueToTree(b.exportData());assertEquals(41, current.path("schemaVersion").asInt());restore(current);assertEquals(85,p.forSprint(sprint,member,8).focusPercent());
  ObjectNode old=current.deepCopy();old.path("tables").path("leave_record").forEach(r->{((ObjectNode)r).remove("overtime_hours");((ObjectNode)r).remove("overtime_accounting");});((ObjectNode)old.path("tables")).remove("member_photo");old.put("schemaVersion",26);BackupFixtureV41.removeMatching(old);((ObjectNode)old.path("tables")).remove(java.util.List.of("task_activity","overtime_request","leave_request","defect_reserve_link"));((ObjectNode)old.path("tables")).remove("member_participation");((ObjectNode)old.path("tables")).remove("sprint_member_presence");((ObjectNode)old.path("tables")).remove("member_capacity_policy");((ObjectNode)old.path("tables")).remove("sprint_member_policy");restore(old);assertEquals(100,p.forSprint(sprint,member,8).focusPercent());
  ObjectNode bad=current.deepCopy();((ObjectNode)bad.path("tables").path("member_capacity_policy").get(0)).put("focus_percent",120);assertThrows(IllegalArgumentException.class,()->b.preview(bad));
 }
 void restore(ObjectNode data){var preview=b.preview(data);var r=m.createObjectNode();r.set("backup",data);r.put("confirmation","GERİ YÜKLE");preview.forEach((k,v)->r.set(k,m.valueToTree(v)));b.restore(r);}
 @Test void requiresAdminAndCsrf()throws Exception{String body=m.writeValueAsString(input(6d,80));mvc.perform(put("/api/team/legacy-member-akin/capacity-policy").with(user("reader").roles("USER")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isForbidden());mvc.perform(put("/api/team/legacy-member-akin/capacity-policy").with(user("admin").roles("ADMIN")).contentType("application/json").content(body)).andExpect(status().isForbidden());}
}
