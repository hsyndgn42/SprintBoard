package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
@SpringBootTest(properties="spring.datasource.url=jdbc:h2:mem:subtypetest;DB_CLOSE_DELAY=-1")
@Transactional
class TaskSubtypeServiceTest {
 @Autowired TaskSubtypeService types;
 @Autowired WorkspaceService workspace;
 @Autowired JdbcTemplate jdbc;
 private Map<String,Object> task(String category,String code){return Map.of("title","Subtype QA","size","SMALL","taskCategory",category,"taskSubtype",code);}
 @Test void customClassificationAndInactiveHistory(){
   String code=types.create(Map.of("category","TEST","label","Security Test")).get("code").toString();
   String id=workspace.createBacklog(task("TEST",code)).get("id").toString();
   assertEquals(code,jdbc.queryForObject("SELECT task_subtype FROM backlog_item WHERE id=?",String.class,id));
   assertThrows(IllegalArgumentException.class,()->workspace.createBacklog(task("DEV",code)));
   types.setActive(code,Map.of("active",false));
   assertThrows(IllegalArgumentException.class,()->workspace.createBacklog(task("TEST",code)));
   assertNotNull(workspace.editBacklog(id,task("TEST",code)));
   assertEquals("Security Test",types.list().stream().filter(r->code.equals(r.get("code"))).findFirst().orElseThrow().get("label"));
   types.setActive(code,Map.of("active",true));assertNotNull(workspace.createBacklog(task("TEST",code)));
 }
 @Test void protectsSemanticIdentityAndMandatoryChoices(){
   assertThrows(IllegalArgumentException.class,()->types.setActive("LEAVE",Map.of("active",false)));
   assertThrows(IllegalArgumentException.class,()->types.setActive("GENERAL_TEST",Map.of("active",true,"label","Changed")));
   types.setActive("TEST_DEFECT",Map.of("active",false));
   assertThrows(IllegalArgumentException.class,()->types.setActive("PROD_DEFECT",Map.of("active",false)));
   assertThrows(IllegalArgumentException.class,()->types.create(Map.of("category","TEST","label","e2e test")));
   assertThrows(IllegalArgumentException.class,()->types.create(Map.of("category","OTHER","label","Other")));
   assertThrows(IllegalArgumentException.class,()->types.create(Map.of("category","DEV","label"," ")));
   assertThrows(IllegalArgumentException.class,()->workspace.createBacklog(task("TEST","")));
   assertNotNull(workspace.createBacklog(task("DEV","")));
 }
 @Test void customBauDoesNotAcquireLeaveOrSupportSemantics(){
   String code=types.create(Map.of("category","BAU","label","Knowledge Sharing")).get("code").toString();
   String id=workspace.createBacklog(task("BAU",code)).get("id").toString();
   assertEquals("BAU",jdbc.queryForObject("SELECT work_kind FROM backlog_item WHERE id=?",String.class,id));
   assertEquals(code,jdbc.queryForObject("SELECT task_subtype FROM backlog_item WHERE id=?",String.class,id));
 }
 @Test void seededCatalogMatchesLegacyBackupDefaults(){
   for(var row:TaskSubtypeService.defaults()){
     var db=jdbc.queryForMap("SELECT * FROM task_subtype WHERE code=?",row.get("code"));
     row.forEach((k,v)->assertEquals(v,db.get(k.toUpperCase(Locale.ROOT))));
   }
 }
}
