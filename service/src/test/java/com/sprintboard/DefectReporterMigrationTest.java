package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
class DefectReporterMigrationTest {
 @Test void approvedSlackSenderIsBackfilledWithoutChangingLegacyVerification()throws Exception{
  var ds=new DriverManagerDataSource("jdbc:h2:mem:reporter-"+UUID.randomUUID(),"sa","");
  try(var anchor=ds.getConnection()){
   Flyway.configure().dataSource(ds).target("35").load().migrate();var db=new JdbcTemplate(ds);
   db.update("INSERT INTO backlog_item(id,title,criteria,work_kind,type,state,created_at,task_category,task_subtype) VALUES('reporter-test','Existing defect','','DEV','DEV','Ready',CURRENT_TIMESTAMP,'DEFECT','TEST_DEFECT')");
   db.update("INSERT INTO defect_detail(backlog_id,severity,environment,verification,verification_note) VALUES('reporter-test','HIGH','SAT','PASSED','Old record')");
   db.update("INSERT INTO slack_inbox(id,source_key,team_id,channel_id,message_ts,user_id,source_url,raw_text,parsed_json,config_version,received_at,status,decided_by,backlog_id) VALUES('source','source','T123','C123','1.2','U123','https://app.slack.com/client/T123/C123','text','{}',1,'2026-10-17T00:00:00Z','APPROVED','admin','reporter-test')");
   Flyway.configure().dataSource(ds).load().migrate();
   var row=db.queryForMap("SELECT * FROM defect_detail WHERE backlog_id='reporter-test'");
   assertEquals("U123",row.get("REPORTER_ID"));assertEquals("T123",row.get("REPORTER_TEAM_ID"));assertEquals("PASSED",row.get("VERIFICATION"));assertEquals("Old record",row.get("VERIFICATION_NOTE"));
  }
 }
}
