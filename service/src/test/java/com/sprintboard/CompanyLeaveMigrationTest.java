package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class CompanyLeaveMigrationTest {
 @Test void upgradesExistingDatabaseWithoutDebitingOrReplacingRecords() throws Exception {
   var ds=new DriverManagerDataSource("jdbc:h2:mem:company-leave-"+UUID.randomUUID(),"sa","");
   try(var connection=ds.getConnection()){
     Flyway.configure().dataSource(ds).target("18").load().migrate();
     var db=new JdbcTemplate(ds);
     for(String suffix:List.of("huseyin","elcim","isa","cemil","umran","gorkem","akin","sakir","ali-firat")){
       db.update("INSERT INTO member VALUES (?,?,'','Member','DEVELOPER','CORE',TRUE,NULL,NULL)","legacy-member-"+suffix,suffix);
     }
     db.update("INSERT INTO sprint VALUES ('legacy-sprint-13',13,'Sprint 13','',DATE '2026-08-04',DATE '2026-08-24','completed',FALSE)");
     db.update("INSERT INTO leave_record(id,member_id,sprint_id,days,precision_label,status) VALUES ('existing-personal','legacy-member-isa','legacy-sprint-13',1,'sprint-level','used')");
     db.update("INSERT INTO overtime_snapshot VALUES ('existing-overtime','legacy-member-isa','legacy-sprint-13',62,24,38)");
     var balances=db.queryForList("SELECT * FROM overtime_snapshot");
     var flyway=Flyway.configure().dataSource(ds).load();flyway.migrate();flyway.migrate();
     assertEquals(7,db.queryForObject("SELECT COUNT(*) FROM leave_record WHERE leave_type='COMPANY_GRANTED' AND days=5 AND start_on IS NULL AND end_on IS NULL",Integer.class));
     assertEquals("UNSPECIFIED",db.queryForObject("SELECT leave_type FROM leave_record WHERE id='existing-personal'",String.class));
     assertEquals(1.0,db.queryForObject("SELECT days FROM leave_record WHERE id='existing-personal'",Double.class));
     assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM leave_record WHERE member_id IN ('legacy-member-sakir','legacy-member-ali-firat')",Integer.class));
     assertEquals(balances,db.queryForList("SELECT * FROM overtime_snapshot"));
     assertEquals(7,db.queryForObject("SELECT COUNT(*) FROM audit_event WHERE action='company-leave-confirmed'",Integer.class));
   }
 }
}
