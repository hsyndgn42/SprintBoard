package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Path;
import java.time.*;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class ConfluenceBacklogTest {
  private static final Instant NOW=Instant.parse("2026-11-08T09:00:00Z");
  private static final String TOKEN="test-only-secret";
  @TempDir Path folder;
  JdbcTemplate db; ConfluenceConfigStore configs; ConfluenceBacklogService service;
  WorkspaceService workspace; ConfluenceTransport transport; ObjectNode page;
  ObjectMapper mapper=new ObjectMapper(); List<Map<String,Object>> items;

  @BeforeEach void setup(){
    var ds=new DriverManagerDataSource("jdbc:h2:mem:wiki-"+UUID.randomUUID()+";DB_CLOSE_DELAY=-1","sa","");
    Flyway.configure().dataSource(ds).load().migrate();
    db=new DatabaseConfiguration().jdbcTemplate(ds);
    configs=new ConfluenceConfigStore(db,new JiraSecretVault("",folder.resolve("wiki-key").toString()));
    configs.save(new ConfluenceConfigStore.Config("https://wiki.local","vibe","10",true,0,false,"20"),TOKEN);
    workspace=mock(WorkspaceService.class);transport=mock(ConfluenceTransport.class);
    var jira=mock(JiraConfigStore.class);var jiraConfig=mock(JiraConfigStore.Config.class);
    when(jira.load()).thenReturn(jiraConfig);when(jiraConfig.baseUrl()).thenReturn("https://jira.local");
    when(workspace.settings()).thenReturn(Map.of("estimationMode","SIZE_AND_HOURS"));
    items=new ArrayList<>();items.add(item("one","DEV","POOL"));
    when(workspace.backlog()).thenAnswer(call->items);
    page=mapper.createObjectNode().put("id","20").put("title","Ekibin Backlog Sayfası").put("type","page").put("status","current");
    page.putObject("version").put("number",3);page.putObject("space").put("key","VIBE");
    when(transport.get(anyString(),anyString(),anyString(),anyMap())).thenAnswer(call->page.deepCopy());
    when(transport.put(anyString(),anyString(),anyString(),any())).thenAnswer(call->{
      JsonNode body=call.getArgument(3);page.withObject("version").put("number",body.path("version").path("number").asInt());return page.deepCopy();
    });
    service=new ConfluenceBacklogService(workspace,configs,jira,transport,db,mapper,Clock.fixed(NOW,ZoneOffset.UTC));
  }
  private Map<String,Object> item(String id,String category,String stage){
    var i=new LinkedHashMap<String,Object>();i.put("id",id);i.put("title","İş "+id);i.put("taskCategory",category);i.put("taskSubtype","");
    i.put("estimatedHours",8);i.put("size","SMALL");i.put("priority","HIGH");i.put("roadmapTitle","VIBE 3.0");i.put("jiraKey","VBCRF-123");
    i.put("state",stage.equals("POOL")?"Ready":"InSprint");i.put("taskStatus",stage.equals("CLOSED")?"done":"todo");
    i.put("sprintId",stage.equals("POOL")?"":"s17");i.put("sprintName",stage.equals("POOL")?"":"Sprint 17");
    i.put("sprintStatus",stage.equals("PLANNED")?"planned":stage.equals("ACTIVE")?"active":stage.equals("CLOSED")?"closed":"");return i;
  }
  private Map<String,Object> selection(){return Map.of("itemIds",items.stream().map(i->i.get("id")).toList(),"scope","Havuz + aktif + planlanan");}
  private Map<String,Object> confirmed(ConfluenceBacklogService.Preview p){return new LinkedHashMap<>(Map.of("itemIds",p.itemIds(),"scope",p.scope(),"generatedAt",p.generatedAt(),"fingerprint",p.fingerprint(),"confirmed",true));}
  private void noPut(){verify(transport,never()).put(anyString(),anyString(),anyString(),any());}

  @Test void previewIncludesAllFilteredPagesButExcludesLeaveAndPrivateFields()throws Exception{
    items.clear();for(int n=0;n<45;n++)items.add(item("i"+n,"DEV",n<20?"POOL":n<35?"PLANNED":"ACTIVE"));
    var selected=new ArrayList<>(items.stream().map(i->i.get("id")).toList());
    items.add(item("not-selected","DESIGN","CLOSED"));
    var leave=item("private","BAU","PLANNED");leave.put("taskSubtype","LEAVE");leave.put("title","PRIVATE_LEAVE_REASON");items.add(leave);selected.add("private");
    items.getFirst().put("criteria","PRIVATE_ACCEPTANCE_TEXT");items.getFirst().put("reporter","PRIVATE_REPORTER");
    var p=service.preview(Map.of("itemIds",selected,"scope","Seçili görünüm"));
    assertEquals(45,p.rows().size());assertEquals(1,p.excludedLeave());assertEquals(20,p.pool());assertEquals(15,p.planned());assertEquals(10,p.active());
    String json=mapper.writeValueAsString(p),html=ConfluenceBacklogService.storage(p);
    for(String secret:List.of("PRIVATE_LEAVE_REASON","PRIVATE_ACCEPTANCE_TEXT","PRIVATE_REPORTER",TOKEN,"not-selected")){assertFalse(json.contains(secret));assertFalse(html.contains(secret));}
    assertTrue(html.contains("İş i44"));assertTrue(html.contains("https://jira.local/browse/VBCRF-123"));
    noPut();assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM confluence_backlog_publish",Integer.class));
  }
  @Test void usesSamePageTitleAndVersionForUpdatesAndRecordsOnlySuccessfulPublish(){
    var p=service.preview(selection());var result=service.publish(confirmed(p));
    assertEquals("20",result.get("pageId"));assertEquals(4,result.get("pageVersion"));
    var payload=ArgumentCaptor.forClass(JsonNode.class);verify(transport).put(eq("https://wiki.local"),eq(TOKEN),eq("/rest/api/content/20"),payload.capture());
    assertEquals("Ekibin Backlog Sayfası",payload.getValue().path("title").asText());assertEquals("storage",payload.getValue().at("/body/storage/representation").asText());
    assertFalse(payload.getValue().has("ancestors"));
    assertNotNull(service.status().get("lastPublish"));
    assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM audit_event WHERE action='backlog-published'",Integer.class));
    assertFalse(db.queryForObject("SELECT detail_json FROM audit_event WHERE action='backlog-published'",String.class).contains(TOKEN));
    assertThrows(IllegalArgumentException.class,()->service.publish(confirmed(p)),"reusing a preview cannot republish it");
    service.publish(confirmed(service.preview(selection())));
    assertEquals(5,db.queryForObject("SELECT page_version FROM confluence_backlog_publish",Integer.class));
    assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM confluence_backlog_publish",Integer.class));
    verify(transport,never()).post(anyString(),anyString(),anyString(),any());
  }
  @Test void refusesChangedWorkAfterPreview(){
    var p=service.preview(selection());items.getFirst().put("title","Sonradan değiştirildi");
    assertThrows(IllegalArgumentException.class,()->service.publish(confirmed(p)));noPut();
  }
  @Test void refusesChangedSettingsAfterPreview(){
    var p=service.preview(selection());var c=configs.load();
    configs.save(new ConfluenceConfigStore.Config(c.baseUrl(),c.spaceKey(),c.parentPageId(),true,c.version(),true,"21"),"");
    page.put("id","21");assertThrows(IllegalArgumentException.class,()->service.publish(confirmed(p)));noPut();
  }
  @Test void refusesConcurrentWikiEdit(){
    var p=service.preview(selection());page.withObject("version").put("number",4);
    assertThrows(IllegalArgumentException.class,()->service.publish(confirmed(p)));noPut();
  }
  @Test void remoteConflictLeavesNoSuccessRecordAndDoesNotRetry(){
    var p=service.preview(selection());doThrow(new ConfluenceTransport.Rejected("Wiki sürümü değişti")).when(transport).put(anyString(),anyString(),anyString(),any());
    assertThrows(ConfluenceTransport.Rejected.class,()->service.publish(confirmed(p)));
    verify(transport,times(1)).put(anyString(),anyString(),anyString(),any());
    assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM confluence_backlog_publish",Integer.class));
    assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM audit_event WHERE action='backlog-published'",Integer.class));
  }
  @Test void rejectsMissingConfirmationExpiredAndTamperedPreview(){
    var p=service.preview(selection());var input=confirmed(p);input.remove("confirmed");assertThrows(IllegalArgumentException.class,()->service.publish(input));
    input.put("confirmed",true);input.put("generatedAt",NOW.minusSeconds(901).toString());assertThrows(IllegalArgumentException.class,()->service.publish(input));
    input.put("generatedAt",NOW.plusSeconds(31).toString());assertThrows(IllegalArgumentException.class,()->service.publish(input));
    input.put("generatedAt",p.generatedAt());input.put("fingerprint","wrong");assertThrows(IllegalArgumentException.class,()->service.publish(input));noPut();
  }
  @Test void refusesSprintPageParentWrongSpaceAndArchivedPage(){
    db.update("INSERT INTO confluence_page_link(sprint_id,page_id,published_at) VALUES('s17','20',?)",NOW.toString());
    assertThrows(IllegalArgumentException.class,()->service.preview(selection()));verifyNoInteractions(transport);
    db.update("DELETE FROM confluence_page_link");
    page.withObject("space").put("key","OTHER");assertThrows(IllegalArgumentException.class,()->service.preview(selection()));
    page.withObject("space").put("key","VIBE");page.put("status","archived");assertThrows(IllegalArgumentException.class,()->service.preview(selection()));
    page.put("status","current").put("type","blogpost");assertThrows(IllegalArgumentException.class,()->service.preview(selection()));noPut();
    assertThrows(IllegalArgumentException.class,()->configs.save(new ConfluenceConfigStore.Config("https://wiki.local","VIBE","20",true,1,true,"20"),""));
  }
  @Test void rejectsBadSelectionAndDeletedItems(){
    for(Object ids:List.of(List.of("one","one"),List.of("missing"),List.of(1),List.of(""),Collections.nCopies(5001,"one"))){
      assertThrows(IllegalArgumentException.class,()->service.preview(Map.of("itemIds",ids,"scope","Havuz")));
    }
    assertThrows(IllegalArgumentException.class,()->service.preview(Map.of("itemIds",List.of("one"),"scope","bad\ntext")));noPut();
  }
  @Test void escapesTextUsesSubtypeLabelsAndDoesNotInventZeroEffort(){
    var i=items.getFirst();i.put("title","<script>alert('x')</script>");i.put("roadmapTitle","A&B");i.put("taskCategory","DEFECT");i.put("taskSubtype","TEST_DEFECT");i.put("estimatedHours",0);i.put("jiraKey","javascript:bad");
    var p=service.preview(Map.of("itemIds",List.of("one"),"scope","<img src=x>"));String html=ConfluenceBacklogService.storage(p);
    assertFalse(html.contains("<script>"));assertFalse(html.contains("<img"));assertTrue(html.contains("&lt;script&gt;"));assertTrue(html.contains("A&amp;B"));
    assertTrue(html.contains("Saat belirtilmedi"));assertTrue(html.contains("DEFECT · "));assertEquals("",p.rows().getFirst().jiraUrl());assertFalse(html.contains("javascript:"));
  }
  @Test void emptySelectionAndStoryPointsWork(){
    assertTrue(ConfluenceBacklogService.storage(service.preview(Map.of("itemIds",List.of(),"scope","Boş filtre"))).contains("paylaşılacak iş yok"));
    when(workspace.settings()).thenReturn(Map.of("estimationMode","STORY_POINTS"));items.getFirst().put("storyPoints",5);
    assertEquals("5 SP",service.preview(selection()).rows().getFirst().estimate());
  }
  @Test void settingsPersistPageIdWithoutRequiringTokenAgainAndOldClientPreservesIt(){
    var settings=new ConfluenceSettingsService(configs,transport,mock(ConfluencePageService.class),db,mapper,Clock.fixed(NOW,ZoneOffset.UTC));
    var input=new LinkedHashMap<>(Map.<String,Object>of("baseUrl","https://wiki.local","spaceKey","vibe","parentPageId","10","enabled",true,"version",1));
    settings.save(input);
    assertEquals("20",configs.load().backlogPageId());assertEquals(TOKEN,configs.token());assertEquals("VIBE",configs.load().spaceKey());
    assertFalse(db.queryForObject("SELECT pat_secret FROM confluence_config",String.class).contains(TOKEN));
    assertFalse(settings.status().containsKey("pat"));
    input.put("version",2);input.put("backlogPageId","invalid");assertThrows(IllegalArgumentException.class,()->settings.save(input));
    input.put("backlogPageId","21");settings.save(input);assertEquals("21",configs.load().backlogPageId());
    assertThrows(IllegalArgumentException.class,()->settings.save(input),"stale settings cannot overwrite a newer version");
  }
  @Test void disablingOrForgettingTokenStopsPublicationAndDestinationChangeHidesOldReceipt(){
    service.publish(confirmed(service.preview(selection())));
    configs.save(new ConfluenceConfigStore.Config("https://wiki.local","VIBE","10",true,1,true,"21"),"");
    assertNull(service.status().get("lastPublish"));
    configs.forget();assertThrows(IllegalArgumentException.class,()->service.preview(selection()));assertEquals(false,service.status().get("enabled"));
    assertEquals("21",configs.load().backlogPageId());
  }
  @Test void migrationPreservesExistingConfluenceSettings(){
    var ds=new DriverManagerDataSource("jdbc:h2:mem:old-wiki-"+UUID.randomUUID()+";DB_CLOSE_DELAY=-1","sa","");
    Flyway.configure().dataSource(ds).target("48").load().migrate();var old=new JdbcTemplate(ds);
    old.update("INSERT INTO confluence_config(id,base_url,space_key,parent_page_id,pat_secret,enabled,version) VALUES(1,'https://old.local','OLD','123','encrypted-value',true,9)");
    Flyway.configure().dataSource(ds).load().migrate();
    assertEquals("encrypted-value",old.queryForObject("SELECT pat_secret FROM confluence_config",String.class));
    assertEquals(9,old.queryForObject("SELECT version FROM confluence_config",Integer.class));assertEquals("",old.queryForObject("SELECT backlog_page_id FROM confluence_config",String.class));
    assertTrue(old.queryForObject("SELECT enabled FROM confluence_config",Boolean.class));
  }
}
