package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

@org.junit.jupiter.api.Tag("historical")
@org.springframework.test.context.ActiveProfiles("historical-tests")
@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:sprintboardtest;DB_CLOSE_DELAY=-1")
class WorkspaceServiceTest {
  @Autowired WorkspaceService workspace;
  @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

  @Test @Transactional
  void companyLeaveHasNoEntitlementEffectAndBalancesSprintThirteen() {
    var records=workspace.leaves().stream().filter(r->"legacy-sprint-13".equals(r.get("sprintId"))).toList();
    assertEquals(7,records.size());
    for(var record:records){
      assertEquals(5.0,record.get("days"));assertEquals("COMPANY_GRANTED",record.get("leaveType"));
      assertEquals("NONE",record.get("entitlementEffect"));assertNull(record.get("start"));assertNull(record.get("end"));
      assertFalse(List.of("legacy-member-sakir","legacy-member-ali-firat").contains(record.get("memberId")));
      var capacity=workspace.capacity("legacy-sprint-13").stream().filter(r->r.get("memberId").equals(record.get("memberId"))).findFirst().orElseThrow();
      assertEquals(5.0,capacity.get("leaveDays"));assertEquals(80.0,capacity.get("availableHours"));
      assertEquals(80.0,capacity.get("plannedHours"));assertEquals(0.0,capacity.get("remainingHours"));
      var report=workspace.memberReports().stream().filter(r->r.get("memberId").equals(record.get("memberId"))&&"legacy-sprint-13".equals(r.get("sprintId"))).findFirst().orElseThrow();
      assertEquals(80.0,report.get("availableHours"));assertEquals(5.0,report.get("leaveDays"));
    }
    // Company leave must not be converted into overtime usage or a lower earned balance.
    var isa=workspace.overtime().stream().filter(r->"legacy-member-isa".equals(r.get("memberId"))&&Integer.valueOf(13).equals(r.get("sprintNumber"))).findFirst().orElseThrow();
    assertEquals(24.0,isa.get("usedCumulativeHours"));assertEquals(38.0,isa.get("balanceHours"));
  }

  @Test @Transactional
  void sharedJulyHolidaysReduceCapacityWithoutChangingBauEffortOrPersonalLeave() {
    var capacity=workspace.capacity("legacy-sprint-12");
    for(String member:List.of("legacy-member-akin","legacy-member-cemil")){
      var row=capacity.stream().filter(r->member.equals(r.get("memberId"))).findFirst().orElseThrow();
      assertEquals(15,((Number)row.get("workingDays")).intValue());
      assertEquals(3,((Number)row.get("nonWorkingDays")).intValue());
      assertEquals(12.0,row.get("allocatedDays"));assertEquals(0.0,row.get("leaveDays"));
      assertEquals(96.0,row.get("availableHours"));assertEquals(96.0,row.get("plannedHours"));
      assertEquals(0.0,row.get("remainingHours"));
      var report=workspace.memberReports().stream().filter(r->member.equals(r.get("memberId"))
          && "legacy-sprint-12".equals(r.get("sprintId"))).findFirst().orElseThrow();
      assertEquals(96.0,report.get("availableHours"));assertEquals(3.0,report.get("nonWorkingDays"));
    }
    var isa=capacity.stream().filter(r->"legacy-member-isa".equals(r.get("memberId"))).findFirst().orElseThrow();
    assertEquals(1.0,isa.get("leaveDays"));assertEquals(88.0,isa.get("availableHours"));
    assertEquals(3,workspace.calendar().stream().filter(d->"Temmuz Tatili".equals(d.get("title"))).count());
  }

  @Test @Transactional
  void holidayMigrationPreservesExistingEntriesAndDoesNotDoubleCountDates() {
    var assignments=jdbc.queryForList("SELECT * FROM assignment ORDER BY id");
    var leaves=workspace.leaves();var overtime=workspace.overtime();
    jdbc.update("DELETE FROM non_working_day WHERE id IN ('legacy-holiday-20260715','legacy-holiday-20260716','legacy-holiday-20260717')");
    jdbc.update("INSERT INTO non_working_day VALUES ('existing-july-15',DATE '2026-07-15','Existing global holiday',NULL)");
    jdbc.update("INSERT INTO non_working_day VALUES ('existing-person-july-16',DATE '2026-07-16','Personal calendar','legacy-member-akin')");
    var populator=new org.springframework.jdbc.datasource.init.ResourceDatabasePopulator(
        new org.springframework.core.io.ClassPathResource("db/migration/V18__sprint_12_confirmed_july_holidays.sql"));
    populator.execute(jdbc.getDataSource());populator.execute(jdbc.getDataSource());
    assertEquals(3,jdbc.queryForObject("SELECT COUNT(*) FROM non_working_day WHERE day_date BETWEEN DATE '2026-07-15' AND DATE '2026-07-17' AND member_id IS NULL",Integer.class));
    assertEquals("Existing global holiday",jdbc.queryForObject("SELECT title FROM non_working_day WHERE id='existing-july-15'",String.class));
    assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM non_working_day WHERE id='existing-person-july-16'",Integer.class));
    var akin=workspace.capacity("legacy-sprint-12").stream().filter(r->"legacy-member-akin".equals(r.get("memberId"))).findFirst().orElseThrow();
    assertEquals(3,((Number)akin.get("nonWorkingDays")).intValue());assertEquals(96.0,akin.get("availableHours"));
    assertEquals(assignments,jdbc.queryForList("SELECT * FROM assignment ORDER BY id"));
    assertEquals(leaves,workspace.leaves());assertEquals(overtime,workspace.overtime());
  }

