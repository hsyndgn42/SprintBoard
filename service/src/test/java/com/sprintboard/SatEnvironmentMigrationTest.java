package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class SatEnvironmentMigrationTest {
 @Test void expandsOnlyEnvironmentConstraintAndPreservesExistingDefect()throws Exception{
  var ds=new DriverManagerDataSource("jdbc:h2:mem:sat-"+UUID.randomUUID(),"sa","");
  try(var anchor=ds.getConnection()){
   Flyway.configure().dataSource(ds).target("33").load().migrate();var db=new JdbcTemplate(ds);
   db.update("INSERT INTO backlog_item(id,title,criteria,work_kind,type,state,created_at,task_category,task_subtype) VALUES('sat-test','Existing defect','','DEV','DEV','Ready',CURRENT_TIMESTAMP,'DEFECT','TEST_DEFECT')");
   db.update("INSERT INTO defect_detail(backlog_id,severity,environment) VALUES('sat-test','HIGH','UAT')");var before=db.queryForMap("SELECT * FROM defect_detail WHERE backlog_id='sat-test'");
   assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->db.update("UPDATE defect_detail SET environment='SAT'"));
   var flyway=Flyway.configure().dataSource(ds).target("34").load();flyway.migrate();flyway.migrate();
   assertEquals(before,db.queryForMap("SELECT * FROM defect_detail WHERE backlog_id='sat-test'"));
   assertEquals(1,db.update("UPDATE defect_detail SET environment='SAT'"));
   assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->db.update("UPDATE defect_detail SET environment='ADSAT'"));
   assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->db.update("UPDATE defect_detail SET severity='INVALID'"));
   assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->db.update("UPDATE defect_detail SET verification='INVALID'"));
   assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->db.update("UPDATE defect_detail SET related_id=backlog_id"));
  }
 }
}
