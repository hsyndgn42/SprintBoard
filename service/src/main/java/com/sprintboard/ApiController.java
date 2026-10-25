package com.sprintboard;
import org.springframework.web.bind.annotation.DeleteMapping;

import java.util.Map;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ApiController {
  private final WorkspaceService workspace;
  private final BackupService backups;
  private final DefectService defects;
  private final TaskSubtypeService subtypes;
  private final RetroActionService retroActions;
  private final HolidayCalendarService holidays;
  private final MemberCapacityService memberCapacity;
  private final ParticipationService participation;

  public ApiController(WorkspaceService workspace, BackupService backups,DefectService defects,TaskSubtypeService subtypes,RetroActionService retroActions,HolidayCalendarService holidays,MemberCapacityService memberCapacity,ParticipationService participation) { this.workspace = workspace; this.backups = backups; this.defects=defects; this.subtypes=subtypes;this.retroActions=retroActions;this.holidays=holidays;this.memberCapacity=memberCapacity;this.participation=participation; }
  @PutMapping("/team/{id}/photo") public Object saveMemberPhoto(@PathVariable String id,@RequestBody Map<String,Object> input){return found(workspace.saveMemberPhoto(id,input));}
  @GetMapping("/sprints/{id}/review-team") public Object reviewTeam(@PathVariable String id){return found(workspace.reviewTeam(id));}
  @GetMapping("/team/{id}/participation") public Object participation(@PathVariable String id){return found(participation.read(id));}
  @PutMapping("/team/{id}/participation") public Object saveParticipation(@PathVariable String id,@RequestBody Map<String,Object> input){return found(participation.save(id,input));}
  @GetMapping("/team/{id}/capacity-policy") public Object memberCapacity(@PathVariable String id){return found(memberCapacity.read(id));}
  @PutMapping("/team/{id}/capacity-policy") public Object saveMemberCapacity(@PathVariable String id,@RequestBody Map<String,Object> input){return found(memberCapacity.save(id,input));}
  @PostMapping("/calendar/turkey-holidays/{year}") public Object importHolidays(@PathVariable int year){return holidays.importYear(year);}
  private ResponseEntity<?> found(Object value) {
    return value == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(value);
  }

@GetMapping("/health") public Map<String, Object> health() { return Map.of("status", "ok", "schemaVersion", 45, "backupSchemaVersion", 41); }
  @PutMapping("/sprints/{id}/flow") public ResponseEntity<?> configureFlow(@PathVariable String id,@RequestBody Map<String,Object> input){return found(workspace.configureFlow(id,input));}
  @PostMapping("/tasks/{id}/remove") public ResponseEntity<?> removeTask(@PathVariable String id,@RequestBody Map<String,Object> input){return found(workspace.removeTask(id,input));}
  @GetMapping("/reports/defect-reserves") public Object defectReserves(){return workspace.defectReserveReports();}
  @PutMapping("/tasks/{id}/reserve") public Object linkReserve(@PathVariable String id,@RequestBody Map<String,Object> input){return found(workspace.linkDefectReserve(id,input));}
  @PutMapping("/settings/work-schedule") public Object updateWorkSettings(@RequestBody Map<String,Object> input){return workspace.updateWorkSettings(input);}
  @GetMapping("/settings") public Map<String, Object> settings() { return workspace.settings(); }
  @GetMapping("/task-subtypes") public Object subtypes(){return subtypes.list();}
  @PostMapping("/task-subtypes") public ResponseEntity<?> createSubtype(@RequestBody Map<String,Object> input){return ResponseEntity.status(201).body(subtypes.create(input));}
  @PutMapping("/task-subtypes/{code}") public ResponseEntity<?> updateSubtype(@PathVariable String code,@RequestBody Map<String,Object> input){return found(subtypes.setActive(code,input));}
  @GetMapping("/bau-templates") public Object bauTemplates() { return workspace.bauTemplates(); }
  @PostMapping("/bau-templates") public ResponseEntity<?> createBauTemplate(@RequestBody Map<String, Object> input) {
    return ResponseEntity.status(201).body(workspace.createBauTemplate(input));
  }
  @PutMapping("/bau-templates/{id}") public ResponseEntity<?> updateBauTemplate(@PathVariable String id, @RequestBody Map<String, Object> input) {
    return found(workspace.updateBauTemplate(id, input));
  }
  @PutMapping("/settings") public Map<String, Object> updateSettings(@RequestBody Map<String, Object> input) { return workspace.updateSettings(input); }
  @GetMapping("/overview") public Map<String, Object> overview() { return workspace.overview(); }
  @GetMapping("/sprints") public Object sprints() { return workspace.sprints(); }
  @GetMapping("/sprints/{id}") public ResponseEntity<?> sprint(@PathVariable String id) { return found(workspace.sprint(id)); }
  @GetMapping("/roadmap") public Object roadmap() { return workspace.roadmap(); }
  @PutMapping("/roadmap/{id}") public ResponseEntity<?> updateRoadmap(@PathVariable String id,@RequestBody Map<String,Object> input){return found(workspace.updateRoadmap(id,input));}
  @GetMapping("/reports/roadmap") public Object roadmapReports(){return workspace.roadmapReports();}
  @GetMapping("/backlog") public Object backlog() { return workspace.backlog(); }
  @GetMapping("/backlog/{id}/readiness") public ResponseEntity<?> readiness(@PathVariable String id) { return found(workspace.readiness(id)); }
  @GetMapping("/team") public Object team() { return workspace.team(); }
  @GetMapping("/sprints/{id}/retro") public ResponseEntity<?> retro(@PathVariable String id) { return found(workspace.retro(id)); }
  @GetMapping("/sprints/{sprint}/retro/actions") public ResponseEntity<?> retroActions(@PathVariable String sprint){return found(retroActions.list(sprint));}
  @PostMapping("/sprints/{sprint}/retro/actions") public ResponseEntity<?> createRetroAction(@PathVariable String sprint,@RequestBody Map<String,Object> input){var result=retroActions.create(sprint,input);return result==null?ResponseEntity.notFound().build():ResponseEntity.status(201).body(result);}
  @PutMapping("/sprints/{sprint}/retro/actions/{id}") public ResponseEntity<?> updateRetroAction(@PathVariable String sprint,@PathVariable String id,@RequestBody Map<String,Object> input){return found(retroActions.update(sprint,id,input));}
  @PostMapping("/sprints/{sprint}/retro/actions/{id}/backlog") public ResponseEntity<?> retroBacklog(@PathVariable String sprint,@PathVariable String id,@RequestBody Map<String,Object> input){return found(retroActions.createBacklog(sprint,id,input));}
  @GetMapping("/leaves") public Object leaves() { return workspace.leaves(); }
  @GetMapping("/calendar") public Object calendar() { return workspace.calendar(); }
  @GetMapping("/sprints/{id}/capacity") public ResponseEntity<?> capacity(@PathVariable String id) { return found(workspace.capacity(id)); }
  @GetMapping("/overtime") public Object overtime() { return workspace.overtime(); }
  @GetMapping("/overtime/entries") public Object overtimeEntries() { return workspace.overtimeEntries(); }
  @PutMapping("/overtime/entries/{id}/plan") public ResponseEntity<?> updateOvertimePlan(@PathVariable String id,@RequestBody Map<String,Object> input){return found(workspace.changeOvertimePlan(id,input,false));}
  @DeleteMapping("/overtime/entries/{id}/plan") public ResponseEntity<?> removeOvertimePlan(@PathVariable String id,@RequestBody Map<String,Object> input){return found(workspace.changeOvertimePlan(id,input,true));}
  @GetMapping("/reports") public Object reports() { return workspace.reports(); }
  @GetMapping("/reports/members") public Object memberReports() { return workspace.memberReports(); }
  @GetMapping("/reports/work-types") public Object workTypeReports() { return workspace.workTypeReports(); }
  @GetMapping("/reports/defects") public Object defectReports(){return workspace.defectReports();}
  @GetMapping("/reports/defect-trend") public Object defectTrend(){return workspace.defectTrend();}
  @PutMapping("/backlog/{id}/defect") public ResponseEntity<?> saveDefect(@PathVariable String id,@RequestBody Map<String,Object> input){return found(defects.save(id,input));}
  @GetMapping("/export") public ResponseEntity<?> export() {
    return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON)
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"sprintboard-backup.json\"")
        .body(backups.exportData());
  }
  @PostMapping("/admin/backups/preview") public Object previewBackup(@RequestBody JsonNode input) { return backups.preview(input); }
  @PostMapping("/admin/backups/restore") public Object restoreBackup(@RequestBody JsonNode input) { return backups.restore(input); }
  @PostMapping("/roadmap") public ResponseEntity<?> createRoadmap(@RequestBody Map<String, Object> input) {
    return ResponseEntity.status(201).body(workspace.createRoadmap(input));
  }
  @PutMapping("/sprints/{id}/retro") public ResponseEntity<?> saveRetro(@PathVariable String id, @RequestBody Map<String, Object> input) {
    return found(workspace.saveRetro(id, input));
  }
  @PostMapping("/team") public ResponseEntity<?> createMember(@RequestBody Map<String, Object> input) {
    return ResponseEntity.status(201).body(workspace.createMember(input));
  }
  @PutMapping("/team/{id}") public ResponseEntity<?> updateMember(@PathVariable String id, @RequestBody Map<String, Object> input) {
    return found(workspace.updateMember(id, input));
  }
  @PostMapping("/leaves") public ResponseEntity<?> createLeave(@RequestBody Map<String, Object> input) {
    return ResponseEntity.status(201).body(workspace.createLeave(input));
  }
  @PutMapping("/leaves/{id}") public ResponseEntity<?> updateLeave(@PathVariable String id,@RequestBody Map<String,Object> input){return found(workspace.updateLeave(id,input));}
  @GetMapping("/overtime/balances") public Object overtimeBalances(){return workspace.overtimeBalances();}
  @PostMapping("/calendar") public ResponseEntity<?> createNonWorkingDay(@RequestBody Map<String, Object> input) {
    return ResponseEntity.status(201).body(workspace.createNonWorkingDay(input));
  }
  @PostMapping("/overtime/entries") public ResponseEntity<?> createOvertimeEntry(@RequestBody Map<String, Object> input) {
    return ResponseEntity.status(201).body(workspace.createOvertimeEntry(input));
  }
  @PatchMapping("/team/{id}") public ResponseEntity<?> setMemberActive(@PathVariable String id, @RequestBody Map<String, Object> input) {
    return found(workspace.setMemberActive(id, input));
  }
  @PutMapping("/sprints/{id}/capacity/{memberId}") public ResponseEntity<?> setSprintMemberAllocation(
      @PathVariable String id, @PathVariable String memberId, @RequestBody Map<String, Object> input) {
    return found(workspace.setSprintMemberAllocation(id, memberId, input));
  }
  @PutMapping("/tasks/{id}/assignments") public ResponseEntity<?> replaceAssignments(@PathVariable String id, @RequestBody Map<String, Object> input) {
    return found(workspace.replaceAssignments(id, input));
  }
  @PostMapping("/backlog") public ResponseEntity<?> createBacklog(@RequestBody Map<String, Object> input) {
    return ResponseEntity.status(201).body(workspace.createBacklog(input));
  }
  @PatchMapping("/backlog/{id}") public ResponseEntity<?> linkBacklog(@PathVariable String id, @RequestBody Map<String, Object> input) {
    return found(workspace.linkBacklog(id, input));
  }
  @PutMapping("/backlog/{id}") public ResponseEntity<?> editBacklog(@PathVariable String id, @RequestBody Map<String,Object> input) { return found(workspace.editBacklog(id,input)); }
  @PostMapping("/backlog/{id}/repeat") public ResponseEntity<?> repeatBacklog(@PathVariable String id, @RequestBody(required = false) Map<String, Object> input) {
    Object result = workspace.repeatBacklog(id, input == null ? Map.of() : input);
    return result == null ? ResponseEntity.notFound().build() : ResponseEntity.status(201).body(result);
  }
  @PostMapping("/sprints") public ResponseEntity<?> createSprint(@RequestBody Map<String, Object> input) {
    return ResponseEntity.status(201).body(workspace.createSprint(input));
  }
  @PostMapping("/sprints/{id}/start") public ResponseEntity<?> startSprint(@PathVariable String id) { return found(workspace.startSprint(id)); }
  @PutMapping("/sprints/{id}") public ResponseEntity<?> updateSprint(@PathVariable String id,@RequestBody Map<String,Object> input) { return found(workspace.updateSprint(id,input)); }
  @PostMapping("/sprints/{id}/tasks/new") public ResponseEntity<?> createSprintTask(@PathVariable String id,@RequestBody Map<String,Object> input){return found(workspace.createSprintTask(id,input));}
  @GetMapping("/reports/scope") public Object scopeReport(){return workspace.sprints().stream().map(s->workspace.sprint(s.get("id").toString())).toList();}
  @PostMapping("/sprints/{id}/tasks") public ResponseEntity<?> addTask(@PathVariable String id, @RequestBody Map<String, Object> input) {
    Object result = workspace.addTask(id, input);
    return result == null ? ResponseEntity.notFound().build() : ResponseEntity.status(201).body(result);
  }
  @PutMapping("/tasks/{id}/title") public Object renameTask(@PathVariable String id,@RequestBody Map<String,Object> input){return found(workspace.renameTask(id,input));}
  @PostMapping("/backlog/{id}/delete") public Object deleteBacklog(@PathVariable String id,@RequestBody Map<String,Object> input){return found(workspace.deleteBacklog(id,input));}
  @PatchMapping("/tasks/{id}") public ResponseEntity<?> updateTask(@PathVariable String id, @RequestBody Map<String, Object> input) {
    return found(workspace.updateTask(id, input));
  }
  @GetMapping("/sprints/{id}/closure-preview") public ResponseEntity<?> closurePreview(@PathVariable String id) { return found(workspace.closurePreview(id)); }
  @PostMapping("/sprints/{id}/complete") public ResponseEntity<?> completeSprint(@PathVariable String id,@RequestBody Map<String,Object> input) {
    return found(workspace.completeSprint(id,input));
  }
}