  @Test @Transactional
  void correctsSprintEightDateWithoutChangingHolidayBauOrOtherRecords() {
    assertEquals("2026-04-14", workspace.sprint("legacy-sprint-08").get("start"));
    var beforeAssignments=jdbc.queryForList("SELECT * FROM assignment ORDER BY id");
    var beforeLeaves=workspace.leaves();
    var beforeOvertime=workspace.overtime();
    jdbc.update("UPDATE sprint SET start_date=DATE '2026-03-14' WHERE id='legacy-sprint-08'");
    var script=new org.springframework.core.io.ClassPathResource("db/migration/V17__correct_sprint_8_start_date.sql");
    var populator=new org.springframework.jdbc.datasource.init.ResourceDatabasePopulator(script);
    populator.execute(jdbc.getDataSource());
    assertEquals("2026-04-14",workspace.sprint("legacy-sprint-08").get("start"));
    assertEquals("2026-05-04",workspace.sprint("legacy-sprint-08").get("end"));
    var isa=workspace.capacity("legacy-sprint-08").stream()
        .filter(r->r.get("memberId").equals("legacy-member-isa")).findFirst().orElseThrow();
    assertEquals(15,((Number)isa.get("workingDays")).intValue());
    assertEquals(15.0,isa.get("allocatedDays"));
    var report=workspace.memberReports().stream().filter(r->r.get("sprintId").equals("legacy-sprint-08")
        && r.get("memberId").equals("legacy-member-isa")).findFirst().orElseThrow();
    assertEquals(15.0,report.get("allocatedDays"));
    assertEquals(isa.get("availableHours"),report.get("availableHours"));
    assertEquals(beforeAssignments,jdbc.queryForList("SELECT * FROM assignment ORDER BY id"));
    assertEquals(beforeLeaves,workspace.leaves());assertEquals(beforeOvertime,workspace.overtime());
    assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM audit_event WHERE action='source-date-corrected'",Integer.class));
    populator.execute(jdbc.getDataSource());
    assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM audit_event WHERE action='source-date-corrected'",Integer.class));
    jdbc.update("UPDATE sprint SET start_date=DATE '2026-04-15' WHERE id='legacy-sprint-08'");
    populator.execute(jdbc.getDataSource());
    assertEquals("2026-04-15",workspace.sprint("legacy-sprint-08").get("start"));
  }

  private Map<String,Object> addCheckedTask(String sprint,Map<String,Object> input) {
    var payload=new java.util.HashMap<String,Object>(input);
    payload.put("reason","Test planlaması");
    var readiness=(Map<String,Object>)workspace.readiness(input.get("backlogId").toString()).get("readiness");
    payload.put("readinessAcknowledged",true);payload.put("readinessFingerprint",readiness.get("fingerprint"));
    return workspace.addTask(sprint,payload);
  }

  @Test @Transactional
  void editsReadyBacklogWithoutChangingHistoricalTasksAndSupportsBothEstimationModes() {
    var created=workspace.createBacklog(Map.of("title","Ready edit","size","SMALL","estimatedHours",8));
    var edit=new java.util.HashMap<String,Object>(Map.of("title","Updated title","criteria","Acceptance text","size","LARGE","estimatedHours",24,"taskCategory","TEST","taskSubtype","E2E_TEST"));
    workspace.editBacklog(created.get("id").toString(),edit);
    var actual=workspace.backlog().stream().filter(item->item.get("id").equals(created.get("id"))).findFirst().orElseThrow();
    assertEquals("Updated title",actual.get("title"));assertEquals("Acceptance text",actual.get("criteria"));assertEquals("E2E_TEST",actual.get("taskSubtype"));
    assertEquals(24.0,actual.get("estimatedHours"));
    addCheckedTask("legacy-sprint-14",Map.of("backlogId",created.get("id")));
    assertThrows(IllegalArgumentException.class,()->workspace.editBacklog(created.get("id").toString(),edit));
    workspace.updateSettings(Map.of("estimationMode","POINTS_AND_HOURS"));
    edit.put("size",null);edit.put("storyPoints",5);
    var pointed=workspace.createBacklog(edit);
    edit.put("title","SP edited");workspace.editBacklog(pointed.get("id").toString(),edit);
    var pointItem=workspace.backlog().stream().filter(item->item.get("id").equals(pointed.get("id"))).findFirst().orElseThrow();
    assertEquals(5.0,pointItem.get("storyPoints"));assertNull(pointItem.get("size"));
  }

