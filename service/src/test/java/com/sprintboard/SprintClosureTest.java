package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import com.fasterxml.jackson.databind.ObjectMapper;

@org.junit.jupiter.api.Tag("historical")
@org.springframework.test.context.ActiveProfiles("historical-tests")
@SpringBootTest(properties="spring.datasource.url=jdbc:h2:mem:closuretest;DB_CLOSE_DELAY=-1")
@Transactional
class SprintClosureTest {
  @Autowired WorkspaceService workspace;
  @Autowired SprintClosureStore store;
  @Autowired ObjectMapper mapper;
  @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
  private final String id="legacy-sprint-14";
  private Map<String,Object> input(Map<String,Object> preview,List<String> ids){return Map.of("confirmed",true,"fingerprint",preview.get("fingerprint"),"carryTaskIds",ids);}
  private List<Map<String,Object>> tasks(Map<String,Object> p){return (List<Map<String,Object>>)p.get("tasks");}

  @Test void previewDoesNotMutateAndRejectsStaleMissingConfirmationAndInvalidSelections(){
    var before=mapper.valueToTree(workspace.sprint(id));var preview=workspace.closurePreview(id);
    assertEquals(before,mapper.valueToTree(workspace.sprint(id)));assertNull(store.read(id));
    assertThrows(IllegalArgumentException.class,()->workspace.completeSprint(id,Map.of()));
    String bau=tasks(preview).stream().filter(t->Boolean.TRUE.equals(t.get("automaticBau"))).findFirst().orElseThrow().get("id").toString();
    assertThrows(IllegalArgumentException.class,()->workspace.completeSprint(id,input(preview,List.of(bau))));
    assertThrows(IllegalArgumentException.class,()->workspace.completeSprint(id,input(preview,List.of("missing"))));
    workspace.setSprintMemberAllocation(id,"legacy-member-akin",Map.of("allocatedDays",5));
    assertThrows(IllegalArgumentException.class,()->workspace.completeSprint(id,input(preview,List.of())));
    assertEquals("active",workspace.sprint(id).get("status"));assertNull(store.read(id));
  }
  @Test void freezesCapacityAssignmentsAndEstimatesAndHonorsCarryAndDoneRepeat(){
    var preview=workspace.closurePreview(id);
    var regular=tasks(preview).stream().filter(t->!Boolean.TRUE.equals(t.get("automaticBau"))).toList();
    String done=regular.get(0).get("id").toString(),carry=regular.get(1).get("id").toString();
    workspace.updateTask(done,Map.of("status","done"));preview=workspace.closurePreview(id);
    var capacity=mapper.valueToTree(workspace.capacity(id));
    int count=workspace.backlog().size();
    var result=workspace.completeSprint(id,input(preview,List.of(done,carry)));
    assertEquals(2,result.get("carryoverCount"));assertEquals(count+2,workspace.backlog().size());
    assertEquals(true,workspace.sprint(id).get("closureFrozen"));assertEquals(capacity,mapper.valueToTree(workspace.capacity(id)));
    var frozen=mapper.valueToTree(workspace.sprint(id));
    var report=mapper.valueToTree(workspace.memberReports().stream().filter(r->id.equals(r.get("sprintId"))).toList());
    workspace.updateSettings(Map.of("estimationMode","POINTS_AND_HOURS"));
    assertThrows(IllegalArgumentException.class,()->workspace.createLeave(Map.of("leaveType","ANNUAL","memberId","legacy-member-akin","sprintId",id,"days",1)));
    jdbc.update("UPDATE member SET name='Renamed later',team_role='TESTER' WHERE id='legacy-member-akin'");
    assertEquals(capacity,mapper.valueToTree(workspace.capacity(id)));assertEquals(frozen,mapper.valueToTree(workspace.sprint(id)));
    assertEquals(report,mapper.valueToTree(workspace.memberReports().stream().filter(r->id.equals(r.get("sprintId"))).toList()));
    assertThrows(IllegalArgumentException.class,()->workspace.updateTask(done,Map.of("taskCategory","DESIGN")));
    assertThrows(IllegalArgumentException.class,()->workspace.replaceAssignments(done,Map.of("assignments",List.of())));
    assertThrows(IllegalArgumentException.class,()->workspace.setSprintMemberAllocation(id,"legacy-member-akin",Map.of("allocatedDays",2)));
    var stale=preview;assertThrows(IllegalArgumentException.class,()->workspace.completeSprint(id,input(stale,List.of(done,carry))));
    assertEquals(count+2,workspace.backlog().size());assertNull(store.read("legacy-sprint-13"));
    assertEquals(2,((List<?>)store.read(id).get("carried")).size());
  }
}
