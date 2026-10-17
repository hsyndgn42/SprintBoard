package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties="spring.datasource.url=jdbc:h2:mem:planningtest;DB_CLOSE_DELAY=-1")
@Transactional
@org.junit.jupiter.api.Tag("historical")
@org.springframework.test.context.ActiveProfiles("historical-tests")
class BacklogPlanningTest {
  @Autowired WorkspaceService workspace;
  private Map<String,Object> draft(String title) { return new HashMap<>(Map.of("title",title,"size","SMALL","estimatedHours",8,"criteria","Acceptance","priority","HIGH","ownerId","legacy-member-akin")); }
  private String create(String title) { return workspace.createBacklog(draft(title)).get("id").toString(); }
  private Map<String,Object> check(String id) { return (Map<String,Object>)workspace.readiness(id).get("readiness"); }

  @Test void preservesHistoryAndDoesNotInferOwnerOrPriority() {
    assertTrue(workspace.backlog().stream().allMatch(b->"UNSET".equals(b.get("priority")) && b.get("ownerId")==null));
    String id=create("Ready");assertEquals(true,check(id).get("ready"));
    workspace.addTask("legacy-sprint-14",Map.of("backlogId",id,"reason","Test planı"));
    assertEquals(false,check(id).get("eligible"));
    assertThrows(IllegalArgumentException.class,()->workspace.addTask("legacy-sprint-14",Map.of("backlogId",id)));
  }
  @Test void dependenciesRequireCurrentAcknowledgmentAndBecomeReadyWhenDone() {
    String parent=create("Parent"),id=create("Child");var edit=draft("Child");edit.put("dependencyIds",List.of(parent));workspace.editBacklog(id,edit);
    var first=check(id);assertEquals(false,first.get("ready"));
    assertThrows(IllegalArgumentException.class,()->workspace.addTask("legacy-sprint-14",Map.of("backlogId",id)));
    var ack=Map.<String,Object>of("backlogId",id,"reason","Test planı","readinessAcknowledged",true,"readinessFingerprint",first.get("fingerprint"));
    edit.put("title","Changed child");workspace.editBacklog(id,edit);
    assertThrows(IllegalArgumentException.class,()->workspace.addTask("legacy-sprint-14",ack));
    String task=workspace.addTask("legacy-sprint-14",Map.of("backlogId",parent,"reason","Test planı")).get("id").toString();
    workspace.updateTask(task,Map.of("status","done"));assertEquals(true,check(id).get("ready"));
    workspace.setMemberActive("legacy-member-akin",Map.of("active",false));assertEquals(true,check(id).get("ready"));
    workspace.addTask("legacy-sprint-14",Map.of("backlogId",id,"reason","Test planı","readinessAcknowledged",true,"readinessFingerprint",check(id).get("fingerprint")));
    var repeated=workspace.repeatBacklog(id);var copy=workspace.readiness(repeated.get("id").toString());
    assertEquals("HIGH",copy.get("priority"));assertEquals("legacy-member-akin",copy.get("ownerId"));assertEquals(1,((List<?>)copy.get("dependencies")).size());
  }
  @Test void rejectsSelfMissingAndCyclicDependenciesAndUnknownOwners() {
    String a=create("A"),b=create("B");var edit=draft("A");edit.put("dependencyIds",List.of(b));workspace.editBacklog(a,edit);
    var cycle=draft("B");cycle.put("dependencyIds",List.of(a));assertThrows(IllegalArgumentException.class,()->workspace.editBacklog(b,cycle));
    cycle.put("dependencyIds",List.of(b));assertThrows(IllegalArgumentException.class,()->workspace.editBacklog(b,cycle));
    cycle.put("dependencyIds",List.of("missing"));assertThrows(IllegalArgumentException.class,()->workspace.editBacklog(b,cycle));
    cycle.put("dependencyIds",List.of());cycle.put("ownerId","missing");assertThrows(IllegalArgumentException.class,()->workspace.editBacklog(b,cycle));
  }
  @Test void readinessUsesConfiguredEstimationAndWarnsOnMissingCriteriaAndEffort() {
    var input=draft("Incomplete");input.put("criteria","");input.put("priority","UNSET");input.put("ownerId","");input.put("estimatedHours",0);
    String id=workspace.createBacklog(input).get("id").toString();assertEquals(3,((List<?>)check(id).get("warnings")).size());
    workspace.updateSettings(Map.of("estimationMode","POINTS_AND_HOURS"));assertEquals(4,((List<?>)check(id).get("warnings")).size());
  }
  @Test void ownerlessBacklogIsReadyAndDoesNotCreateAssignments() {
    var input=draft("No separate owner");input.remove("ownerId");
    String id=workspace.createBacklog(input).get("id").toString();
    assertNull(workspace.readiness(id).get("ownerId"));
    assertEquals(true,check(id).get("ready"));
    assertTrue(((List<?>)check(id).get("warnings")).isEmpty());
    String task=workspace.addTask("legacy-sprint-14",Map.of("backlogId",id,"reason","Ownerless planning")).get("id").toString();
    var sprint=workspace.sprint("legacy-sprint-14");
    var row=((List<Map<String,Object>>)sprint.get("items")).stream().filter(t->task.equals(t.get("id"))).findFirst().orElseThrow();
    assertTrue(((List<?>)row.get("assignments")).isEmpty());
  }
}