  @Test @Transactional
  void deliveryMetricsUseTheSameScopeAndDoNotFabricateEmptyRates() {
    int total=0,done=0;
    for (Map<String,Object> report : workspace.reports()) {
      var sprint=workspace.sprint((String)report.get("id"));
      var items=(List<Map<String,Object>>)sprint.get("items");
      var delivery=items.stream().filter(item -> !"BAU".equals(item.get("taskCategory")) && !"LEAVE".equals(item.get("workKind")) && !"LEAVE".equals(item.get("taskSubtype"))).toList();
      long delivered=delivery.stream().filter(item -> "done".equals(item.get("status"))).count();
      assertEquals(delivery.size(),report.get("tasks"));
      assertEquals((int)delivered,report.get("done"));
      assertEquals(delivery.size(),sprint.get("deliveryTaskCount"));
      assertEquals(delivery.isEmpty()?null:Math.round(100.0*delivered/delivery.size()),report.get("deliveryRate"));
      total+=delivery.size(); done+=delivered;
    }
    assertEquals(done,workspace.overview().get("deliveredTasks"));
    assertEquals(Math.round(100.0*done/total),workspace.overview().get("deliveryRate"));
    var planned=workspace.createSprint(Map.of("name","BAU-only metric test","start","2027-01-04","end","2027-01-15"));
    jdbc.update("UPDATE sprint SET status='completed' WHERE id=?",planned.get("id"));
    var empty=workspace.reports().stream().filter(row -> row.get("id").equals(planned.get("id"))).findFirst().orElseThrow();
    assertEquals(0,empty.get("tasks")); assertNull(empty.get("deliveryRate"));
  }

  @Test
  @Transactional
  void importsTheHistoricalWorkspaceWithoutInventingStoryPoints() {
    assertEquals(14, workspace.sprints().size());
    assertEquals(362, workspace.backlog().size());
    assertEquals(13L, workspace.sprints().stream().filter(row -> "completed".equals(row.get("status"))).count());
    assertEquals(1L, workspace.sprints().stream().filter(row -> "active".equals(row.get("status"))).count());
    assertEquals(12, workspace.team().size());
    assertFalse(workspace.leaves().isEmpty());
    assertFalse(workspace.overtime().isEmpty());
    assertEquals("SIZE_AND_HOURS", workspace.settings().get("estimationMode"));
    assertEquals(362, workspace.backlog().stream().filter(row -> row.get("size") != null).count());
    assertEquals(0, workspace.backlog().stream().filter(row -> row.get("storyPoints") != null).count());
    assertTrue(workspace.backlog().stream().allMatch(row -> row.get("taskCategory") != null));
    for (Map<String, Object> sprint : workspace.sprints()) {
      @SuppressWarnings("unchecked")
      List<Map<String, Object>> tasks = (List<Map<String, Object>>) workspace.sprint((String) sprint.get("id")).get("items");
      assertEquals(4, tasks.stream().filter(task -> String.valueOf(task.get("externalId")).startsWith("BAU-AUTO:")).count());
      assertTrue(tasks.stream().allMatch(task -> task.get("taskCategory") != null));
      assertEquals("completed".equals(sprint.get("status")) ? "done" : "todo",
          tasks.stream().filter(task -> String.valueOf(task.get("externalId")).contains("bau-support"))
              .findFirst().orElseThrow().get("status"));
    }
    assertEquals(0, workspace.backfillHistoricalBau());
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> sprint13Tasks = (List<Map<String, Object>>) workspace.sprint("legacy-sprint-13").get("items");
    assertTrue(sprint13Tasks.stream().filter(task -> List.of("MEETING", "SUPPORT").contains(task.get("workKind"))
        && "BAU".equals(task.get("type"))).flatMap(task -> ((List<Map<String, Object>>) task.get("assignments")).stream())
        .allMatch(assignment -> ((Number) assignment.get("estimatedHours")).doubleValue() == 8));
  }

