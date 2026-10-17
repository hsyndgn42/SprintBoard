package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.jdbc.core.JdbcTemplate;
import com.fasterxml.jackson.databind.ObjectMapper;

@SpringBootTest(properties="spring.datasource.url=jdbc:h2:mem:baupolicy;DB_CLOSE_DELAY=-1")
@Transactional
@org.junit.jupiter.api.Tag("historical")
@org.springframework.test.context.ActiveProfiles("historical-tests")
class BauPolicyTest {
  @Autowired WorkspaceService workspace;
  @Autowired SprintFlowService flow;
  @Autowired JdbcTemplate jdbc;
  @Autowired ObjectMapper mapper;
  final String sprint="legacy-sprint-14";
  List<Map<String,Object>> tasks(Map<String,Object> p){return (List<Map<String,Object>>)p.get("tasks");}
  String bau(){return jdbc.queryForList("SELECT id FROM sprint_task WHERE sprint_id=? AND task_category='BAU' ORDER BY id",String.class,sprint).getFirst();}

  @Test void manualStatusAndBlockerAreRejectedButAssignmentPlanningRemains(){
    String id=bau();
    for(String status:List.of("todo","doing","undone","done"))
      assertThrows(IllegalArgumentException.class,()->workspace.updateTask(id,Map.of("status",status,"note","test")));
    assertThrows(IllegalArgumentException.class,()->workspace.updateTask(id,Map.of("status","doing","taskCategory","DEV")));
    assertThrows(IllegalArgumentException.class,()->flow.setBlocker(id,Map.of("blocked",true,"version",0,"reason","test")));
    String delivery=jdbc.queryForList("SELECT id FROM sprint_task WHERE sprint_id=? AND task_category='DEV'",String.class,sprint).getFirst();
    workspace.updateTask(delivery,Map.of("status","doing"));
    assertEquals("doing",jdbc.queryForObject("SELECT status FROM sprint_task WHERE id=?",String.class,delivery));
  }

  @Test void allBauIncludingCustomCloseDoneWithoutCarryOrCapacityChanges(){
    String custom=bau();
    jdbc.update("UPDATE sprint_task SET external_id='CUSTOM-BAU',status='undone',status_note='Eski not' WHERE id=?",custom);
    jdbc.update("UPDATE sprint_task SET status='doing' WHERE sprint_id=? AND task_category='BAU' AND id<>?",sprint,custom);
    jdbc.update("INSERT INTO task_blocker(task_id,blocked,reason,updated_at,version) VALUES (?,TRUE,'Eski engel','2026-10-16T00:00:00Z',1)",custom);
    var before=mapper.valueToTree(workspace.sprint(sprint));
    var capacity=mapper.valueToTree(workspace.capacity(sprint));
    int backlog=workspace.backlog().size();
    var preview=workspace.closurePreview(sprint);
    assertEquals(before,mapper.valueToTree(workspace.sprint(sprint)),"Preview must not rewrite source");
    var bauTasks=tasks(preview).stream().filter(t->Boolean.TRUE.equals(t.get("bau"))).toList();
    assertFalse(bauTasks.isEmpty());
    assertTrue(bauTasks.stream().allMatch(t->"done".equals(t.get("outcome"))&&!Boolean.TRUE.equals(t.get("defaultCarry"))&&!Boolean.TRUE.equals(t.get("blocked"))));
    assertEquals(false,tasks(preview).stream().filter(t->custom.equals(t.get("id"))).findFirst().orElseThrow().get("automaticBau"));
    assertThrows(IllegalArgumentException.class,()->workspace.completeSprint(sprint,Map.of("confirmed",true,"fingerprint",preview.get("fingerprint"),"carryTaskIds",List.of(custom))));
    workspace.completeSprint(sprint,Map.of("confirmed",true,"fingerprint",preview.get("fingerprint"),"carryTaskIds",List.of()));
    assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM sprint_task WHERE sprint_id=? AND task_category='BAU' AND status<>'done'",Integer.class,sprint));
    assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM sprint_task t JOIN backlog_item b ON b.id=t.backlog_id WHERE t.sprint_id=? AND t.task_category='BAU' AND b.state<>'Done'",Integer.class,sprint));
    assertEquals(backlog,workspace.backlog().size());
    assertEquals(capacity,mapper.valueToTree(workspace.capacity(sprint)));
    assertEquals(false,flow.blocker(custom).get("blocked"));
    assertEquals("Eski not",jdbc.queryForObject("SELECT status_note FROM sprint_task WHERE id=?",String.class,custom));
  }

  @Test void operationalBauIsNotWipOrBlockedDelivery(){
    var task=new HashMap<String,Object>(Map.of("id","test","taskCategory","BAU","status","doing","blocker",Map.of("blocked",true)));
    var result=flow.read(sprint,List.of(task));
    assertEquals(0L,result.get("wip"));assertEquals(0L,result.get("blocked"));
  }
}
