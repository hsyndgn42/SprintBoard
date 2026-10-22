package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

/**
 * Work admitted to a sprint that has not started yet can still be corrected,
 * because nothing depends on its values until the sprint begins. The edit has
 * to reach the sprint task as well, or the backlog and the board would show
 * two different versions of the same work.
 */
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:plannedsprintedit;DB_CLOSE_DELAY=-1","sprintboard.slack.worker-enabled=false","sprintboard.auto-backup.enabled=false"})
class PlannedSprintEditTest {
  @Autowired WorkspaceService w;

  String plannedSprint(){return w.createSprint(Map.of("name","Planned edit sprint","start","2026-11-02","end","2026-11-22")).get("id").toString();}

  String admit(String sprint,String backlogId){
    var readiness=(Map<?,?>)((Map<?,?>)w.readiness(backlogId).get("readiness"));
    return w.addTask(sprint,Map.of("backlogId",backlogId,"reason","Planlama",
      "readinessAcknowledged",true,"readinessFingerprint",readiness.get("fingerprint"))).get("id").toString();
  }

  @SuppressWarnings("unchecked")
  Map<String,Object> task(String sprint,String taskId){
    return ((List<Map<String,Object>>)w.sprint(sprint).get("items")).stream()
      .filter(t->taskId.equals(t.get("id"))).findFirst().orElseThrow();
  }

  @Test @Transactional
  void editingPlannedWorkUpdatesBothTheBacklogItemAndItsSprintTask(){
    String sprint=plannedSprint();
    String backlogId=w.createBacklog(Map.of("title","Ilk hali","criteria","Kriter","size","SMALL","estimatedHours",4)).get("id").toString();
    String taskId=admit(sprint,backlogId);

    w.editBacklog(backlogId,Map.of("title","Duzeltilmis hali","criteria","Yeni kriter",
      "size","LARGE","estimatedHours",12,"taskCategory","TEST","taskSubtype","E2E_TEST"));

    var updated=task(sprint,taskId);
    assertEquals("Duzeltilmis hali",updated.get("name"),"the board must not keep the old title");
    assertEquals(12.0,((Number)updated.get("estimatedHours")).doubleValue(),
      "correcting the estimate before the sprint starts is the whole point of this path");
    assertEquals("TEST",updated.get("taskCategory"));
    assertEquals("E2E_TEST",updated.get("taskSubtype"));

    var item=w.backlog().stream().filter(b->backlogId.equals(b.get("id"))).findFirst().orElseThrow();
    assertEquals("Duzeltilmis hali",item.get("title"));
    assertEquals(12.0,((Number)item.get("estimatedHours")).doubleValue());
  }

  @Test @Transactional
  void remainingHoursFollowTheCorrectedEstimate(){
    String sprint=plannedSprint();
    String backlogId=w.createBacklog(Map.of("title","Kalan saat","criteria","Kriter","size","SMALL","estimatedHours",4)).get("id").toString();
    String taskId=admit(sprint,backlogId);

    w.editBacklog(backlogId,Map.of("title","Kalan saat","criteria","Kriter","size","SMALL","estimatedHours",9));

    // Admission sets remaining hours from the estimate; leaving them at the old
    // value would make the sprint look partly burned down before it started.
    assertEquals(9.0,((Number)task(sprint,taskId).get("remainingHours")).doubleValue());
  }

  @Test @Transactional
  void startingTheSprintClosesTheBacklogEditPath(){
    String sprint=plannedSprint();
    String backlogId=w.createBacklog(Map.of("title","Baslayan sprint","criteria","Kriter","size","SMALL","estimatedHours",4)).get("id").toString();
    admit(sprint,backlogId);
    w.startSprint(sprint);

    // Once the team has committed, the sprint screens own the task. Allowing a
    // silent backlog edit here would rewrite work that is already in progress.
    assertThrows(IllegalArgumentException.class,
      ()->w.editBacklog(backlogId,Map.of("title","Olmaz","criteria","Kriter","size","SMALL","estimatedHours",99)));
  }
}