  @Test
  @Transactional
  void reportsExposeUsefulSizeAndMemberDeliveryDistributions() {
    List<Map<String, Object>> sprintReports = workspace.reports();
    assertFalse(sprintReports.isEmpty());
    for (Map<String, Object> sprint : sprintReports) {
      int sizeTotal = ((Number) sprint.get("sizeSmall")).intValue()
          + ((Number) sprint.get("sizeMedium")).intValue()
          + ((Number) sprint.get("sizeLarge")).intValue()
          + ((Number) sprint.get("sizeXLarge")).intValue();
      assertEquals(((Number) sprint.get("tasks")).intValue(), sizeTotal);
      assertEquals(0, ((Number) sprint.get("pointedTasks")).intValue());
    }
    List<Map<String, Object>> members = workspace.memberReports();
    assertFalse(members.isEmpty());
    assertTrue(members.stream().allMatch(row -> ((Number) row.get("taskCount")).intValue()
        == ((Number) row.get("done")).intValue() + ((Number) row.get("undone")).intValue()
            + ((Number) row.get("other")).intValue()));
    assertTrue(members.stream().anyMatch(row -> ((Number) row.get("effortHours")).doubleValue() > 0));
    assertTrue(members.stream().anyMatch(row -> ((Number) row.get("sizeMedium")).intValue() > 0));
    List<Map<String, Object>> workTypes = workspace.workTypeReports();
    assertFalse(workTypes.isEmpty());
    assertTrue(workTypes.stream().anyMatch(row -> "BAU".equals(row.get("taskCategory")) && "SUPPORT".equals(row.get("taskSubtype"))));
    assertTrue(workTypes.stream().anyMatch(row -> "TEST".equals(row.get("taskCategory")) && "GENERAL_TEST".equals(row.get("taskSubtype"))));
  }

  @Test
  @Transactional
  void taskTaxonomyRequiresDetailedSubtypesAndStaysInSyncWithSprintTask() {
    assertThrows(IllegalArgumentException.class, () -> workspace.createBacklog(Map.of(
        "title", "Eksik defect kırılımı", "size", "SMALL", "taskCategory", "DEFECT")));
    String backlogId = (String) workspace.createBacklog(Map.of(
        "title", "Fonksiyonel akış testi", "size", "MEDIUM", "estimatedHours", 12,
        "taskCategory", "TEST", "taskSubtype", "FUNCTIONAL_TEST")).get("id");
    Map<String, Object> backlog = workspace.backlog().stream().filter(row -> backlogId.equals(row.get("id"))).findFirst().orElseThrow();
    assertEquals("TEST", backlog.get("taskCategory"));
    assertEquals("FUNCTIONAL_TEST", backlog.get("taskSubtype"));

    String sprintId = (String) workspace.sprints().stream().filter(row -> "active".equals(row.get("status"))).findFirst().orElseThrow().get("id");
    String taskId = (String) addCheckedTask(sprintId, Map.of("backlogId", backlogId)).get("id");
    workspace.updateTask(taskId, Map.of("taskCategory", "DEFECT", "taskSubtype", "PROD_DEFECT"));
    @SuppressWarnings("unchecked")
    Map<String, Object> task = ((List<Map<String, Object>>) workspace.sprint(sprintId).get("items")).stream()
        .filter(row -> taskId.equals(row.get("id"))).findFirst().orElseThrow();
    Map<String, Object> linkedBacklog = workspace.backlog().stream().filter(row -> backlogId.equals(row.get("id"))).findFirst().orElseThrow();
    assertEquals("DEFECT", task.get("taskCategory"));
    assertEquals("PROD_DEFECT", task.get("taskSubtype"));
    assertEquals("DEFECT", linkedBacklog.get("taskCategory"));
    assertEquals("PROD_DEFECT", linkedBacklog.get("taskSubtype"));
    assertTrue(workspace.workTypeReports().stream().anyMatch(row -> sprintId.equals(row.get("sprintId"))
        && "DEFECT".equals(row.get("taskCategory")) && "PROD_DEFECT".equals(row.get("taskSubtype"))));
  }

  @Test
  @Transactional
  void roadmapHasManyBacklogItemsButEachBacklogHasOneSprintTask() {
    String roadmapId = (String) workspace.createRoadmap(Map.of("title", "Yeni ürün alanı")).get("id");
    String firstId = (String) workspace.createBacklog(Map.of("title", "İlk iş", "roadmapId", roadmapId, "size", "SMALL")).get("id");
    String secondId = (String) workspace.createBacklog(Map.of("title", "İkinci iş", "roadmapId", roadmapId, "size", "LARGE")).get("id");
    assertNotEquals(firstId, secondId);
    assertEquals(2L, ((Number) workspace.roadmap().stream().filter(row -> roadmapId.equals(row.get("id"))).findFirst().orElseThrow().get("backlogCount")).longValue());
    String sprintId = (String) workspace.createSprint(Map.of("name", "Sprint 15", "start", "2026-09-15", "end", "2026-09-29")).get("id");
    addCheckedTask(sprintId, Map.of("backlogId", firstId));
    assertThrows(IllegalArgumentException.class, () -> addCheckedTask(sprintId, Map.of("backlogId", firstId)));
    addCheckedTask(sprintId, Map.of("backlogId", secondId));
    assertEquals(7, ((List<?>) workspace.sprint(sprintId).get("items")).size());
  }

