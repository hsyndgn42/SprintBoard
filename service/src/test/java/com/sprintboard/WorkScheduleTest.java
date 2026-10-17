package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import java.util.*;import java.time.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:workscheduletest;DB_CLOSE_DELAY=-1","sprintboard.backup-directory=./tmp/work-schedule-test"})
@AutoConfigureMockMvc @Transactional
class WorkScheduleTest{
 @Autowired WorkspaceService w;@Autowired WorkScheduleService s;@Autowired JdbcTemplate j;@Autowired BackupService b;@Autowired ObjectMapper m;@Autowired MockMvc mvc;
 String today(){return LocalDate.now(ZoneId.of("Europe/Istanbul")).toString();}
 Map<String,Object> input(String date,double hours,List<Integer> days){return Map.of("teamName","Yeni ekip","effectiveFrom",date,"hoursPerDay",hours,"workingDays",days);}
 @Test void settingsPreserveAllHistoricalCalendarAssignmentsAndCapacity(){
  var before=m.valueToTree(b.exportData()).path("tables");var capacities=w.sprints().stream().map(r->w.capacity(r.get("id").toString())).toList();
  w.updateWorkSettings(input(today(),7.5,List.of(1,2,3,4,6)));
  assertEquals("Yeni ekip",w.settings().get("teamName"));assertEquals(7.5,w.settings().get("hoursPerDay"));
  assertEquals(capacities,w.sprints().stream().map(r->w.capacity(r.get("id").toString())).toList());
  var after=m.valueToTree(b.exportData()).path("tables");before.properties().forEach(e->{if(!e.getKey().equals("product_setting"))assertEquals(e.getValue(),after.path(e.getKey()));});
 }
 @Test void policyByDateAndNewSprintSnapshotSurvivesLaterChanges(){
  LocalDate future=LocalDate.now(ZoneId.of("Europe/Istanbul")).plusDays(20);future=future.plusDays((8-future.getDayOfWeek().getValue())%7);String start=future.toString();
  w.updateWorkSettings(input(start,7.5,List.of(1,2,3,4,6)));
  assertEquals(8d,s.at(future.minusDays(1)).hoursPerDay());assertEquals(7.5,s.at(future).hoursPerDay());
  String member=w.createMember(Map.of("name","Work QA")).get("id").toString();String id=w.createSprint(Map.of("name","Work QA","start",start,"end",future.plusDays(6).toString())).get("id").toString();
  assertEquals(37.5,((Number)w.capacity(id).stream().filter(r->member.equals(r.get("memberId"))).findFirst().orElseThrow().get("availableHours")).doubleValue());
  assertEquals(15d,j.queryForObject("SELECT a.estimated_hours FROM assignment a JOIN sprint_task t ON a.task_id=t.id WHERE t.sprint_id=? AND a.member_id=? AND t.work_kind='MEETING'",Double.class,id,member));
  w.updateWorkSettings(input(start,6,List.of(1,2,3)));assertEquals(7.5,s.forSprint(id).hoursPerDay());
  var oldPolicy=(Map<?,?>)w.sprint(id).get("workSettings");assertEquals(7.5,oldPolicy.get("hoursPerDay"));assertEquals(List.of(1,2,3,4,6),oldPolicy.get("workingDays"));
  j.update("UPDATE sprint SET status='completed' WHERE status='active'");j.update("UPDATE sprint SET status='active' WHERE id=?",id);
  assertEquals(7.5,((Map<?,?>)w.closurePreview(id).get("settings")).get("hoursPerDay"));
  w.createNonWorkingDay(Map.of("date",future.plusDays(5).toString(),"title","Saturday off"));
  assertEquals(30d,((Number)w.capacity(id).stream().filter(r->member.equals(r.get("memberId"))).findFirst().orElseThrow().get("availableHours")).doubleValue());
 }
 @Test void validationIsAtomicAndBackupPoliciesAreValidatedAndRestored(){
  var before=m.valueToTree(b.exportData()).path("tables");
  for(double h:new double[]{0,24.5,7.3})assertThrows(IllegalArgumentException.class,()->w.updateWorkSettings(input(today(),h,List.of(1))));
  for(var days:List.of(List.<Integer>of(),List.of(0),List.of(8),List.of(1,1)))assertThrows(IllegalArgumentException.class,()->w.updateWorkSettings(input(today(),8,days)));
  assertThrows(IllegalArgumentException.class,()->w.updateWorkSettings(input("2020-01-01",8,List.of(1))));assertEquals(before,m.valueToTree(b.exportData()).path("tables"));
  w.updateWorkSettings(input(today(),7.5,List.of(1,2,3,4,5)));ObjectNode backup=m.valueToTree(b.exportData());var preview=b.preview(backup);var request=m.createObjectNode();request.set("backup",backup);request.put("confirmation","GERİ YÜKLE");preview.forEach((k,v)->request.set(k,m.valueToTree(v)));b.restore(request);assertEquals(7.5,w.settings().get("hoursPerDay"));
  var bad=backup.deepCopy();for(var row:bad.path("tables").path("product_setting"))if(row.path("setting_key").asText().startsWith("work_schedule:"))((ObjectNode)row).put("setting_value","{\"hoursPerDay\":0,\"workingDays\":[1]}");assertThrows(IllegalArgumentException.class,()->b.preview(bad));
 }
 @Test void workSettingsRequiresAdministratorAndCsrf()throws Exception{
  String body=m.writeValueAsString(input(today(),8,List.of(1,2,3,4,5)));
  mvc.perform(put("/api/settings/work-schedule").with(user("reader").roles("USER")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isForbidden());
  mvc.perform(put("/api/settings/work-schedule").with(user("admin").roles("ADMIN")).contentType("application/json").content(body)).andExpect(status().isForbidden());
 }
 @Test void dailyOverviewUsesTodaysDatedHoursAndKeepsEarlierDates(){
  double before=((Number)w.overview().get("todayCapacityHours")).doubleValue();
  w.updateWorkSettings(input(today(),4,List.of(1,2,3,4,5)));
  assertEquals(before/2,((Number)w.overview().get("todayCapacityHours")).doubleValue());
  assertEquals(8d,s.at(LocalDate.parse(today()).minusDays(1)).hoursPerDay());
 }
}
