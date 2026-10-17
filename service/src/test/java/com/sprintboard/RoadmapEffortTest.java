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

@org.junit.jupiter.api.Tag("historical")
@org.springframework.test.context.ActiveProfiles("historical-tests")
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:roadmaptest;DB_CLOSE_DELAY=-1","sprintboard.backup-directory=./tmp/roadmap-test-backups"})
@Transactional
class RoadmapEffortTest {
  @Autowired WorkspaceService w;@Autowired JdbcTemplate j;@Autowired BackupService backups;@Autowired ObjectMapper mapper;
  String target(String kind,String reference){return w.createRoadmap(Map.of("title","Target","kind",kind,"referenceId",reference)).get("id").toString();}
  String backlog(String target){return w.createBacklog(Map.of("title","Work","roadmapId",target,"criteria","Accepted","size","SMALL","estimatedHours",40,"priority","HIGH")).get("id").toString();}
  String task(String target,String status,double hours){
    String b=backlog(target),t=w.addTask("legacy-sprint-14",Map.of("backlogId",b,"reason","Test")).get("id").toString();
    j.update("UPDATE sprint_task SET status=? WHERE id=?",status,t);
    j.update("INSERT INTO assignment(id,task_id,member_id,estimated_hours,support_only) VALUES (?,?,?,?,false)",UUID.randomUUID().toString(),t,"legacy-member-akin",hours);return t;
  }
  Map<String,Object> row(String id){return w.roadmapReports().stream().filter(r->id.equals(r.get("id"))).findFirst().orElseThrow();}
  void hours(Map<String,Object> row,String field,double expected){assertEquals(expected,((Number)row.get(field)).doubleValue(),field);}
  @Test void overtimeIsSeparateFromPlanAndKeepsRecordedRoadmap(){
    String id=target("PROJECT","OT-1"),other=target("PROJECT","OT-2"),t=task(id,"doing",8);
    w.createOvertimeEntry(Map.of("memberId","legacy-member-akin","sprintId","legacy-sprint-14","taskId",t,"earnedHours",3,"plannedHours",5));
    w.createOvertimeEntry(Map.of("memberId","legacy-member-akin","sprintId","legacy-sprint-14","earnedHours",7));
    hours(row(id),"assignedHours",8);hours(row(id),"overtimeHours",3);hours(row(other),"overtimeHours",0);
    String b=j.queryForObject("SELECT backlog_id FROM sprint_task WHERE id=?",String.class,t);w.linkBacklog(b,Map.of("roadmapId",other));
    hours(row(id),"overtimeHours",3);hours(row(other),"overtimeHours",0);hours(row(other),"assignedHours",8);
  }
  @Test void identityCanBeCreatedEditedAndSharedWithoutChangingInternalLinks(){
    String id=target("PROJECT","TC-25142");String b=backlog(id);
    w.updateRoadmap(id,Map.of("title","Feature updated","kind","FEATURE_SET","referenceId","TC-25142"));
    assertEquals("FEATURE_SET",row(id).get("kind"));assertEquals("TC-25142",row(id).get("referenceId"));
    assertEquals(id,w.readiness(b).get("roadmapId"));assertNotEquals(id,target("FEATURE_SET","TC-25142"));
    assertThrows(IllegalArgumentException.class,()->target("WRONG","TC-1"));assertThrows(IllegalArgumentException.class,()->target("PROJECT","x".repeat(101)));
    assertThrows(IllegalArgumentException.class,()->target("PROJECT","TC\nBAD"));assertNull(w.updateRoadmap("missing",Map.of()));
  }
  @Test void aggregatesAssignmentsOnceSeparatesOutcomesPoolAndExcludesLeaveAndX(){
    String id=target("PROJECT","TC-2");String done=task(id,"done",8);
    j.update("INSERT INTO assignment VALUES (?,?,?,?,?)",UUID.randomUUID().toString(),done,"legacy-member-cemil",4,false);
    j.update("INSERT INTO assignment VALUES (?,?,?,?,?)",UUID.randomUUID().toString(),done,"legacy-member-sakir",0,true);
    task(id,"undone",16);task(id,"doing",6);String leave=task(id,"todo",50);
    j.update("UPDATE sprint_task SET work_kind='LEAVE',task_category='BAU',task_subtype='LEAVE' WHERE id=?",leave);
    backlog(id);task(target("FEATURE_SET","OTHER"),"done",99);
    var r=row(id);hours(r,"assignedHours",34);hours(r,"doneHours",12);hours(r,"undoneHours",16);hours(r,"openHours",6);hours(r,"poolEstimatedHours",40);
    assertEquals(4,r.get("taskCount"));assertEquals(1,r.get("supportAssignmentCount"));assertEquals(1,r.get("poolCount"));
    var preview=w.closurePreview("legacy-sprint-14");w.completeSprint("legacy-sprint-14",Map.of("confirmed",true,"fingerprint",preview.get("fingerprint"),"carryTaskIds",List.of()));
    j.update("UPDATE assignment SET estimated_hours=100 WHERE task_id=? AND support_only=false",done);
    hours(row(id),"doneHours",12); // historical assigned hours stay frozen
  }
  @Test void unassignedEffortIsNotInventedAndLinkRemovalReallocatesReport(){
    String id=target("FEATURE_SET","F-1"),b=backlog(id);
    w.addTask("legacy-sprint-14",Map.of("backlogId",b,"reason","Test"));
    hours(row(id),"assignedHours",0);assertEquals(1,row(id).get("unassignedTaskCount"));
    w.linkBacklog(b,Map.of("roadmapId",""));assertEquals(0,row(id).get("taskCount"));
  }
  @Test void backupRoundTripAndV23UpgradePreserveUnknownIdentity(){
    String id=target("PROJECT","TC-42");ObjectNode current=mapper.valueToTree(backups.exportData());assertEquals(40, current.path("schemaVersion").asInt());
    assertNotNull(backups.preview(current));ObjectNode old=current.deepCopy();old.path("tables").path("leave_record").forEach(r->{((ObjectNode)r).remove("overtime_hours");((ObjectNode)r).remove("overtime_accounting");});((ObjectNode)old.path("tables")).remove("member_photo");old.put("schemaVersion",23);BackupFixtureV40.removeMatching(old);((ObjectNode)old.path("tables")).remove(java.util.List.of("task_activity","overtime_request","leave_request","defect_reserve_link"));((ObjectNode)old.path("tables")).remove("member_participation");((ObjectNode)old.path("tables")).remove("sprint_member_presence");((ObjectNode)old.path("tables")).remove("member_capacity_policy");((ObjectNode)old.path("tables")).remove("sprint_member_policy");
    old.path("tables").path("roadmap_item").forEach(r->{((ObjectNode)r).remove("item_kind");((ObjectNode)r).remove("reference_id");((ObjectNode)r).remove("priority");});
    restore(old);assertEquals("UNSPECIFIED",row(id).get("kind"));assertNull(row(id).get("referenceId"));
    restore(current);assertEquals("TC-42",row(id).get("referenceId"));
    ObjectNode bad=current.deepCopy();((ObjectNode)bad.path("tables").path("roadmap_item").get(0)).put("item_kind","INVALID");assertThrows(IllegalArgumentException.class,()->backups.preview(bad));
  }
  @Test void generalBauIsSeparateFromProjectsAndSurvivesBackup(){
    String project=target("PROJECT","TC-test"),bau=target("GENERAL","");
    String t=task(project,"done",16);
    String b=j.queryForObject("SELECT backlog_id FROM sprint_task WHERE id=?",String.class,t);
    j.update("UPDATE backlog_item SET task_category='BAU',task_subtype='MEETING',type='BAU',work_kind='MEETING' WHERE id=?",b);
    j.update("UPDATE sprint_task SET task_category='BAU',task_subtype='MEETING',type='BAU',work_kind='MEETING' WHERE id=?",t);
    w.linkBacklog(b,Map.of("roadmapId",bau));
    assertEquals("GENERAL",row(bau).get("kind"));hours(row(bau),"assignedHours",16);hours(row(project),"assignedHours",0);
    ObjectNode current=mapper.valueToTree(backups.exportData());restore(current);
    assertEquals("GENERAL",row(bau).get("kind"));hours(row(bau),"doneHours",16);
    w.updateRoadmap(bau,Map.of("title","BAU","kind","GENERAL","description","General operations"));
    assertEquals("GENERAL",row(bau).get("kind"));
  }
  @Test void v24BackupRestoresWithoutChangingExistingProjectIdentity(){
    String id=target("PROJECT","TC-24");ObjectNode old=mapper.valueToTree(backups.exportData());old.path("tables").path("leave_record").forEach(r->{((ObjectNode)r).remove("overtime_hours");((ObjectNode)r).remove("overtime_accounting");});((ObjectNode)old.path("tables")).remove("member_photo");old.put("schemaVersion",24);BackupFixtureV40.removeMatching(old);((ObjectNode)old.path("tables")).remove(java.util.List.of("task_activity","overtime_request","leave_request","defect_reserve_link"));((ObjectNode)old.path("tables")).remove("member_participation");((ObjectNode)old.path("tables")).remove("sprint_member_presence");((ObjectNode)old.path("tables")).remove("member_capacity_policy");((ObjectNode)old.path("tables")).remove("sprint_member_policy");old.path("tables").path("roadmap_item").forEach(r->((ObjectNode)r).remove("priority"));
    restore(old);assertEquals("PROJECT",row(id).get("kind"));assertEquals("TC-24",row(id).get("referenceId"));
    assertEquals(40, mapper.valueToTree(backups.exportData()).path("schemaVersion").asInt());
  }
  void restore(ObjectNode data){var preview=backups.preview(data);var request=mapper.createObjectNode();request.set("backup",data);request.put("confirmation","GERİ YÜKLE");preview.forEach((key,value)->request.set(key,mapper.valueToTree(value)));backups.restore(request);}
}
