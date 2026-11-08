package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import java.time.*;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:futureworkload;DB_CLOSE_DELAY=-1","sprintboard.slack.worker-enabled=false","sprintboard.slack.digest.scheduler-enabled=false","sprintboard.auto-backup.enabled=false"})
@AutoConfigureMockMvc
@Transactional
class FutureWorkloadApiTest {
 @Autowired WorkspaceService workspace;@Autowired JdbcTemplate db;@Autowired MockMvc mvc;@Autowired ObjectMapper mapper;
 @Test void authenticatedReportUsesRealCalendarAndAssignmentsWithoutWriting()throws Exception{
   var start=LocalDate.now(ZoneId.of("Europe/Istanbul")).plusMonths(1).with(TemporalAdjusters.next(DayOfWeek.MONDAY));
   String member=workspace.createMember(Map.of("name","Geliştirici","teamRole","DEVELOPER")).get("id").toString();
   db.update("UPDATE bau_template SET active=false");
   String sprint=workspace.createSprint(Map.of("name","Gelecek Sprint","start",start.toString(),"end",start.plusDays(4).toString())).get("id").toString();
   workspace.createSprintTask(sprint,Map.of("title","Planlanan iş","taskCategory","DEV","size","SMALL","estimatedHours",16,"readinessAcknowledged",true));
   workspace.createSprintTask(sprint,Map.of("title","Operasyon","taskCategory","BAU","taskSubtype","SUPPORT","size","SMALL","estimatedHours",8,"readinessAcknowledged",true));
   workspace.createBacklog(Map.of("title","Havuz işi","taskCategory","DESIGN","size","SMALL","estimatedHours",24));
   workspace.createNonWorkingDay(Map.of("date",start.plusDays(1).toString(),"title","Şirket izni"));
   db.update("INSERT INTO leave_record(id,member_id,sprint_id,days,precision_label,status,start_on,end_on,leave_type) VALUES('forecast-leave',?,?,1,'DATE','USED',?,?,'ANNUAL')",member,sprint,java.sql.Date.valueOf(start.plusDays(2)),java.sql.Date.valueOf(start.plusDays(2)));
   db.update("INSERT INTO overtime_entry(id,member_id,sprint_id,planned_hours,earned_hours,include_in_capacity,created_at) VALUES('forecast-ot',?,?,4,12,true,CURRENT_TIMESTAMP)",member,sprint);
   var counts=counts();
   var response=mvc.perform(get("/api/reports/future-workload").with(user("reader").roles("USER")).param("from",start.toString()).param("periods","1")).andExpect(status().isOk()).andReturn().getResponse();
   var r=mapper.readTree(response.getContentAsString());var p=r.path("periods").get(0);
   assertEquals(40,p.path("nominalHours").asDouble());assertEquals(8,p.path("offHours").asDouble());assertEquals(8,p.path("leaveHours").asDouble());assertEquals(4,p.path("overtimeHours").asDouble());assertEquals(8,p.path("bauHours").asDouble());assertEquals(20,p.path("capacityHours").asDouble());
   assertEquals(2,r.path("items").size());assertEquals(40,r.path("items").findValues("coreHours").stream().mapToDouble(v->v.asDouble()).sum());
   assertEquals(counts,counts(),"Forecast GET must not create sprints, tasks, leave, overtime or audit records");
 }
 Map<String,Integer> counts(){var result=new TreeMap<String,Integer>();for(String table:List.of("sprint","backlog_item","sprint_task","assignment","leave_record","overtime_entry","audit_event"))result.put(table,db.queryForObject("SELECT COUNT(*) FROM "+table,Integer.class));return result;}
 @Test void requiresLoginAndRejectsInvalidPeriods()throws Exception{
   mvc.perform(get("/api/reports/future-workload")).andExpect(status().isUnauthorized());
   mvc.perform(get("/api/reports/future-workload").with(user("reader").roles("USER")).param("periods","99")).andExpect(status().isBadRequest());
 }
}