  @Test
  @Transactional
  void estimationMethodIsConfigurableButEffortRemainsHours() {
    assertThrows(IllegalArgumentException.class, () -> workspace.createBacklog(Map.of("title", "Size eksik", "estimatedHours", 8)));
    String sizedId = (String) workspace.createBacklog(Map.of("title", "Size işi", "size", "X-LARGE", "estimatedHours", 24)).get("id");
    Map<String, Object> sized = workspace.backlog().stream().filter(row -> sizedId.equals(row.get("id"))).findFirst().orElseThrow();
    assertEquals("X-LARGE", sized.get("size"));
    assertEquals(24.0, ((Number) sized.get("estimatedHours")).doubleValue());
    assertNull(sized.get("storyPoints"));

    workspace.updateSettings(Map.of("estimationMode", "POINTS_AND_HOURS"));
    assertThrows(IllegalArgumentException.class, () -> workspace.createBacklog(Map.of("title", "Point eksik", "estimatedHours", 8)));
    String pointedId = (String) workspace.createBacklog(Map.of("title", "Point işi", "storyPoints", 5, "size", "LARGE", "estimatedHours", 16)).get("id");
    Map<String, Object> pointed = workspace.backlog().stream().filter(row -> pointedId.equals(row.get("id"))).findFirst().orElseThrow();
    assertEquals(5.0, ((Number) pointed.get("storyPoints")).doubleValue());
    assertEquals(16.0, ((Number) pointed.get("estimatedHours")).doubleValue());
    assertNull(pointed.get("size"));
  }

  @Test
  @Transactional
  void bauDefaultsAssignTwoDaysPerCoreMemberAndHistoricalLeavesReduceCapacity() {
    String sprintId = (String) workspace.createSprint(Map.of("name", "Sprint 15", "start", "2026-09-15", "end", "2026-09-29")).get("id");
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> tasks = (List<Map<String, Object>>) workspace.sprint(sprintId).get("items");
    for (String label : List.of("Team Support", "Team Meeting")) {
      Map<String, Object> bau = tasks.stream().filter(task -> ("Sprint 15 · " + label).equals(task.get("name"))).findFirst().orElseThrow();
      @SuppressWarnings("unchecked")
      List<Map<String, Object>> assignments = (List<Map<String, Object>>) bau.get("assignments");
      assertFalse(assignments.isEmpty());
      assertTrue(assignments.stream().allMatch(row -> ((Number) row.get("estimatedHours")).doubleValue() == 16.0));
      assertTrue(assignments.stream().noneMatch(row -> List.of("legacy-member-ali-firat", "legacy-member-sakir").contains(row.get("memberId"))));
      assertEquals(assignments.size() * 16.0, ((Number) bau.get("estimatedHours")).doubleValue());
      assertEquals("todo", bau.get("status"));
    }
    Map<String, Object> leaveTask = tasks.stream().filter(task -> "LEAVE".equals(task.get("workKind"))).findFirst().orElseThrow();
    assertEquals(0.0, ((Number) leaveTask.get("estimatedHours")).doubleValue());
    assertTrue(((List<?>) leaveTask.get("assignments")).isEmpty());
    assertThrows(IllegalArgumentException.class, () -> workspace.replaceAssignments((String) leaveTask.get("id"), Map.of("assignments", List.of())));
    double beforeLeave = ((Number) workspace.capacity(sprintId).stream().filter(row -> "legacy-member-gorkem".equals(row.get("memberId"))).findFirst().orElseThrow().get("availableHours")).doubleValue();
    workspace.createLeave(Map.of("leaveType","ANNUAL","memberId", "legacy-member-gorkem", "sprintId", sprintId, "days", 1));
    Map<String, Object> refreshedLeave = ((List<Map<String, Object>>) workspace.sprint(sprintId).get("items")).stream()
        .filter(task -> "LEAVE".equals(task.get("workKind"))).findFirst().orElseThrow();
    assertEquals(1.0, ((Number) ((List<Map<String, Object>>) refreshedLeave.get("assignments")).getFirst().get("leaveDays")).doubleValue());
    assertEquals(beforeLeave - 8, ((Number) workspace.capacity(sprintId).stream().filter(row -> "legacy-member-gorkem".equals(row.get("memberId"))).findFirst().orElseThrow().get("availableHours")).doubleValue());
    Map<String, Object> training = tasks.stream().filter(task -> "TRAINING".equals(task.get("workKind"))).findFirst().orElseThrow();
    assertEquals(0.0, ((Number) training.get("estimatedHours")).doubleValue());
    workspace.replaceAssignments((String) training.get("id"), Map.of("assignments", List.of(Map.of("memberId", "legacy-member-yasin", "estimatedHours", 8))));
    assertEquals(8.0, ((Number) ((List<Map<String, Object>>) workspace.sprint(sprintId).get("items")).stream()
        .filter(task -> training.get("id").equals(task.get("id"))).findFirst().orElseThrow().get("estimatedHours")).doubleValue());
    String historicalId = "legacy-sprint-14";
    Map<String, Object> gorkem = workspace.capacity(historicalId).stream().filter(row -> "legacy-member-gorkem".equals(row.get("memberId"))).findFirst().orElseThrow();
    Map<String, Object> isa = workspace.capacity(historicalId).stream().filter(row -> "legacy-member-isa".equals(row.get("memberId"))).findFirst().orElseThrow();
    assertEquals(2.0, ((Number) gorkem.get("leaveDays")).doubleValue());
    assertEquals(1.0, ((Number) isa.get("leaveDays")).doubleValue());
    assertEquals(8 * (((Number) gorkem.get("allocatedDays")).doubleValue() - 2), ((Number) gorkem.get("availableHours")).doubleValue());
    assertEquals(8 * (((Number) isa.get("allocatedDays")).doubleValue() - 1), ((Number) isa.get("availableHours")).doubleValue());
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> historicalTasks = (List<Map<String, Object>>) workspace.sprint(historicalId).get("items");
    Map<String, Object> historicalLeave = historicalTasks.stream().filter(task -> "LEAVE".equals(task.get("workKind"))).findFirst().orElseThrow();
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> leaveAssignments = (List<Map<String, Object>>) historicalLeave.get("assignments");
    assertTrue(leaveAssignments.stream().anyMatch(row -> "legacy-member-gorkem".equals(row.get("memberId")) && ((Number) row.get("leaveDays")).doubleValue() == 2));
    assertTrue(leaveAssignments.stream().anyMatch(row -> "legacy-member-isa".equals(row.get("memberId")) && ((Number) row.get("leaveDays")).doubleValue() == 1));
    assertThrows(IllegalArgumentException.class, () -> workspace.replaceAssignments((String) historicalLeave.get("id"), Map.of("assignments", List.of())));
    Map<String, Object> historicalTraining = historicalTasks.stream().filter(task -> "TRAINING".equals(task.get("workKind"))).findFirst().orElseThrow();
    assertTrue(((List<Map<String, Object>>) historicalTraining.get("assignments")).stream().anyMatch(row -> "legacy-member-yasin".equals(row.get("memberId")) && Boolean.TRUE.equals(row.get("supportOnly"))));
  }

