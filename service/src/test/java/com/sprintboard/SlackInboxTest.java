package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.*;
import java.nio.file.*;
import java.util.concurrent.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@org.junit.jupiter.api.Tag("historical")
@org.springframework.test.context.ActiveProfiles("historical-tests")
@SpringBootTest(properties={"sprintboard.slack.resolve-names=false","spring.datasource.url=jdbc:h2:mem:slackinbox;DB_CLOSE_DELAY=-1","sprintboard.slack.bot-token=","sprintboard.slack.app-token="})
class SlackInboxTest {
 @TempDir static Path folder;
 @DynamicPropertySource static void props(DynamicPropertyRegistry r){r.add("sprintboard.slack.key-file",()->folder.resolve("key").toString());r.add("sprintboard.backup-directory",()->folder.resolve("backups").toString());}
 @Autowired SlackInboxService inbox;@Autowired SlackConfigStore config;@Autowired JdbcTemplate db;@Autowired ObjectMapper mapper;@Autowired BackupService backup;@Autowired WorkspaceService workspace;
 @BeforeEach void clean(){db.update("DELETE FROM slack_inbox");db.update("DELETE FROM slack_config");}
 String receive(String raw){inbox.accept("T09TFUVTBQQ","C0C9AFXQB4M","1792180000."+String.format("%06d",System.nanoTime()%1000000),"U123456",raw,SlackDefectParser.DEFAULT_TEMPLATE,1);return db.queryForObject("SELECT id FROM slack_inbox ORDER BY received_at DESC LIMIT 1",String.class);}
 String backlogText(){return SlackPreviewTest.TEXT.replace("SPRINT","BACKLOG");}
 Map<String,Object> approve(String target){return new HashMap<>(Map.of("action","APPROVE","target",target,"size","SMALL"));}
 @Test void configurableTemplateAcceptsOneValueAndRejectsUnknownDuplicateAndRemovedFields(){
  assertEquals(true,SlackDefectParser.parse(backlogText(),SlackDefectParser.DEFAULT_TEMPLATE).get("valid"));
  assertEquals(false,SlackDefectParser.parse(backlogText().replace("Tür: TEST","Tür: TEST,PROD"),SlackDefectParser.DEFAULT_TEMPLATE).get("valid"));
  assertEquals(false,SlackDefectParser.parse(backlogText(),SlackDefectParser.DEFAULT_TEMPLATE.replace("TEST,PROD","PROD")).get("valid"));
  assertEquals(false,SlackDefectParser.parse(backlogText()+"\nAdımlar: x",SlackDefectParser.DEFAULT_TEMPLATE).get("valid"));
  for(String bad:List.of(SlackDefectParser.DEFAULT_TEMPLATE+"\nHedef: BACKLOG",SlackDefectParser.DEFAULT_TEMPLATE.replace("SAT,SIT,UAT,DEV,PROD","ADSAT"),SlackDefectParser.DEFAULT_TEMPLATE.replace("TEST,PROD","TEST,")))assertThrows(IllegalArgumentException.class,()->SlackDefectParser.template(bad));
 }
 @Test void encryptionPersistenceRestartStopForgetAndNoSecretsInExportOrStatus(){
  var c=config.load("T09TFUVTBQQ","C0C9AFXQB4M");config.save(c,SlackPreviewTest.BOT,SlackPreviewTest.APP);
  var stored=config.load(c.team(),c.channel());assertFalse(stored.bot().contains(SlackPreviewTest.BOT));assertEquals(SlackPreviewTest.BOT,new SlackSecretVault("",folder.resolve("key").toString()).decrypt(stored.bot()));
  var transport=mock(SlackTransport.class);var service=new SlackPreviewService(transport,mapper,c.team(),c.channel(),"","",config,inbox,mock(SlackOvertimeService.class),mock(SlackBacklogService.class));
  try{assertEquals(true,service.status().get("botTokenConfigured"));assertFalse(service.status().toString().contains(SlackPreviewTest.BOT));service.stop(false);assertEquals(SlackPreviewTest.BOT,config.decrypt(config.load(c.team(),c.channel()).bot()));service.stop(true);assertEquals("",config.load(c.team(),c.channel()).bot());}finally{service.close();}
  assertFalse(mapper.valueToTree(backup.exportData()).path("tables").has("slack_config"));
  config.save(config.load(c.team(),c.channel()),SlackPreviewTest.BOT,SlackPreviewTest.APP);config.enabled(true);
  var reopened=new SlackPreviewService(transport,mapper,c.team(),c.channel(),"","",config,inbox,mock(SlackOvertimeService.class),mock(SlackBacklogService.class));try{var f=SlackPreviewService.class.getDeclaredField("desired");f.setAccessible(true);assertTrue(f.getBoolean(reopened));}catch(Exception e){fail(e);}finally{reopened.close();}
  assertThrows(IllegalStateException.class,()->new SlackSecretVault(Base64.getEncoder().encodeToString(new byte[32]),folder.resolve("unused").toString()).decrypt(stored.bot()));
 }
 @Test void approvalOnceAndDurableDuplicateProtectionAndRejectDoNotCreateWork(){
  int before=db.queryForObject("SELECT COUNT(*) FROM backlog_item",Integer.class);String id=receive(backlogText());assertEquals(before,db.queryForObject("SELECT COUNT(*) FROM backlog_item",Integer.class));
  var result=inbox.decide(id,approve("BACKLOG"),"admin");String b=result.get("backlogId").toString();assertEquals("U123456",db.queryForObject("SELECT reporter_id FROM defect_detail WHERE backlog_id=?",String.class,b));assertEquals("admin",db.queryForObject("SELECT decided_by FROM slack_inbox WHERE id=?",String.class,id));
  assertEquals("UAT",db.queryForObject("SELECT environment FROM defect_detail WHERE backlog_id=?",String.class,b));
  assertThrows(IllegalArgumentException.class,()->inbox.decide(id,approve("BACKLOG"),"admin"));
  String ts=db.queryForObject("SELECT message_ts FROM slack_inbox WHERE id=?",String.class,id);new SlackInboxService(db,mapper,workspace,config).accept("T09TFUVTBQQ","C0C9AFXQB4M",ts,"U123456",backlogText(),SlackDefectParser.DEFAULT_TEMPLATE,1);assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM slack_inbox",Integer.class));
  String invalid=receive("#defect\nBaşlık: invalid");assertThrows(IllegalArgumentException.class,()->inbox.decide(invalid,approve("BACKLOG"),"admin"));inbox.decide(invalid,Map.of("action","REJECT","note","Eksik format"),"admin");assertEquals(before+1,db.queryForObject("SELECT COUNT(*) FROM backlog_item",Integer.class));assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM audit_event WHERE entity_id=? AND action='APPROVED'",Integer.class,id));
 }
 @Test void sprintApprovalStartsWithoutExtraEffortOrEmergency(){
  String id=receive(SlackPreviewTest.TEXT);var request=approve("SPRINT");request.put("sprintId","legacy-sprint-13");request.put("confirmed",true);int before=db.queryForObject("SELECT COUNT(*) FROM backlog_item",Integer.class);
  assertThrows(IllegalArgumentException.class,()->inbox.decide(id,request,"admin"));assertEquals(before,db.queryForObject("SELECT COUNT(*) FROM backlog_item",Integer.class));
  String active=db.queryForObject("SELECT id FROM sprint WHERE status='active' LIMIT 1",String.class);request.put("sprintId",active);request.put("confirmed",false);assertThrows(IllegalArgumentException.class,()->inbox.decide(id,request,"admin"));request.put("confirmed",true);
  var result=inbox.decide(id,request,"admin");String backlog=result.get("backlogId").toString();assertEquals("IN_SPRINT",db.queryForObject("SELECT state FROM backlog_item WHERE id=?",String.class,backlog));String task=db.queryForObject("SELECT id FROM sprint_task WHERE backlog_id=?",String.class,backlog);assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM assignment WHERE task_id=?",Integer.class,task));
  var data=workspace.sprint(active);assertTrue(((List<Map<String,Object>>)data.get("items")).stream().anyMatch(t->task.equals(t.get("id"))&&Boolean.FALSE.equals(t.get("emergency"))&&Boolean.TRUE.equals(t.get("addedDuringSprint"))));
 }
 @Test void concurrentDecisionsCreateExactlyOneAndInvalidEstimateRollsBack()throws Exception{
  String id=receive(backlogText());int before=db.queryForObject("SELECT COUNT(*) FROM backlog_item",Integer.class);assertThrows(IllegalArgumentException.class,()->inbox.decide(id,Map.of("action","APPROVE"),"admin"));assertEquals(before,db.queryForObject("SELECT COUNT(*) FROM backlog_item",Integer.class));
  try(var pool=Executors.newFixedThreadPool(2)){var futures=new ArrayList<Future<Boolean>>();for(int i=0;i<2;i++)futures.add(pool.submit(()->{try{inbox.decide(id,approve("BACKLOG"),"admin");return true;}catch(IllegalArgumentException e){return false;}}));int accepted=0;for(var f:futures)if(f.get(10,TimeUnit.SECONDS))accepted++;assertEquals(1,accepted);}assertEquals(before+1,db.queryForObject("SELECT COUNT(*) FROM backlog_item",Integer.class));
 }
 @Test void reporterSurvivesEditingCopyAndPortableBackupWithoutTrustingApproverInput(){
  String id=receive(backlogText());var request=approve("BACKLOG");request.put("reporterId","forged-admin");
  String b=inbox.decide(id,request,"approving-admin").get("backlogId").toString();
  var defects=new DefectService(db);var detail=defects.all().get(b);
  assertEquals("U123456",detail.get("reporterId"));assertEquals("T09TFUVTBQQ",detail.get("reporterTeamId"));
  assertTrue(detail.get("sourceUrl").toString().startsWith("https://app.slack.com/client/"));
  defects.save(b,Map.of("severity","LOW","environment","SAT","reporterId","forged"));
  assertEquals("U123456",defects.all().get(b).get("reporterId"));
  var saved=mapper.valueToTree(backup.exportData());var preview=backup.preview(saved);
  backup.restore(mapper.valueToTree(Map.of("backup",saved,"confirmation","GERİ YÜKLE","currentFingerprint",preview.get("currentFingerprint"),"backupFingerprint",preview.get("backupFingerprint"))));
  assertEquals("U123456",defects.all().get(b).get("reporterId"));
  var old=(com.fasterxml.jackson.databind.node.ObjectNode)saved.deepCopy();old.put("schemaVersion",34);BackupFixtureV40.removeMatching(old);
  old.path("tables").path("defect_detail").forEach(row->((com.fasterxml.jackson.databind.node.ObjectNode)row).remove(List.of("reporter_id","reporter_team_id","source_url")));
  assertDoesNotThrow(()->backup.preview(old));
 }
 @Test void inboxPagingAndProductRestorePreserveIntegrationDecisions(){
  var saved=mapper.valueToTree(backup.exportData());String id=receive(backlogText());inbox.decide(id,Map.of("action","REJECT"),"admin");var preview=backup.preview(saved);backup.restore(mapper.valueToTree(Map.of("backup",saved,"confirmation","GERİ YÜKLE","currentFingerprint",preview.get("currentFingerprint"),"backupFingerprint",preview.get("backupFingerprint"))));assertEquals("REJECTED",db.queryForObject("SELECT status FROM slack_inbox WHERE id=?",String.class,id));assertEquals(0,inbox.list("WAITING",0).get("total"));assertEquals(1,inbox.list("REJECTED",0).get("total"));
 }
}
