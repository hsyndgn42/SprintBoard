package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import java.time.*;import java.util.*;
import org.junit.jupiter.api.Test;import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;import com.fasterxml.jackson.databind.ObjectMapper;import com.fasterxml.jackson.databind.node.ObjectNode;
@org.junit.jupiter.api.Tag("historical")
@org.springframework.test.context.ActiveProfiles("historical-tests")
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:participationtest;DB_CLOSE_DELAY=-1","sprintboard.backup-directory=./tmp/participation-test"})
@AutoConfigureMockMvc @Transactional
class ParticipationTest{
 @Autowired WorkspaceService w;@Autowired ParticipationService p;@Autowired JdbcTemplate j;@Autowired BackupService b;@Autowired ObjectMapper m;@Autowired MockMvc mvc;
 ParticipationService.Period period(String from,String to,boolean closed){return new ParticipationService.Period(from,to,closed);}
 String member(){return w.createMember(Map.of("name","Participation QA","joinedOn","2026-01-01")).get("id").toString();}
 void save(String id,List<ParticipationService.Period> rows){p.save(id,Map.of("version",p.read(id).get("version"),"periods",rows));}
 String sprint(){return w.createSprint(Map.of("name","Participation QA","start","2026-11-02","end","2026-11-06")).get("id").toString();}
 @Test void rejoiningCountsOnlyPresentDaysAndFreezesSprint(){
  String id=member();save(id,List.of(period("2026-01-01","2026-11-02",true),period("2026-11-05",null,false)));
  assertTrue(p.at(id,LocalDate.parse("2026-11-02")));assertFalse(p.at(id,LocalDate.parse("2026-11-03")));assertTrue(p.at(id,LocalDate.parse("2026-11-05")));
  String s=sprint();var row=w.capacity(s).stream().filter(r->id.equals(r.get("memberId"))).findFirst().orElseThrow();assertEquals(3,row.get("workingDays"));assertEquals(24d,row.get("availableHours"));
  var frozen=w.capacity(s);save(id,List.of(period("2026-01-01","2026-02-01",true)));assertEquals(frozen,w.capacity(s));
  String later=sprint();assertTrue(w.capacity(later).stream().noneMatch(r->id.equals(r.get("memberId"))));
  assertEquals(0,j.queryForObject("SELECT COUNT(*) FROM assignment a JOIN sprint_task t ON t.id=a.task_id WHERE t.sprint_id=? AND a.member_id=?",Integer.class,later,id));
 }
 @Test void preservesAllHistoricalSprintsAndProductRows(){
  String id="legacy-member-akin";var caps=w.sprints().stream().map(s->w.capacity(s.get("id").toString())).toList();var before=m.valueToTree(b.exportData()).path("tables");
  save(id,List.of(period("2026-01-01","2026-02-01",true),period("2026-11-01",null,false)));
  assertEquals(caps,w.sprints().stream().map(s->w.capacity(s.get("id").toString())).toList());var after=m.valueToTree(b.exportData()).path("tables");
  before.properties().forEach(e->{if(!e.getKey().equals("member_participation"))assertEquals(e.getValue(),after.path(e.getKey()),e.getKey());});
 }
 @Test void overlapUnknownDatesAndStaleWrites(){
  String id=member();var stale=p.read(id);
  assertThrows(IllegalArgumentException.class,()->save(id,List.of(period("2026-01-01","2026-02-01",true),period("2026-02-01",null,false))));
  assertThrows(IllegalArgumentException.class,()->save(id,List.of(period(null,null,false),period("2026-02-01",null,false))));
  assertThrows(IllegalArgumentException.class,()->save(id,List.of(period("2026-02-01","2026-01-01",true))));
  save(id,List.of(period(null,null,true),period("2026-11-01",null,false)));assertFalse(p.at(id,LocalDate.parse("2026-10-01")));assertTrue(p.at(id,LocalDate.parse("2026-11-01")));
  assertThrows(IllegalArgumentException.class,()->p.save(id,Map.of("version",stale.get("version"),"periods",List.of(period(null,null,false)))));
 }
 @Test void currentStatusAndProfileCannotEraseHistory(){
  String id=member();save(id,List.of(period("2026-01-01","2026-02-01",true)));
  assertEquals(0,w.team().stream().filter(r->id.equals(r.get("id"))).findFirst().orElseThrow().get("active"));
  w.setMemberActive(id,Map.of("active",true));assertEquals(2,p.periods(id).size());assertEquals("2026-02-01",p.periods(id).getFirst().leftOn());
  assertThrows(IllegalArgumentException.class,()->w.updateMember(id,Map.of("name","QA","joinedOn","2026-03-01")));
 }
 @Test void backupRoundTripAndV27Upgrade(){
  String id=member();save(id,List.of(period("2026-01-01","2026-11-02",true),period("2026-11-05",null,false)));String s=sprint();var caps=w.capacity(s);
  ObjectNode current=m.valueToTree(b.exportData());assertEquals(40, current.path("schemaVersion").asInt());restore(current);assertEquals(2,p.periods(id).size());assertEquals(caps,w.capacity(s));
  ObjectNode bad=current.deepCopy();((ObjectNode)bad.path("tables").path("sprint_member_presence").get(0)).put("days_json","[\"2020-01-01\"]");assertThrows(IllegalArgumentException.class,()->b.preview(bad));
  ObjectNode old=current.deepCopy();old.path("tables").path("leave_record").forEach(r->{((ObjectNode)r).remove("overtime_hours");((ObjectNode)r).remove("overtime_accounting");});((ObjectNode)old.path("tables")).remove("member_photo");old.put("schemaVersion",27);BackupFixtureV40.removeMatching(old);((ObjectNode)old.path("tables")).remove(java.util.List.of("task_activity","overtime_request","leave_request","defect_reserve_link"));((ObjectNode)old.path("tables")).remove("member_participation");((ObjectNode)old.path("tables")).remove("sprint_member_presence");restore(old);assertEquals(1,p.periods(id).size());assertEquals("2026-01-01",p.periods(id).getFirst().joinedOn());
 }
 void restore(ObjectNode data){var preview=b.preview(data);var r=m.createObjectNode();r.set("backup",data);r.put("confirmation","GERİ YÜKLE");preview.forEach((k,v)->r.set(k,m.valueToTree(v)));b.restore(r);}
 @Test void requiresAdminAndCsrf()throws Exception{
  String body=m.writeValueAsString(Map.of("version","x","periods",List.of(period(null,null,false))));
  mvc.perform(put("/api/team/legacy-member-akin/participation").with(user("reader").roles("USER")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isForbidden());
  mvc.perform(put("/api/team/legacy-member-akin/participation").with(user("admin").roles("ADMIN")).contentType("application/json").content(body)).andExpect(status().isForbidden());
 }
}
