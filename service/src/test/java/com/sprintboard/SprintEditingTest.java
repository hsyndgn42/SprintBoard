package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:sprintediting;DB_CLOSE_DELAY=-1","sprintboard.auto-backup.enabled=false"})
@AutoConfigureMockMvc
@Transactional
class SprintEditingTest {
 @Autowired WorkspaceService w;@Autowired JdbcTemplate j;@Autowired ObjectMapper mapper;@Autowired BackupService backups;@Autowired MockMvc mvc;
 String member(){return w.createMember(Map.of("name","Edit QA","role","Developer","teamRole","DEVELOPER","engagement","CORE","joinedOn","2026-01-01")).get("id").toString();}
 String sprint(){return w.createSprint(Map.of("name","Editable sprint","start","2026-10-05","end","2026-10-26")).get("id").toString();}
 Map<String,Object> edit(String id,String start,String end){return new LinkedHashMap<>(Map.of("name","Corrected sprint","goal","","start",start,"end",end,"editVersion",w.sprint(id).get("editVersion")));}
 Map<String,Object> row(String id,String member){return w.capacity(id).stream().filter(r->member.equals(r.get("memberId"))).findFirst().orElseThrow();}
 @Test void optionalGoalAndMetadataOnlyEditPreserveTaskAndFinancialData(){
  member();String id=sprint();assertEquals("",w.sprint(id).get("goal"));
  var before=mapper.valueToTree(backups.exportData()).path("tables");
  var input=edit(id,"2026-10-05","2026-10-26");input.put("goal","Sonradan belirlenen hedef");var result=w.updateSprint(id,input);
  assertEquals("Corrected sprint",result.get("name"));assertEquals(input.get("goal"),result.get("goal"));
  var after=mapper.valueToTree(backups.exportData()).path("tables");
  for(String table:List.of("sprint_task","assignment","backlog_item","leave_record","overtime_entry","sprint_member_presence","sprint_member_policy","product_setting"))assertEquals(before.path(table),after.path(table),table);
  assertEquals(1,j.queryForObject("SELECT COUNT(*) FROM audit_event WHERE entity_id=? AND action='details-updated'",Integer.class,id));
  var clear=edit(id,"2026-10-05","2026-10-26");assertEquals("",w.updateSprint(id,clear).get("goal"));
 }
 @Test void inclusiveDatesRecalculateCapacityAndKeepAssignmentsPoliciesAndManualAllocation(){
  String m=member(),id=sprint();assertEquals(16,((Number)row(id,m).get("workingDays")).intValue());
  var tasks=mapper.valueToTree(w.sprint(id).get("items"));
  w.updateSprint(id,edit(id,"2026-10-06","2026-10-26"));
  assertEquals(15,((Number)row(id,m).get("workingDays")).intValue());assertEquals(120d,row(id,m).get("availableHours"));
  assertEquals(tasks,mapper.valueToTree(w.sprint(id).get("items")));
  j.update("INSERT INTO sprint_member_allocation VALUES(?,?,?)",id,m,4d);
  w.updateSprint(id,edit(id,"2026-10-06","2026-10-27"));
  assertEquals(16,((Number)row(id,m).get("workingDays")).intValue());assertEquals(4d,row(id,m).get("allocatedDays"));
  assertEquals(8d,j.queryForObject("SELECT hours_per_day FROM sprint_member_policy WHERE sprint_id=? AND member_id=?",Double.class,id,m));
  backups.preview(mapper.valueToTree(backups.exportData())); // Resized dates must round-trip through JSON validation.
 }
 @Test void holidayAndLeaveRemainDeductedOnceAfterDateCorrection(){
  String m=member(),id=sprint();w.createNonWorkingDay(Map.of("date","2026-10-12","title","QA holiday"));
  w.createLeave(Map.of("memberId",m,"sprintId",id,"days",1,"start","2026-10-13","end","2026-10-13","leaveType","ANNUAL"));
  w.updateSprint(id,edit(id,"2026-10-06","2026-10-26"));
  assertEquals(104d,row(id,m).get("availableHours"));assertEquals(1d,row(id,m).get("leaveDays"));
  assertThrows(IllegalArgumentException.class,()->w.updateSprint(id,edit(id,"2026-10-14","2026-10-26")));
  assertEquals("2026-10-06",w.sprint(id).get("start"));
 }
 @Test void invalidDatesStaleEditsAndClosedSprintsAreRejected(){
  String id=sprint();var first=edit(id,"2026-10-06","2026-10-26");w.updateSprint(id,first);
  assertThrows(IllegalArgumentException.class,()->w.updateSprint(id,first));
  for(String[] dates:List.of(new String[]{"2026-02-30","2026-03-01"},new String[]{"2026-10-26","2026-10-05"},new String[]{"2026-01-01","2028-01-01"}))
   assertThrows(IllegalArgumentException.class,()->w.updateSprint(id,edit(id,dates[0],dates[1])));
  var bad=edit(id,"2026-10-06","2026-10-26");bad.put("name"," ");assertThrows(IllegalArgumentException.class,()->w.updateSprint(id,bad));
  j.update("UPDATE sprint SET status='active' WHERE id=?",id);w.updateSprint(id,edit(id,"2026-10-06","2026-10-26"));
  j.update("UPDATE sprint SET status='completed' WHERE id=?",id);assertThrows(IllegalArgumentException.class,()->w.updateSprint(id,edit(id,"2026-10-06","2026-10-26")));
  assertNull(w.updateSprint("missing",Map.of()));
 }
 @Test void datedRequestsAndWorkNotesCannotBeOrphaned(){
  String m=member(),id=sprint();
  j.update("INSERT INTO overtime_request(id,member_id,sprint_id,requester,work_date,hours,reason,status,created_at) VALUES('edit-ot',?,?,'qa',DATE '2026-10-05',2,'test','PENDING','2026-10-05T12:00:00Z')",m,id);
  assertThrows(IllegalArgumentException.class,()->w.updateSprint(id,edit(id,"2026-10-06","2026-10-26")));
  j.update("UPDATE overtime_request SET status='REJECTED' WHERE id='edit-ot'");
  j.update("INSERT INTO leave_request(id,member_id,sprint_id,requester,start_on,end_on,days,leave_type,reason,status,created_at) VALUES('edit-leave',?,?,'qa',DATE '2026-10-05',DATE '2026-10-05',1,'ANNUAL','test','PENDING','2026-10-05T12:00:00Z')",m,id);
  assertThrows(IllegalArgumentException.class,()->w.updateSprint(id,edit(id,"2026-10-06","2026-10-26")));
  j.update("UPDATE leave_request SET status='REJECTED' WHERE id='edit-leave'");
  j.update("INSERT INTO task_activity VALUES('edit-note',?,'task','Task','qa','QA',DATE '2026-10-05','2026-10-05T12:00:00Z','WORK_NOTE','Worked','{}')",id);
  assertThrows(IllegalArgumentException.class,()->w.updateSprint(id,edit(id,"2026-10-06","2026-10-26")));
  w.updateSprint(id,edit(id,"2026-10-05","2026-10-27"));
 }
 @Test void putRequiresAdminCsrfAndSupportsOptionalGoal()throws Exception{
  String id=sprint(),body=mapper.writeValueAsString(edit(id,"2026-10-06","2026-10-26"));
  mvc.perform(put("/api/sprints/"+id).with(user("member").roles("USER")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isForbidden());
  mvc.perform(put("/api/sprints/"+id).with(user("admin").roles("ADMIN")).contentType("application/json").content(body)).andExpect(status().isForbidden());
  mvc.perform(put("/api/sprints/"+id).with(user("admin").roles("ADMIN")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isOk()).andExpect(jsonPath("$.start").value("2026-10-06")).andExpect(jsonPath("$.goal").value(""));
 }
}
