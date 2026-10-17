package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.*;
import java.nio.file.Path;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.flywaydb.core.Flyway;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
class SlackReporterTest {
 @TempDir Path folder;
 JdbcTemplate db;SlackConfigStore configs;SlackTransport transport;SlackReporterService resolver;ObjectMapper mapper=new ObjectMapper();
 @BeforeEach void setup()throws Exception{
  var ds=new DriverManagerDataSource("jdbc:h2:mem:names-"+UUID.randomUUID()+";DB_CLOSE_DELAY=-1","sa","");
  Flyway.configure().dataSource(ds).load().migrate();db=new JdbcTemplate(ds);
  configs=new SlackConfigStore(db,new SlackSecretVault("",folder.resolve("key").toString()));
  configs.save(new SlackConfigStore.Config("TTEST123","CTEST123",SlackDefectParser.DEFAULT_TEMPLATE,"","",true,0),"xoxb-fake-test-token","xapp-fake-test-token");
  transport=mock(SlackTransport.class);
  when(transport.call(eq("auth.test"),anyString(),anyMap())).thenReturn(mapper.readTree("{\"ok\":true,\"team_id\":\"TTEST123\"}"));
  resolver=new SlackReporterService(db,configs,transport,new DataSourceTransactionManager(ds),false);
 }
 @AfterEach void close(){resolver.close();}
 void receive(String ts){new SlackInboxService(db,mapper,null,configs).accept("TTEST123","CTEST123",ts,"UTEST123","#defect\nTür: TEST\nBaşlık: QA\nOrtam: SAT\nÖnem: HIGH\nHedef: BACKLOG",SlackDefectParser.DEFAULT_TEMPLATE,1);}
 @Test void resolvesFullNameCachesAndBackfillsAlreadyApprovedDefect()throws Exception{
  receive("1.1");
  db.update("INSERT INTO backlog_item(id,title,criteria,work_kind,type,state,created_at,task_category,task_subtype) VALUES('name-test','Name test','','DEFECT','FEATURE','Ready',CURRENT_TIMESTAMP,'DEFECT','TEST_DEFECT')");
  db.update("INSERT INTO defect_detail(backlog_id,severity,environment,reporter_id,reporter_team_id) VALUES('name-test','HIGH','SAT','UTEST123','TTEST123')");
  when(transport.call(eq("users.info"),anyString(),anyMap())).thenReturn(mapper.readTree("{\"ok\":true,\"user\":{\"id\":\"UTEST123\",\"profile\":{\"real_name\":\"Elçim Öneç\",\"display_name\":\"nick\"}}}"));
  resolver.tick();assertEquals("Elçim Öneç",db.queryForObject("SELECT reporter_name FROM defect_detail WHERE backlog_id='name-test'",String.class));
  new SlackOvertimeService(db,mapper,null).accept("TTEST123","COT12345","1.3","UTEST123",SlackOvertimeParser.EXAMPLE,1);
  receive("1.2");resolver.tick();assertEquals("Elçim Öneç",db.queryForObject("SELECT reporter_name FROM slack_overtime_inbox",String.class));assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM slack_inbox WHERE reporter_name='Elçim Öneç'",Integer.class));
  verify(transport,times(1)).call(eq("users.info"),anyString(),anyMap());
  var details=new DefectService(db);details.save("name-test",Map.of("severity","LOW","environment","SAT","reporterName","forged"));
  assertEquals("Elçim Öneç",details.all().get("name-test").get("reporterName"));
  var backups=new BackupService(db,mapper.findAndRegisterModules(),folder.resolve("backup").toString());
  assertDoesNotThrow(()->backups.preview(mapper.valueToTree(backups.exportData())));
 }
 @Test void missingPermissionDoesNotAffectIntakeAndShowsSafeWarning(){
  receive("1.1");when(transport.call(eq("users.info"),anyString(),anyMap())).thenThrow(new IllegalStateException("secret API error"));
  resolver.safeTick();assertTrue(resolver.status().get("reporterError").toString().contains("users:read"));assertFalse(resolver.status().toString().contains("secret"));
  assertEquals("PENDING",db.queryForObject("SELECT status FROM slack_inbox",String.class));
  resolver.safeTick();verify(transport,times(1)).call(eq("users.info"),anyString(),anyMap());
 }
 @Test void doesNotUseNicknameOrNamesFromOtherIdentities()throws Exception{
  assertEquals("",SlackReporterService.fullName(mapper.readTree("{\"profile\":{\"display_name\":\"nickname\"}}")));
  assertEquals("Ada Yılmaz",SlackReporterService.fullName(mapper.readTree("{\"profile\":{\"first_name\":\"Ada\",\"last_name\":\"Yılmaz\"}}")));
  receive("1.1");when(transport.call(eq("users.info"),anyString(),anyMap())).thenReturn(mapper.readTree("{\"user\":{\"id\":\"UOTHER\",\"real_name\":\"Wrong Person\"}}"));
  resolver.safeTick();assertNull(db.queryForObject("SELECT reporter_name FROM slack_inbox",String.class));
 }
 @Test void credentialChangeWhileFetchingDiscardsResult()throws Exception{
  receive("1.1");when(transport.call(eq("users.info"),anyString(),anyMap())).thenAnswer(call->{configs.forget();return mapper.readTree("{\"user\":{\"id\":\"UTEST123\",\"real_name\":\"Ada Yılmaz\"}}");});
  resolver.tick();assertNull(db.queryForObject("SELECT reporter_name FROM slack_inbox",String.class));
 }
}