  @Test
  @Transactional
  void configurableBauTemplateOnlyAffectsNewSprints() {
    String olderId = (String) workspace.createSprint(Map.of("name", "Sprint 15", "start", "2026-09-15", "end", "2026-09-29")).get("id");
    Map<String, Object> custom = workspace.createBauTemplate(Map.of("title", "Operasyon koordinasyonu", "mode", "CORE", "daysPerMember", 1));
    String newerId = (String) workspace.createSprint(Map.of("name", "Sprint 16", "start", "2026-09-30", "end", "2026-10-14")).get("id");
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> older = (List<Map<String, Object>>) workspace.sprint(olderId).get("items");
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> newer = (List<Map<String, Object>>) workspace.sprint(newerId).get("items");
    assertEquals(5, older.size());
    assertEquals(6, newer.size());
    Map<String, Object> customTask = newer.stream().filter(task -> "Sprint 16 · Operasyon koordinasyonu".equals(task.get("name"))).findFirst().orElseThrow();
    assertTrue(((List<Map<String, Object>>) customTask.get("assignments")).stream().allMatch(row -> ((Number) row.get("estimatedHours")).doubleValue() == 8));
    workspace.updateBauTemplate((String) custom.get("id"), Map.of("title", "Operasyon koordinasyonu", "mode", "CORE", "daysPerMember", 1, "active", false));
    String lastId = (String) workspace.createSprint(Map.of("name", "Sprint 17", "start", "2026-10-15", "end", "2026-10-29")).get("id");
    assertEquals(5, ((List<?>) workspace.sprint(lastId).get("items")).size());
  }

