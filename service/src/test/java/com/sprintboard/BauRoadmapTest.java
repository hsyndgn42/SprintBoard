package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:bauroadmaptest;DB_CLOSE_DELAY=-1","sprintboard.backup-directory=./tmp/bau-auto-test-backups"})
class BauRoadmapTest {
  @Autowired WorkspaceService w;@Autowired JdbcTemplate j;@Autowired BackupService backups;@Autowired ObjectMapper m;
  String sprint(){return w.createSprint(Map.of("name","BAU auto test","start","2027-01-04","end","2027-01-22")).get("id").toString();}
  String target(String kind){return w.createRoadmap(Map.of("title","BAU","kind",kind)).get("id").toString();}
  String bound(){return j.queryForObject("SELECT setting_value FROM product_setting WHERE setting_key='bau_roadmap_id'",String.class);}
  void assertLinks(String sprint,String target,int count){
    assertEquals(count,j.queryForObject("SELECT COUNT(*) FROM sprint_task WHERE sprint_id=?",Integer.class,sprint));
    assertEquals(count,j.queryForObject("SELECT COUNT(*) FROM sprint_task t JOIN backlog_item b ON b.id=t.backlog_id WHERE t.sprint_id=? AND b.roadmap_id=? AND b.task_category='BAU'",Integer.class,sprint,target));
  }
  @Test @Transactional void reusesGeneralTargetPreservesHistoryAndSurvivesRename(){
    var before=m.valueToTree(backups.exportData()).path("tables");
    String id=target("GENERAL"),a=sprint();assertEquals(id,bound());assertLinks(a,id,5);
    w.updateRoadmap(id,Map.of("title","Ekip operasyonları","kind","GENERAL"));
    assertLinks(sprint(),id,5);assertEquals(1,w.roadmap().size());
    var after=m.valueToTree(backups.exportData()).path("tables");
    for(String table:List.of("sprint_task","backlog_item","assignment","sprint","leave_record","sprint_closure"))for(var old:before.path(table)){
      var key=old.has("id")?"id":"sprint_id";boolean found=false;
      for(var row:after.path(table))if(old.path(key).equals(row.path(key))){assertEquals(old,row);found=true;break;}
      assertTrue(found,table+" historical row missing");
    }
  }
  @Test @Transactional void createsOnceAndIncludesCustomTemplatesButNotInactiveOnes(){
    String project=target("PROJECT");
    var inactive=w.createBauTemplate(Map.of("title","Disabled","mode","MANUAL","daysPerMember",0));
    w.updateBauTemplate(inactive.get("id").toString(),Map.of("title","Disabled","mode","MANUAL","daysPerMember",0,"active",false));
    w.createBauTemplate(Map.of("title","Coordination","mode","MANUAL","daysPerMember",0));
    String a=sprint(),id=bound();assertNotEquals(project,id);assertLinks(a,id,6);assertLinks(sprint(),id,6);
    assertEquals(1,j.queryForObject("SELECT COUNT(*) FROM roadmap_item WHERE item_kind='GENERAL'",Integer.class));
    assertEquals(0,j.queryForObject("SELECT COUNT(*) FROM backlog_item WHERE roadmap_id=?",Integer.class,project));
    assertEquals(0d,j.queryForObject("SELECT estimated_hours FROM sprint_task WHERE sprint_id=? AND task_subtype='LEAVE'",Double.class,a));
    assertEquals(0,j.queryForObject("SELECT COUNT(*) FROM assignment a JOIN sprint_task t ON t.id=a.task_id WHERE t.sprint_id=? AND t.work_kind IN ('SUPPORT','MEETING') AND a.estimated_hours<>16",Integer.class,a));
  }
  @Test @Transactional void disabledTemplatesDoNotCreateEmptyTarget(){
    j.update("UPDATE bau_template SET active=false");String id=sprint();
    assertEquals(0,j.queryForObject("SELECT COUNT(*) FROM sprint_task WHERE sprint_id=?",Integer.class,id));
    assertEquals(0,j.queryForObject("SELECT COUNT(*) FROM product_setting WHERE setting_key='bau_roadmap_id'",Integer.class));assertTrue(w.roadmap().isEmpty());
  }
  @Test void ambiguityRollsBackWholeSprintInsteadOfGuessing(){
    String a=target("GENERAL"),b=target("GENERAL");
    var before=m.valueToTree(backups.exportData()).path("tables");
    try{assertThrows(IllegalArgumentException.class,this::sprint);assertEquals(before,m.valueToTree(backups.exportData()).path("tables"));}
    finally{j.update("DELETE FROM roadmap_item WHERE id IN (?,?)",a,b);}
  }
  @Test @Transactional void bindingRoundTripsAndInvalidTargetCannotBeRestoredOrRetyped(){
    String id=target("GENERAL");sprint();ObjectNode data=m.valueToTree(backups.exportData());
    var preview=backups.preview(data);var request=m.createObjectNode();request.set("backup",data);request.put("confirmation","GERİ YÜKLE");preview.forEach((k,v)->request.set(k,m.valueToTree(v)));backups.restore(request);
    assertEquals(id,bound());assertLinks(sprint(),id,5);
    for(String replacement:List.of("missing","")){
      ObjectNode bad=data.deepCopy();for(var s:bad.path("tables").path("product_setting"))if("bau_roadmap_id".equals(s.path("setting_key").asText()))((ObjectNode)s).put("setting_value",replacement);
      assertThrows(IllegalArgumentException.class,()->backups.preview(bad));
    }
    assertThrows(IllegalArgumentException.class,()->w.updateRoadmap(id,Map.of("title","BAU","kind","PROJECT")));
    assertEquals("GENERAL",j.queryForObject("SELECT item_kind FROM roadmap_item WHERE id=?",String.class,id));
  }
}
