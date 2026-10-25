package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties="spring.datasource.url=jdbc:h2:mem:backuptest;DB_CLOSE_DELAY=-1")
@org.junit.jupiter.api.Tag("historical")
@org.springframework.test.context.ActiveProfiles("historical-tests")
class BackupServiceTest {
  @TempDir static Path folder;
  @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) { registry.add("sprintboard.backup-directory", () -> folder.toString()); }
  @Autowired BackupService backups;
  @Autowired WorkspaceService workspace;
  @Autowired ObjectMapper mapper;
  @Autowired JdbcTemplate jdbc;
  @Autowired TaskSubtypeService subtypes;
  @Autowired RetroActionService retroActions;
  @Autowired ReviewNoteService reviewNotes;
  @Test @Transactional void v37OvertimeEntryUpgradesWithoutInventingTask(){
    workspace.createOvertimeEntry(Map.of("memberId","legacy-member-isa","sprintId",jdbc.queryForObject("SELECT id FROM sprint ORDER BY number FETCH FIRST ROW ONLY",String.class),"earnedHours",2));
    ObjectNode old=mapper.valueToTree(backups.exportData());old.put("schemaVersion",37);BackupFixtureV41.removeMatching(old);
    for(String table:java.util.List.of("overtime_entry","overtime_request"))old.path("tables").path(table).forEach(r->((ObjectNode)r).remove(java.util.List.of("task_id","task_title","roadmap_id","roadmap_title")));
    backups.restore(request(old,backups.preview(old)));
    assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM overtime_entry WHERE task_id IS NOT NULL",Integer.class));
    assertTrue(jdbc.queryForObject("SELECT SUM(earned_hours) FROM overtime_entry",Double.class)>=2);
  }
  private void removeFlow(ObjectNode backup){for(String table:java.util.List.of("sprint_flow","task_blocker","sprint_scope_event"))((ObjectNode)backup.path("tables")).remove(table);}

  @Test @Transactional void satEnvironmentRoundTripAndV33BackupCompatibility(){
    ObjectNode old=mapper.valueToTree(backups.exportData());old.put("schemaVersion",33);BackupFixtureV41.removeMatching(old);assertNotNull(backups.preview(old));
    String id=workspace.createBacklog(Map.of("title","SAT test","size","SMALL","taskCategory","DEFECT","taskSubtype","TEST_DEFECT","defect",Map.of("severity","HIGH","environment","SAT","verification","NOT_CHECKED"))).get("id").toString();
    assertTrue(workspace.defectReports().stream().anyMatch(r->id.equals(r.get("id"))&&"SAT".equals(((Map<?,?>)r.get("defect")).get("environment"))));
    ObjectNode current=mapper.valueToTree(backups.exportData());assertEquals(41,current.path("schemaVersion").asInt());
    var preview=backups.preview(current);backups.restore(request(current,preview));assertEquals("SAT",jdbc.queryForObject("SELECT environment FROM defect_detail WHERE backlog_id=?",String.class,id));
  }

  @Test @Transactional
  void reviewNotesRoundTripAndOldBackupRestoresNoInventedMeeting() {
    ObjectNode old=mapper.valueToTree(backups.exportData());removeFlow(old);old.path("tables").path("leave_record").forEach(r->{((ObjectNode)r).remove("overtime_hours");((ObjectNode)r).remove("overtime_accounting");});((ObjectNode)old.path("tables")).remove("member_photo");old.put("schemaVersion",19);BackupFixtureV41.removeMatching(old);((ObjectNode)old.path("tables")).remove(java.util.List.of("task_activity","overtime_request","leave_request","defect_reserve_link"));((ObjectNode)old.path("tables")).remove("member_participation");((ObjectNode)old.path("tables")).remove("sprint_member_presence");((ObjectNode)old.path("tables")).remove("member_capacity_policy");((ObjectNode)old.path("tables")).remove("sprint_member_policy");((ObjectNode)old.path("tables")).remove("sprint_review_note");
    reviewNotes.save("legacy-sprint-13",Map.of("version",0,"demoNotes","Demo","stakeholderFeedback","Feedback","decisions","Decision","nextSteps","Next"),"admin");
    ObjectNode snapshot=mapper.valueToTree(backups.exportData());var expected=reviewNotes.get("legacy-sprint-13");
    backups.restore(request(old,backups.preview(old)));assertEquals(0,reviewNotes.get("legacy-sprint-13").version());
    backups.restore(request(snapshot,backups.preview(snapshot)));assertEquals(expected,reviewNotes.get("legacy-sprint-13"));
    var preview=backups.preview(snapshot);reviewNotes.save("legacy-sprint-13",Map.of("version",1,"demoNotes","Changed","stakeholderFeedback","","decisions","","nextSteps",""),"admin");
    assertThrows(IllegalArgumentException.class,()->backups.restore(request(snapshot,preview)));
    assertEquals("Changed",reviewNotes.get("legacy-sprint-13").demoNotes());
  }

  @Test @Transactional
  void companyLeaveRoundTripsAndVersionSixteenDoesNotInventEntitlementRules() {
    ObjectNode current=mapper.valueToTree(backups.exportData());
    assertEquals(41, current.path("schemaVersion").asInt());
    ObjectNode old=current.deepCopy();((ObjectNode)old.path("tables")).remove("sprint_review_note");removeFlow(old);old.path("tables").path("leave_record").forEach(r->{((ObjectNode)r).remove("overtime_hours");((ObjectNode)r).remove("overtime_accounting");});((ObjectNode)old.path("tables")).remove("member_photo");old.put("schemaVersion",16);BackupFixtureV41.removeMatching(old);((ObjectNode)old.path("tables")).remove(java.util.List.of("task_activity","overtime_request","leave_request","defect_reserve_link"));((ObjectNode)old.path("tables")).remove("member_participation");((ObjectNode)old.path("tables")).remove("sprint_member_presence");((ObjectNode)old.path("tables")).remove("member_capacity_policy");((ObjectNode)old.path("tables")).remove("sprint_member_policy");
    old.path("tables").path("leave_record").forEach(row->((ObjectNode)row).remove("leave_type"));
    backups.restore(request(old,backups.preview(old)));
    assertTrue(workspace.leaves().stream().allMatch(r->"UNSPECIFIED".equals(r.get("entitlementEffect"))));
    backups.restore(request(current,backups.preview(current)));
    assertEquals(7,workspace.leaves().stream().filter(r->"COMPANY_GRANTED".equals(r.get("leaveType"))&&"NONE".equals(r.get("entitlementEffect"))).count());
    assertEquals(current.path("tables").path("overtime_snapshot"),mapper.valueToTree(backups.exportData()).path("tables").path("overtime_snapshot"));
    ObjectNode invalid=current.deepCopy();((ObjectNode)invalid.path("tables").path("leave_record").get(0)).put("leave_type","INVALID");
    assertThrows(IllegalArgumentException.class,()->backups.preview(invalid));
  }
  private ObjectNode request(ObjectNode snapshot, Map<String,Object> preview) {
    ObjectNode body=mapper.createObjectNode(); body.set("backup",snapshot);
    body.put("confirmation","GERİ YÜKLE"); body.put("currentFingerprint",preview.get("currentFingerprint").toString()); body.put("backupFingerprint",preview.get("backupFingerprint").toString()); return body;
  }
  @Test @Transactional
  void roundTripsEveryTableAndSettingsAndWritesRecoverableSafetyBackup() throws Exception {
    jdbc.update("INSERT INTO login_throttle(bucket_key,attempt_count,expires_at,revision) VALUES('A:restore-test',5,9999999999999,5)");
    jdbc.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES(CURRENT_TIMESTAMP,'authentication','restore-test','LOGIN_FAILURE','{}')");
    String parent=workspace.createBacklog(Map.of("title","Parent","size","SMALL")).get("id").toString();
    workspace.createBacklog(Map.of("title","Child","size","SMALL","priority","HIGH","ownerId","legacy-member-akin","dependencyIds",java.util.List.of(parent)));
    ObjectNode snapshot=mapper.valueToTree(backups.exportData());
    assertEquals(33,snapshot.path("tables").size());
    assertFalse(snapshot.path("tables").has("app_user"));
    assertFalse(snapshot.path("tables").has("audit_event"));
    String initial=jdbc.queryForObject("SELECT name FROM member WHERE id='legacy-member-akin'",String.class);
    jdbc.update("UPDATE member SET name='Edited after backup' WHERE id='legacy-member-akin'");
    workspace.updateSettings(Map.of("estimationMode","POINTS_AND_HOURS"));
    Map<String,Object> preview=backups.preview(snapshot);
    Map<String,Object> applied=backups.restore(request(snapshot,preview));
    assertFalse(snapshot.path("tables").has("login_throttle"));
    assertEquals(5,jdbc.queryForObject("SELECT attempt_count FROM login_throttle WHERE bucket_key='A:restore-test'",Integer.class));
    assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM audit_event WHERE entity_type='authentication' AND entity_id='restore-test'",Integer.class));
    assertEquals(initial,jdbc.queryForObject("SELECT name FROM member WHERE id='legacy-member-akin'",String.class));
    assertEquals("SIZE_AND_HOURS",workspace.settings().get("estimationMode"));
    ObjectNode after=mapper.valueToTree(backups.exportData());
    var keys=snapshot.path("tables").fieldNames();
    while(keys.hasNext()) { String table=keys.next(); if (!table.equals("product_setting")) assertEquals(snapshot.path("tables").get(table),after.path("tables").get(table),table); }
    Path safety=folder.resolve(applied.get("safetyBackup").toString());
    assertTrue(Files.exists(safety));
    ObjectNode safetySnapshot=(ObjectNode)mapper.readTree(Files.readAllBytes(safety));
    backups.restore(request(safetySnapshot,backups.preview(safetySnapshot)));
    assertEquals("Edited after backup",jdbc.queryForObject("SELECT name FROM member WHERE id='legacy-member-akin'",String.class));
    assertEquals("POINTS_AND_HOURS",workspace.settings().get("estimationMode"));
  }
  @Test @Transactional
  void importsVersionElevenWithoutInventingMetadataAndRejectsCycles() {
    ObjectNode old=mapper.valueToTree(backups.exportData());old.path("tables").path("leave_record").forEach(row->((ObjectNode)row).remove("leave_type"));((ObjectNode)old.path("tables")).remove("retro_action"); ((ObjectNode)old.path("tables")).remove("task_subtype");((ObjectNode)old.path("tables")).remove("sprint_review_note");removeFlow(old);old.path("tables").path("leave_record").forEach(r->{((ObjectNode)r).remove("overtime_hours");((ObjectNode)r).remove("overtime_accounting");});((ObjectNode)old.path("tables")).remove("member_photo");old.put("schemaVersion",11);BackupFixtureV41.removeMatching(old);((ObjectNode)old.path("tables")).remove(java.util.List.of("task_activity","overtime_request","leave_request","defect_reserve_link"));((ObjectNode)old.path("tables")).remove("member_participation");((ObjectNode)old.path("tables")).remove("sprint_member_presence");((ObjectNode)old.path("tables")).remove("member_capacity_policy");((ObjectNode)old.path("tables")).remove("sprint_member_policy");
    ((ObjectNode)old.path("tables")).remove("backlog_dependency");
    ((ObjectNode)old.path("tables")).remove("sprint_closure");
    ((ObjectNode)old.path("tables")).remove("defect_detail");
    old.path("tables").path("backlog_item").forEach(row->{((ObjectNode)row).remove("priority");((ObjectNode)row).remove("owner_id");});
    backups.restore(request(old,backups.preview(old)));
    assertTrue(workspace.backlog().stream().allMatch(b->"UNSET".equals(b.get("priority")) && b.get("ownerId")==null));
    ObjectNode cyclic=mapper.valueToTree(backups.exportData());
    var rows=cyclic.path("tables").path("backlog_item");String a=rows.get(0).path("id").asText(),b=rows.get(1).path("id").asText();
    var deps=(com.fasterxml.jackson.databind.node.ArrayNode)cyclic.path("tables").path("backlog_dependency");
    deps.addObject().put("backlog_id",a).put("depends_on_id",b);deps.addObject().put("backlog_id",b).put("depends_on_id",a);
    assertThrows(IllegalArgumentException.class,()->backups.preview(cyclic));
  }
  @Test @Transactional
  void closureSnapshotsSurviveBackupRestoreAndOldVersionHasNoInventedClosure() {
    ObjectNode old=mapper.valueToTree(backups.exportData());old.path("tables").path("leave_record").forEach(row->((ObjectNode)row).remove("leave_type"));((ObjectNode)old.path("tables")).remove("retro_action");((ObjectNode)old.path("tables")).remove("task_subtype");((ObjectNode)old.path("tables")).remove("sprint_review_note");removeFlow(old);old.path("tables").path("leave_record").forEach(r->{((ObjectNode)r).remove("overtime_hours");((ObjectNode)r).remove("overtime_accounting");});((ObjectNode)old.path("tables")).remove("member_photo");old.put("schemaVersion",12);BackupFixtureV41.removeMatching(old);((ObjectNode)old.path("tables")).remove(java.util.List.of("task_activity","overtime_request","leave_request","defect_reserve_link"));((ObjectNode)old.path("tables")).remove("member_participation");((ObjectNode)old.path("tables")).remove("sprint_member_presence");((ObjectNode)old.path("tables")).remove("member_capacity_policy");((ObjectNode)old.path("tables")).remove("sprint_member_policy");((ObjectNode)old.path("tables")).remove("sprint_closure");((ObjectNode)old.path("tables")).remove("defect_detail");
    backups.preview(old);
    var preview=workspace.closurePreview("legacy-sprint-14");
    workspace.completeSprint("legacy-sprint-14",Map.of("confirmed",true,"fingerprint",preview.get("fingerprint"),"carryTaskIds",java.util.List.of()));
    var closed=mapper.valueToTree(workspace.sprint("legacy-sprint-14"));
    ObjectNode snapshot=mapper.valueToTree(backups.exportData());
    backups.restore(request(old,backups.preview(old)));
    assertEquals("active",workspace.sprint("legacy-sprint-14").get("status"));
    backups.restore(request(snapshot,backups.preview(snapshot)));
    assertEquals(closed,mapper.valueToTree(workspace.sprint("legacy-sprint-14")));
    ObjectNode broken=snapshot.deepCopy();((ObjectNode)broken.path("tables").path("sprint_closure").get(0)).put("payload_json","{}");
    assertThrows(IllegalArgumentException.class,()->backups.preview(broken));
  }
  @Test @Transactional
  void defectDetailsRoundTripAndVersionThirteenStartsEmpty() {
    ObjectNode old=mapper.valueToTree(backups.exportData());old.path("tables").path("leave_record").forEach(row->((ObjectNode)row).remove("leave_type"));((ObjectNode)old.path("tables")).remove("retro_action");((ObjectNode)old.path("tables")).remove("task_subtype");((ObjectNode)old.path("tables")).remove("sprint_review_note");removeFlow(old);old.path("tables").path("leave_record").forEach(r->{((ObjectNode)r).remove("overtime_hours");((ObjectNode)r).remove("overtime_accounting");});((ObjectNode)old.path("tables")).remove("member_photo");old.put("schemaVersion",13);BackupFixtureV41.removeMatching(old);((ObjectNode)old.path("tables")).remove(java.util.List.of("task_activity","overtime_request","leave_request","defect_reserve_link"));((ObjectNode)old.path("tables")).remove("member_participation");((ObjectNode)old.path("tables")).remove("sprint_member_presence");((ObjectNode)old.path("tables")).remove("member_capacity_policy");((ObjectNode)old.path("tables")).remove("sprint_member_policy");((ObjectNode)old.path("tables")).remove("defect_detail");
    workspace.createBacklog(Map.of("title","Backup defect","size","SMALL","taskCategory","DEFECT","taskSubtype","TEST_DEFECT","defect",Map.of("severity","CRITICAL","environment","UAT","verification","PASSED","verificationNote","Checked")));
    ObjectNode snapshot=mapper.valueToTree(backups.exportData());
    backups.restore(request(old,backups.preview(old)));assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM defect_detail",Integer.class));
    backups.restore(request(snapshot,backups.preview(snapshot)));assertEquals("PASSED",jdbc.queryForObject("SELECT verification FROM defect_detail",String.class));
    ObjectNode broken=snapshot.deepCopy();((ObjectNode)broken.path("tables").path("defect_detail").get(0)).put("severity","INVALID");
    assertThrows(IllegalArgumentException.class,()->backups.preview(broken));
  }
  @Test @Transactional
  void catalogRoundTripsAndVersionFourteenUpgradesWithoutLosingLegacyLabels() {
    ObjectNode old=mapper.valueToTree(backups.exportData());old.path("tables").path("leave_record").forEach(row->((ObjectNode)row).remove("leave_type"));((ObjectNode)old.path("tables")).remove("retro_action");((ObjectNode)old.path("tables")).remove("sprint_review_note");removeFlow(old);old.path("tables").path("leave_record").forEach(r->{((ObjectNode)r).remove("overtime_hours");((ObjectNode)r).remove("overtime_accounting");});((ObjectNode)old.path("tables")).remove("member_photo");old.put("schemaVersion",14);BackupFixtureV41.removeMatching(old);((ObjectNode)old.path("tables")).remove(java.util.List.of("task_activity","overtime_request","leave_request","defect_reserve_link"));((ObjectNode)old.path("tables")).remove("member_participation");((ObjectNode)old.path("tables")).remove("sprint_member_presence");((ObjectNode)old.path("tables")).remove("member_capacity_policy");((ObjectNode)old.path("tables")).remove("sprint_member_policy");((ObjectNode)old.path("tables")).remove("task_subtype");
    String code=subtypes.create(Map.of("category","DEV","label","Integration")).get("code").toString();
    workspace.createBacklog(Map.of("title","Integration work","size","SMALL","taskCategory","DEV","taskSubtype",code));
    subtypes.setActive(code,Map.of("active",false));
    ObjectNode snapshot=mapper.valueToTree(backups.exportData());
    backups.restore(request(old,backups.preview(old)));
    assertEquals(13,subtypes.list().size());
    backups.restore(request(snapshot,backups.preview(snapshot)));
    assertEquals(snapshot.path("tables").path("task_subtype"),mapper.valueToTree(backups.exportData()).path("tables").path("task_subtype"));
    ObjectNode broken=snapshot.deepCopy();((ObjectNode)broken.path("tables").path("task_subtype").get(0)).put("label","Tampered label");
    // Missing a built-in semantic record is rejected before the existing workspace is touched.
    ((com.fasterxml.jackson.databind.node.ArrayNode)broken.path("tables").path("task_subtype")).removeAll();
    assertThrows(IllegalArgumentException.class,()->backups.preview(broken));
    ObjectNode mismatched=snapshot.deepCopy();
    for(var row:mismatched.path("tables").path("backlog_item"))if(code.equals(row.path("task_subtype").asText()))((ObjectNode)row).put("task_category","TEST");
    assertThrows(IllegalArgumentException.class,()->backups.preview(mismatched));
  }
  @Test @Transactional
  void retroActionsRoundTripAndOlderBackupsKeepFreeTextWithoutInventingOwners() {
    workspace.saveRetro("legacy-sprint-13",Map.of("actions","Original historical notes"));
    ObjectNode old=mapper.valueToTree(backups.exportData());old.path("tables").path("leave_record").forEach(row->((ObjectNode)row).remove("leave_type"));((ObjectNode)old.path("tables")).remove("sprint_review_note");removeFlow(old);old.path("tables").path("leave_record").forEach(r->{((ObjectNode)r).remove("overtime_hours");((ObjectNode)r).remove("overtime_accounting");});((ObjectNode)old.path("tables")).remove("member_photo");old.put("schemaVersion",15);BackupFixtureV41.removeMatching(old);((ObjectNode)old.path("tables")).remove(java.util.List.of("task_activity","overtime_request","leave_request","defect_reserve_link"));((ObjectNode)old.path("tables")).remove("member_participation");((ObjectNode)old.path("tables")).remove("sprint_member_presence");((ObjectNode)old.path("tables")).remove("member_capacity_policy");((ObjectNode)old.path("tables")).remove("sprint_member_policy");((ObjectNode)old.path("tables")).remove("retro_action");
    var action=retroActions.create("legacy-sprint-13",Map.of("title","Retro backup","status","OPEN","dueDate","2026-09-30","ownerId","legacy-member-akin"));
    retroActions.createBacklog("legacy-sprint-13",action.get("id").toString(),Map.of("version",0,"size","SMALL","taskCategory","DEV"));
    ObjectNode snapshot=mapper.valueToTree(backups.exportData());
    backups.restore(request(old,backups.preview(old)));
    assertTrue(retroActions.list("legacy-sprint-13").isEmpty());
    assertEquals("Original historical notes",workspace.retro("legacy-sprint-13").get("actions"));
    backups.restore(request(snapshot,backups.preview(snapshot)));
    assertEquals(snapshot.path("tables").path("retro_action"),mapper.valueToTree(backups.exportData()).path("tables").path("retro_action"));
    ObjectNode broken=snapshot.deepCopy();((ObjectNode)broken.path("tables").path("retro_action").get(0)).put("owner_id","missing");
    assertThrows(IllegalArgumentException.class,()->backups.preview(broken));
    ObjectNode invalid=snapshot.deepCopy();((ObjectNode)invalid.path("tables").path("retro_action").get(0)).put("status","INVALID");
    assertThrows(IllegalArgumentException.class,()->backups.preview(invalid));
  }
  @Test @Transactional
  void rejectsStalePreviewAndChangedFileWithoutOverwritingCurrentData() {
    ObjectNode snapshot=mapper.valueToTree(backups.exportData());
    Map<String,Object> preview=backups.preview(snapshot);
    jdbc.update("UPDATE member SET title='Keep latest' WHERE id='legacy-member-akin'");
    assertThrows(IllegalArgumentException.class,()->backups.restore(request(snapshot,preview)));
    assertEquals("Keep latest",jdbc.queryForObject("SELECT title FROM member WHERE id='legacy-member-akin'",String.class));
    ObjectNode changed=snapshot.deepCopy(); changed.put("exportedAt","changed");
    assertThrows(IllegalArgumentException.class,()->backups.restore(request(changed,preview)));
  }
  @Test @Transactional
  void rejectsMalformedVersionsColumnsAndBrokenRelationshipsBeforeMutation() {
    ObjectNode original=mapper.valueToTree(backups.exportData());
    ObjectNode wrong=original.deepCopy(); wrong.put("schemaVersion",99);
    assertThrows(IllegalArgumentException.class,()->backups.preview(wrong));
    ObjectNode missing=original.deepCopy(); ((ObjectNode)missing.path("tables")).remove("assignment");
    assertThrows(IllegalArgumentException.class,()->backups.preview(missing));
    ObjectNode invalid=original.deepCopy(); ((ObjectNode)invalid.path("tables").path("assignment").get(0)).put("member_id","does-not-exist");
    assertThrows(IllegalArgumentException.class,()->backups.preview(invalid));
    assertEquals(original.path("tables"),mapper.valueToTree(backups.exportData()).path("tables"));
    assertThrows(IllegalArgumentException.class,()->backups.restore(mapper.createObjectNode()));
  }
}
