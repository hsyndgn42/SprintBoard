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

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:roadmapplanningtest;DB_CLOSE_DELAY=-1","sprintboard.backup-directory=./tmp/roadmap-planning-test"})
@Transactional
class RoadmapPlanningTest {
  @Autowired WorkspaceService w;@Autowired JdbcTemplate j;@Autowired BackupService backups;@Autowired ObjectMapper m;
  String create(String status,String priority){return w.createRoadmap(Map.of("title","Plan","kind","PROJECT","status",status,"priority",priority)).get("id").toString();}
  Map<String,Object> row(String id){return w.roadmap().stream().filter(r->id.equals(r.get("id"))).findFirst().orElseThrow();}
  void restore(ObjectNode data){var preview=backups.preview(data);var request=m.createObjectNode();request.set("backup",data);request.put("confirmation","GERİ YÜKLE");preview.forEach((k,v)->request.set(k,m.valueToTree(v)));backups.restore(request);}
  @Test void choicesRoundTripAndOmittedValuesStayUnchanged(){
    String id=create("active","HIGH");
    w.updateRoadmap(id,Map.of("title","Renamed","kind","PROJECT"));assertEquals("active",row(id).get("status"));assertEquals("HIGH",row(id).get("priority"));
    for(String s:List.of("planned","active","on_hold","completed"))for(String p:List.of("UNSET","LOW","NORMAL","HIGH","CRITICAL")){
      w.updateRoadmap(id,Map.of("title","Plan","kind","PROJECT","status",s,"priority",p));assertEquals(s,row(id).get("status"));assertEquals(p,row(id).get("priority"));
    }
    var normal=w.createRoadmap(Map.of("title","Default"));assertEquals("planned",row(normal.get("id").toString()).get("status"));assertEquals("UNSET",row(normal.get("id").toString()).get("priority"));
    assertTrue(j.queryForObject("SELECT detail_json FROM audit_event WHERE entity_id=? AND action='updated' ORDER BY id DESC LIMIT 1",String.class,id).contains("previousStatus"));
  }
  @Test void rejectsInvalidExplicitValuesBeforeChangingData(){
    String id=create("active","HIGH");var before=m.valueToTree(backups.exportData()).path("tables");
    for(String invalid:List.of("", "invalid","DONE","urgent")){
      assertThrows(IllegalArgumentException.class,()->w.updateRoadmap(id,Map.of("title","Plan","kind","PROJECT","status",invalid)));
      assertThrows(IllegalArgumentException.class,()->w.updateRoadmap(id,Map.of("title","Plan","kind","PROJECT","priority",invalid)));
      assertThrows(IllegalArgumentException.class,()->create(invalid,"NORMAL"));
      assertThrows(IllegalArgumentException.class,()->create("planned",invalid));
    }
    assertEquals(before,m.valueToTree(backups.exportData()).path("tables"));
  }
  @Test void completionIsManualAndDoesNotCloseLinkedTasksOrSprints(){
    String id=create("active","NORMAL");
    String sprint=w.createSprint(Map.of("name","Roadmap test sprint","start","2030-01-07","end","2030-01-18")).get("id").toString();
    j.update("INSERT INTO backlog_item(id,title,criteria,work_kind,type,state,task_category,created_at) VALUES ('roadmap-test-backlog','Test delivery','','','FEATURE','Ready','DEV',CURRENT_TIMESTAMP)");
    j.update("INSERT INTO sprint_task(id,sprint_id,backlog_id,title,criteria,type,work_kind,status,task_category) VALUES ('roadmap-test-task',?,'roadmap-test-backlog','Test delivery','','FEATURE','','done','DEV')",sprint);
    String backlog="roadmap-test-backlog";
    w.linkBacklog(backlog,Map.of("roadmapId",id));assertEquals(1,row(id).get("doneCount"));assertEquals("active",row(id).get("status"));
    var before=m.valueToTree(backups.exportData()).path("tables");
    w.updateRoadmap(id,Map.of("title","Plan","kind","PROJECT","status","completed","priority","LOW"));
    var after=m.valueToTree(backups.exportData()).path("tables");before.properties().forEach(e->{if(!e.getKey().equals("roadmap_item"))assertEquals(e.getValue(),after.path(e.getKey()));});
    assertEquals("completed",w.roadmapReports().stream().filter(r->id.equals(r.get("id"))).findFirst().orElseThrow().get("status"));
  }
  @Test void v25UpgradeDoesNotInventPriorityAndV26RoundTripsAndValidates(){
    String id=create("on_hold","CRITICAL");ObjectNode current=m.valueToTree(backups.exportData());assertEquals(40, current.path("schemaVersion").asInt());
    ObjectNode old=current.deepCopy();old.path("tables").path("leave_record").forEach(r->{((ObjectNode)r).remove("overtime_hours");((ObjectNode)r).remove("overtime_accounting");});((ObjectNode)old.path("tables")).remove("member_photo");old.put("schemaVersion",25);BackupFixtureV40.removeMatching(old);((ObjectNode)old.path("tables")).remove(java.util.List.of("task_activity","overtime_request","leave_request","defect_reserve_link"));((ObjectNode)old.path("tables")).remove("member_participation");((ObjectNode)old.path("tables")).remove("sprint_member_presence");((ObjectNode)old.path("tables")).remove("member_capacity_policy");((ObjectNode)old.path("tables")).remove("sprint_member_policy");old.path("tables").path("roadmap_item").forEach(r->((ObjectNode)r).remove("priority"));
    restore(old);assertEquals("on_hold",row(id).get("status"));assertEquals("UNSET",row(id).get("priority"));
    restore(current);assertEquals("CRITICAL",row(id).get("priority"));
    for(String field:List.of("status","priority")){
      ObjectNode bad=current.deepCopy();((ObjectNode)bad.path("tables").path("roadmap_item").get(0)).put(field,"INVALID");assertThrows(IllegalArgumentException.class,()->backups.preview(bad));
    }
  }
}
