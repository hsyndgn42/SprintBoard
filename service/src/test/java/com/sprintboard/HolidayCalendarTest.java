package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import java.util.*;
import java.time.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import com.fasterxml.jackson.databind.ObjectMapper;

@org.junit.jupiter.api.Tag("historical")
@org.springframework.test.context.ActiveProfiles("historical-tests")
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:holidaytest;DB_CLOSE_DELAY=-1","sprintboard.backup-directory=./tmp/holiday-test"})
@AutoConfigureMockMvc @Transactional
class HolidayCalendarTest {
  @Autowired HolidayCalendarService h;@Autowired WorkspaceService w;@Autowired JdbcTemplate j;@Autowired BackupService b;@Autowired ObjectMapper m;@Autowired MockMvc mvc;
  @Test void verifiedDatesOverlapAndFullDayPolicy(){
    var y27=HolidayCalendarService.holidays(2027);var y28=HolidayCalendarService.holidays(2028);
    assertEquals(16,y27.size());assertEquals(17,y28.size());
    assertEquals(13,y27.stream().filter(d->d.date().getDayOfWeek().getValue()<6).count());
    assertEquals(8,y28.stream().filter(d->d.date().getDayOfWeek().getValue()<6).count());
    assertTrue(y27.stream().filter(d->d.date().toString().equals("2027-05-19")).findFirst().orElseThrow().title().contains(" / Kurban"));
    for(int y:List.of(2027,2028))assertEquals(3,HolidayCalendarService.holidays(y).stream().filter(d->d.title().contains("ekip kararı: tam gün")).count());
    assertThrows(IllegalArgumentException.class,()->h.importYear(2029));
  }
  @Test void repeatImportPreservesExistingCalendarAndEveryOtherProductTable(){
    w.createNonWorkingDay(Map.of("date","2027-01-01","title","Existing global"));
    w.createNonWorkingDay(Map.of("date","2027-03-08","title","Personal","memberId","legacy-member-akin"));
    var before=m.valueToTree(b.exportData()).path("tables");
    assertEquals(15,h.importYear(2027).get("added"));assertEquals(17,h.importYear(2028).get("added"));
    assertEquals(0,h.importYear(2027).get("added"));assertEquals(0,h.importYear(2028).get("added"));
    var after=m.valueToTree(b.exportData()).path("tables");
    before.properties().forEach(e->{if(!e.getKey().equals("non_working_day"))assertEquals(e.getValue(),after.path(e.getKey()));});
    for(var old:before.path("non_working_day")){boolean found=false;for(var row:after.path("non_working_day"))if(row.equals(old))found=true;assertTrue(found);}
    assertNotNull(b.preview(m.valueToTree(b.exportData())));
  }
  @Test void fullDayHalfHolidaysWeekendsAndDatedLeaveDoNotDoubleDeduct(){
    h.importYear(2027);h.importYear(2028);
    String member=w.createMember(Map.of("name","Calendar QA")).get("id").toString();
    String sprint=w.createSprint(Map.of("name","March QA","start","2027-03-08","end","2027-03-12")).get("id").toString();
    var cap=w.capacity(sprint).stream().filter(r->member.equals(r.get("memberId"))).findFirst().orElseThrow();
    assertEquals(4,((Number)cap.get("nonWorkingDays")).intValue());assertEquals(8d,((Number)cap.get("availableHours")).doubleValue());
    assertThrows(IllegalArgumentException.class,()->w.createLeave(Map.of("leaveType","ANNUAL","memberId",member,"sprintId",sprint,"start","2027-03-08","end","2027-03-08","days",1)));
    assertEquals(8d,((Number)w.capacity(sprint).stream().filter(r->member.equals(r.get("memberId"))).findFirst().orElseThrow().get("availableHours")).doubleValue());
    String next=w.createSprint(Map.of("name","February QA","start","2028-02-25","end","2028-02-29")).get("id").toString();
    var cap28=w.capacity(next).stream().filter(r->member.equals(r.get("memberId"))).findFirst().orElseThrow();assertEquals(2,((Number)cap28.get("nonWorkingDays")).intValue());assertEquals(8d,((Number)cap28.get("availableHours")).doubleValue());
  }
  @Test void importRequiresAdministratorAndCsrf()throws Exception{
    mvc.perform(post("/api/calendar/turkey-holidays/2027").with(user("reader").roles("USER")).with(csrf())).andExpect(status().isForbidden());
    mvc.perform(post("/api/calendar/turkey-holidays/2027").with(user("admin").roles("ADMIN"))).andExpect(status().isForbidden());
    mvc.perform(post("/api/calendar/turkey-holidays/2027").with(user("admin").roles("ADMIN")).with(csrf())).andExpect(status().isOk());
  }
}
