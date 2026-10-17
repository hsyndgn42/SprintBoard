package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
@org.junit.jupiter.api.Tag("historical")
@org.springframework.test.context.ActiveProfiles("historical-tests")
@SpringBootTest(properties="spring.datasource.url=jdbc:h2:mem:retrotest;DB_CLOSE_DELAY=-1")
@Transactional
class RetroActionServiceTest {
 @Autowired RetroActionService actions;
 @Autowired WorkspaceService workspace;
 @Autowired JdbcTemplate jdbc;
 private static final String SPRINT="legacy-sprint-14";
 private Map<String,Object> draft(){return new HashMap<>(Map.of("title","Improve test coverage","description","Cover critical journeys","ownerId","legacy-member-akin","dueDate","2026-09-01","status","OPEN"));}
 @Test void createsAndUpdatesWithoutAlteringHistoricalNotesOrSprint(){
   workspace.saveRetro(SPRINT,Map.of("actions","Original note"));
   var action=actions.create(SPRINT,draft());assertEquals("Improve test coverage",action.get("title"));assertEquals(0,action.get("version"));
   var edited=new HashMap<>(action);edited.put("status","DONE");
   var saved=actions.update(SPRINT,action.get("id").toString(),edited);
   assertEquals("DONE",saved.get("status"));assertEquals(1,saved.get("version"));
   assertEquals("Original note",workspace.retro(SPRINT).get("actions"));assertEquals("active",workspace.sprint(SPRINT).get("status"));
   assertThrows(IllegalArgumentException.class,()->actions.update(SPRINT,action.get("id").toString(),edited));
   assertNull(actions.update("legacy-sprint-13",action.get("id").toString(),saved));
   assertNull(actions.create("missing",draft()));assertNull(actions.list("missing"));
 }
 @Test void validatesReferencesDatesStatusAndPreservesInactiveOwner(){
   var bad=draft();bad.put("title"," ");assertThrows(IllegalArgumentException.class,()->actions.create(SPRINT,bad));
   var date=draft();date.put("dueDate","2026-02-30");assertThrows(IllegalArgumentException.class,()->actions.create(SPRINT,date));
   var status=draft();status.put("status","invalid");assertThrows(IllegalArgumentException.class,()->actions.create(SPRINT,status));
   var owner=draft();owner.put("ownerId","missing");assertThrows(IllegalArgumentException.class,()->actions.create(SPRINT,owner));
   var link=draft();link.put("backlogId","missing");assertThrows(IllegalArgumentException.class,()->actions.create(SPRINT,link));
   var created=actions.create(SPRINT,draft());jdbc.update("UPDATE member SET active=FALSE WHERE id='legacy-member-akin'");
   assertThrows(IllegalArgumentException.class,()->actions.create(SPRINT,draft()));
   assertNotNull(actions.update(SPRINT,created.get("id").toString(),created));
 }
 @Test void createsOneLinkedBacklogUsingTeamEstimationAndDoesNotAssignSprint(){
   var action=actions.create(SPRINT,draft());String id=action.get("id").toString();
   var task=new HashMap<String,Object>(Map.of("version",0,"taskCategory","TEST","taskSubtype","E2E_TEST","size","MEDIUM","estimatedHours",8));
   var linked=actions.createBacklog(SPRINT,id,task);String backlog=linked.get("backlogId").toString();
   assertEquals(backlog,actions.createBacklog(SPRINT,id,task).get("backlogId"));
   assertEquals("Ready",jdbc.queryForObject("SELECT state FROM backlog_item WHERE id=?",String.class,backlog));
   assertEquals("E2E_TEST",jdbc.queryForObject("SELECT task_subtype FROM backlog_item WHERE id=?",String.class,backlog));
   assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM sprint_task WHERE backlog_id=?",Integer.class,backlog));
   linked.put("status","DONE");actions.update(SPRINT,id,linked);
   assertEquals("Ready",jdbc.queryForObject("SELECT state FROM backlog_item WHERE id=?",String.class,backlog));
 }
 @Test void backlogFailureRollsBackAndCompletedSprintCanTrackNewActions(){
   String closed="legacy-sprint-13";var action=actions.create(closed,draft());String id=action.get("id").toString();
   int count=jdbc.queryForObject("SELECT COUNT(*) FROM backlog_item",Integer.class);
   assertThrows(IllegalArgumentException.class,()->actions.createBacklog(closed,id,Map.of("version",0,"taskCategory","TEST","taskSubtype","INVALID","size","SMALL")));
   assertEquals(count,jdbc.queryForObject("SELECT COUNT(*) FROM backlog_item",Integer.class));
   assertNull(actions.list(closed).getFirst().get("backlogId"));
   workspace.updateSettings(Map.of("estimationMode","POINTS_AND_HOURS"));
   var linked=actions.createBacklog(closed,id,Map.of("version",0,"taskCategory","DEV","storyPoints",3,"estimatedHours",0));
   assertNotNull(linked.get("backlogId"));assertEquals("completed",workspace.sprint(closed).get("status"));
 }
 @Test void existingBacklogLinkCanBeRemovedWithoutDeletingWork(){
   String backlog=workspace.backlog().getFirst().get("id").toString();var input=draft();input.put("backlogId",backlog);
   var action=actions.create(SPRINT,input);assertEquals(backlog,action.get("backlogId"));
   action.put("backlogId",null);action.put("status","CANCELLED");actions.update(SPRINT,action.get("id").toString(),action);
   assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM backlog_item WHERE id=?",Integer.class,backlog));
   assertThrows(IllegalArgumentException.class,()->actions.createBacklog(SPRINT,action.get("id").toString(),Map.of("version",1,"size","SMALL","taskCategory","DEV")));
 }
}
