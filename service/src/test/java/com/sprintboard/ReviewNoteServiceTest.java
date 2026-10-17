package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@org.junit.jupiter.api.Tag("historical")
@org.springframework.test.context.ActiveProfiles("historical-tests")
@SpringBootTest(properties="spring.datasource.url=jdbc:h2:mem:reviewnotes;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
@Transactional
class ReviewNoteServiceTest {
  @Autowired ReviewNoteService notes;
  @Autowired WorkspaceService workspace;
  @Autowired BackupService backups;
  @Autowired ObjectMapper mapper;
  @Autowired JdbcTemplate jdbc;
  @Autowired MockMvc mvc;
  final String id="legacy-sprint-14";
  Map<String,Object> draft(int version){return new HashMap<>(Map.of("version",version,"demoNotes","Demo <script>literal</script>\nSecond line","stakeholderFeedback","Paydaş görüşü","decisions","Karar","nextSteps","Sonraki adım"));}
  @Test @Transactional(propagation=org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
  void simultaneousFirstSavesCannotOverwriteEachOther() throws Exception {
    String sprint="legacy-sprint-13";var start=new java.util.concurrent.CountDownLatch(1);
    try(var pool=java.util.concurrent.Executors.newFixedThreadPool(2)){
      java.util.concurrent.Callable<Boolean> write=()->{start.await();try{notes.save(sprint,draft(0),"admin");return true;}catch(IllegalArgumentException expected){return false;}};
      var first=pool.submit(write);var second=pool.submit(write);start.countDown();
      assertNotEquals(first.get(10,java.util.concurrent.TimeUnit.SECONDS),second.get(10,java.util.concurrent.TimeUnit.SECONDS));assertEquals(1,notes.get(sprint).version());
    }finally{jdbc.update("DELETE FROM sprint_review_note WHERE sprint_id=?",sprint);jdbc.update("DELETE FROM audit_event WHERE entity_type='review-note' AND entity_id=?",sprint);}
  }
  @Test void readDoesNotCreateAndUnknownSprintIsNotFound(){assertEquals(0,notes.get(id).version());assertNull(notes.get("missing"));assertNull(notes.save("missing",draft(0),"admin"));assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM sprint_review_note",Integer.class));}
  @Test void savesVersionsAndRejectsStaleFirstAndLaterWriters(){
    var saved=notes.save(id,draft(0),"admin");assertEquals(1,saved.version());assertEquals("admin",saved.updatedBy());assertNotNull(saved.updatedAt());
    assertThrows(IllegalArgumentException.class,()->notes.save(id,draft(0),"other"));
    var edit=draft(1);edit.put("demoNotes","Updated");assertEquals(2,notes.save(id,edit,"other").version());
    assertThrows(IllegalArgumentException.class,()->notes.save(id,draft(1),"admin"));assertEquals("Updated",notes.get(id).demoNotes());
    assertEquals(2,jdbc.queryForObject("SELECT COUNT(*) FROM audit_event WHERE entity_type='review-note'",Integer.class));
  }
  @Test void validatesFullPayloadAndAllowsExplicitClearing(){
    for(Object bad:List.of(-1,0.5,"0")){var input=draft(0);input.put("version",bad);assertThrows(IllegalArgumentException.class,()->notes.save(id,input,"admin"));}
    var tooLong=draft(0);tooLong.put("decisions","x".repeat(10001));assertThrows(IllegalArgumentException.class,()->notes.save(id,tooLong,"admin"));
    var missing=draft(0);missing.remove("nextSteps");assertThrows(IllegalArgumentException.class,()->notes.save(id,missing,"admin"));
    var invalid=draft(0);invalid.put("demoNotes",42);assertThrows(IllegalArgumentException.class,()->notes.save(id,invalid,"admin"));
    notes.save(id,draft(0),"admin");var empty=draft(1);for(String key:List.of("demoNotes","stakeholderFeedback","decisions","nextSteps"))empty.put(key,"");assertEquals("",notes.save(id,empty,"admin").demoNotes());
  }
  @Test void completedNotesDoNotChangeFrozenDeliveryOrRetro(){
    workspace.saveRetro(id,Map.of("actions","Keep retro"));var preview=workspace.closurePreview(id);
    workspace.completeSprint(id,Map.of("confirmed",true,"fingerprint",preview.get("fingerprint"),"carryTaskIds",List.of()));
    var before=mapper.valueToTree(workspace.sprint(id));var capacity=mapper.valueToTree(workspace.capacity(id));
    notes.save(id,draft(0),"admin");notes.save(id,draft(1),"admin");
    assertEquals(before,mapper.valueToTree(workspace.sprint(id)));assertEquals(capacity,mapper.valueToTree(workspace.capacity(id)));assertEquals("Keep retro",workspace.retro(id).get("actions"));assertEquals(0,notes.get("legacy-sprint-13").version());
  }
  @Test void serverEnforcesLoginRoleCsrfAndActor() throws Exception {
    String url="/api/sprints/"+id+"/review-notes",body=mapper.writeValueAsString(draft(0));
    mvc.perform(get(url)).andExpect(status().isUnauthorized());
    mvc.perform(get(url).with(user("viewer").roles("USER"))).andExpect(status().isOk());
    mvc.perform(put(url).with(user("viewer").roles("USER")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isForbidden());
    mvc.perform(put(url).with(user("admin").roles("ADMIN")).contentType("application/json").content(body)).andExpect(status().isForbidden());
    mvc.perform(put(url).with(user("admin").roles("ADMIN")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isOk()).andExpect(jsonPath("$.updatedBy").value("admin")).andExpect(jsonPath("$.version").value(1));
    mvc.perform(put(url).with(user("admin").roles("ADMIN")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isBadRequest());
    mvc.perform(get("/api/sprints/missing/review-notes").with(user("viewer").roles("USER"))).andExpect(status().isNotFound());
  }
  @Test void backupValidationIncludesNotesAndUpgradesV19WithoutInventingNotes(){
    notes.save(id,draft(0),"admin");ObjectNode current=mapper.valueToTree(backups.exportData());assertEquals(40, current.path("schemaVersion").asInt());assertNotNull(backups.preview(current));
    ObjectNode old=current.deepCopy();old.path("tables").path("leave_record").forEach(r->{((ObjectNode)r).remove("overtime_hours");((ObjectNode)r).remove("overtime_accounting");});((ObjectNode)old.path("tables")).remove("member_photo");old.put("schemaVersion",19);BackupFixtureV40.removeMatching(old);((ObjectNode)old.path("tables")).remove(java.util.List.of("task_activity","overtime_request","leave_request","defect_reserve_link"));((ObjectNode)old.path("tables")).remove("member_participation");((ObjectNode)old.path("tables")).remove("sprint_member_presence");((ObjectNode)old.path("tables")).remove("member_capacity_policy");((ObjectNode)old.path("tables")).remove("sprint_member_policy");for(String table:java.util.List.of("sprint_flow","task_blocker","sprint_scope_event","sprint_review_note"))((ObjectNode)old.path("tables")).remove(table);var counts=(Map<?,?>)backups.preview(old).get("counts");assertEquals(0,((Map<?,?>)counts.get("sprint_review_note")).get("incoming"));
    for(String field:List.of("sprint_id","updated_at","version","demo_notes")){
      ObjectNode invalid=current.deepCopy();ObjectNode row=(ObjectNode)invalid.path("tables").path("sprint_review_note").get(0);row.put(field,field.equals("sprint_id")?"missing":"invalid");if(field.equals("demo_notes"))row.put(field,17);
      assertThrows(IllegalArgumentException.class,()->backups.preview(invalid));
    }
    assertEquals(1,notes.get(id).version());
  }
}