  @Test
  @Transactional
  void completingSprintPreservesHistoryAndOffersUndoneWorkForNextSprint() {
    String activeId = (String) workspace.sprints().stream().filter(row -> "active".equals(row.get("status"))).findFirst().orElseThrow().get("id");
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> tasks = (List<Map<String, Object>>) workspace.sprint(activeId).get("items");
    Map<String, Object> task = tasks.stream().filter(row -> !String.valueOf(row.get("externalId")).startsWith("BAU-AUTO:"))
        .findFirst().orElseThrow();
    assertThrows(IllegalArgumentException.class, () -> workspace.updateTask((String) task.get("id"), Map.of("status", "undone")));
    workspace.updateTask((String) task.get("id"), Map.of("status", "undone", "note", "Kapsam tamamlanmadı"));
    var preview=workspace.closurePreview(activeId);
    var selections=((List<Map<String,Object>>)preview.get("tasks")).stream().filter(t->Boolean.TRUE.equals(t.get("defaultCarry"))).map(t->t.get("id")).toList();
    Map<String, Object> result = workspace.completeSprint(activeId,Map.of("confirmed",true,"fingerprint",preview.get("fingerprint"),"carryTaskIds",selections));
    assertEquals("completed", result.get("status"));
    assertTrue(((Number) result.get("carryoverCount")).intValue() >= 1);
    String oldBacklogId = (String) task.get("backlogId");
    assertTrue(workspace.backlog().stream().anyMatch(row -> oldBacklogId.equals(row.get("repeatOfId")) && "Ready".equals(row.get("state"))));
    assertEquals("undone", ((List<Map<String, Object>>) workspace.sprint(activeId).get("items")).stream()
        .filter(row -> task.get("id").equals(row.get("id"))).findFirst().orElseThrow().get("status"));
    assertEquals("Kapsam tamamlanmadı", ((List<Map<String, Object>>) workspace.sprint(activeId).get("items")).stream()
        .filter(row -> task.get("id").equals(row.get("id"))).findFirst().orElseThrow().get("statusNote"));
    assertEquals(0, workspace.backlog().stream().filter(row -> String.valueOf(row.get("externalId")).startsWith("BAU-AUTO:")
        && "Ready".equals(row.get("state"))).count());
  }

  @Test
  @Transactional
  void membersAssignmentsAndRetroAreEditableWithoutChangingHistoricalTasks() {
    String memberId = (String) workspace.createMember(Map.of("name", "Deneme Üye", "role", "developer", "engagement", "core")).get("id");
    String activeId = (String) workspace.sprints().stream().filter(row -> "active".equals(row.get("status"))).findFirst().orElseThrow().get("id");
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> tasks = (List<Map<String, Object>>) workspace.sprint(activeId).get("items");
    String taskId = (String) tasks.getFirst().get("id");
    workspace.replaceAssignments(taskId, Map.of("assignments", List.of(Map.of("memberId", memberId, "estimatedHours", 16))));
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> after = (List<Map<String, Object>>) workspace.sprint(activeId).get("items");
    assertEquals(memberId, ((List<Map<String, Object>>) after.stream().filter(row -> taskId.equals(row.get("id"))).findFirst().orElseThrow().get("assignments")).getFirst().get("memberId"));
    workspace.saveRetro(activeId, Map.of("workedWell", "İletişim", "improve", "Planlama", "actions", "Kapasiteyi gözden geçir"));
    assertEquals("İletişim", workspace.retro(activeId).get("workedWell"));
    workspace.setMemberActive(memberId, Map.of("active", false));
    workspace.replaceAssignments(taskId, Map.of("assignments", List.of(Map.of("memberId", memberId, "estimatedHours", 8))));
    String inactiveId = (String) workspace.createMember(Map.of("name", "Başka Geçmiş Üye")).get("id");
    workspace.setMemberActive(inactiveId, Map.of("active", false));
    assertThrows(IllegalArgumentException.class, () -> workspace.replaceAssignments(taskId,
        Map.of("assignments", List.of(Map.of("memberId", inactiveId, "estimatedHours", 8)))));
  }

  @Test
  @Transactional
  void calendarAndLeaveReduceSprintCapacityWithoutDoubleCountingTheSameDay() {
    String memberId = (String) workspace.createMember(Map.of("name", "Kapasite Test Üye")).get("id");
    String activeId = (String) workspace.sprints().stream().filter(row -> "active".equals(row.get("status"))).findFirst().orElseThrow().get("id");
    double before = ((Number) workspace.capacity(activeId).stream().filter(row -> memberId.equals(row.get("memberId")))
        .findFirst().orElseThrow().get("availableHours")).doubleValue();
    workspace.createNonWorkingDay(Map.of("date", "2026-09-01", "title", "Ekip günü", "memberId", memberId));
    assertThrows(IllegalArgumentException.class,()->workspace.createLeave(Map.of("leaveType","ANNUAL","memberId", memberId, "sprintId", activeId, "days", 1,
        "start", "2026-09-01", "end", "2026-09-01")));
    double overlapping = ((Number) workspace.capacity(activeId).stream().filter(row -> memberId.equals(row.get("memberId")))
        .findFirst().orElseThrow().get("availableHours")).doubleValue();
    assertEquals(before - 8, overlapping);
    workspace.createLeave(Map.of("leaveType","ANNUAL","memberId", memberId, "sprintId", activeId, "days", 1,
        "start", "2026-09-02", "end", "2026-09-02"));
    double after = ((Number) workspace.capacity(activeId).stream().filter(row -> memberId.equals(row.get("memberId")))
        .findFirst().orElseThrow().get("availableHours")).doubleValue();
    assertEquals(before - 16, after);
    workspace.createOvertimeEntry(Map.of("memberId", memberId, "sprintId", activeId, "plannedHours", 4,
        "earnedHours", 0, "usedHours", 0, "includeInCapacity", true));
    double withOvertime = ((Number) workspace.capacity(activeId).stream().filter(row -> memberId.equals(row.get("memberId")))
        .findFirst().orElseThrow().get("availableHours")).doubleValue();
    assertEquals(before - 12, withOvertime);
    workspace.createOvertimeEntry(Map.of("memberId", memberId, "sprintId", activeId, "plannedHours", 4,
        "earnedHours", 0, "usedHours", 0, "includeInCapacity", false));
    double excluded = ((Number) workspace.capacity(activeId).stream().filter(row -> memberId.equals(row.get("memberId")))
        .findFirst().orElseThrow().get("availableHours")).doubleValue();
    assertEquals(withOvertime, excluded);
  }

  @Test
  @Transactional
  void supportMembersUseExplicitSprintDaysAndXAssignmentsDoNotConsumeHours() {
    String supportId = (String) workspace.createMember(Map.of("name", "Şakir Test", "title", "Architect",
        "role", "Member", "teamRole", "ARCHITECT", "engagement", "SUPPORT", "joinedOn", "2026-08-25")).get("id");
    String coreId = (String) workspace.createMember(Map.of("name", "Core Test", "title", "Developer",
        "role", "Member", "teamRole", "DEVELOPER", "engagement", "CORE")).get("id");
    workspace.updateMember(supportId, Map.of("name", "Şakir", "title", "Solution Architect", "role", "Member",
        "teamRole", "ARCHITECT", "engagement", "SUPPORT", "joinedOn", "2026-08-25"));
    assertEquals("Şakir", workspace.team().stream().filter(row -> supportId.equals(row.get("id"))).findFirst().orElseThrow().get("name"));
    String activeId = (String) workspace.sprints().stream().filter(row -> "active".equals(row.get("status"))).findFirst().orElseThrow().get("id");
    Map<String, Object> initial = workspace.capacity(activeId).stream().filter(row -> supportId.equals(row.get("memberId"))).findFirst().orElseThrow();
    assertEquals(0.0, ((Number) initial.get("availableHours")).doubleValue());
    workspace.setSprintMemberAllocation(activeId, supportId, Map.of("allocatedDays", 5));
    Map<String, Object> allocated = workspace.capacity(activeId).stream().filter(row -> supportId.equals(row.get("memberId"))).findFirst().orElseThrow();
    assertEquals(5.0, ((Number) allocated.get("allocatedDays")).doubleValue());
    assertEquals(40.0, ((Number) allocated.get("availableHours")).doubleValue());
    workspace.createLeave(Map.of("leaveType","ANNUAL","memberId", supportId, "sprintId", activeId, "days", 1));
    Map<String, Object> afterLeave = workspace.capacity(activeId).stream().filter(row -> supportId.equals(row.get("memberId"))).findFirst().orElseThrow();
    assertEquals(32.0, ((Number) afterLeave.get("availableHours")).doubleValue());
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> tasks = (List<Map<String, Object>>) workspace.sprint(activeId).get("items");
    String taskId = (String) tasks.getFirst().get("id");
    workspace.replaceAssignments(taskId, Map.of("assignments", List.of(
        Map.of("memberId", coreId, "estimatedHours", 16, "supportOnly", false),
        Map.of("memberId", supportId, "estimatedHours", 0, "supportOnly", true))));
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> assignments = (List<Map<String, Object>>) ((List<Map<String, Object>>) workspace.sprint(activeId).get("items"))
        .stream().filter(row -> taskId.equals(row.get("id"))).findFirst().orElseThrow().get("assignments");
    assertEquals(2, assignments.size());
    assertTrue(assignments.stream().anyMatch(row -> supportId.equals(row.get("memberId")) && Boolean.TRUE.equals(row.get("supportOnly"))));
    assertEquals(0.0, ((Number) workspace.capacity(activeId).stream().filter(row -> supportId.equals(row.get("memberId")))
        .findFirst().orElseThrow().get("plannedHours")).doubleValue());
    assertThrows(IllegalArgumentException.class, () -> workspace.replaceAssignments(taskId,
        Map.of("assignments", List.of(Map.of("memberId", supportId, "estimatedHours", 4, "supportOnly", true)))));
  }
}
