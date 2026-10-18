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
import org.springframework.transaction.support.TransactionTemplate;

class SlackReceiptTest {
 @TempDir Path folder;
 JdbcTemplate db;SlackConfigStore configs;SlackTransport transport;SlackReceiptService receipts;TransactionTemplate tx;
 ObjectMapper mapper=new ObjectMapper();SlackInboxService defects;SlackOvertimeService overtime;
 @BeforeEach void setup()throws Exception{
  var ds=new DriverManagerDataSource("jdbc:h2:mem:receipts-"+UUID.randomUUID()+";DB_CLOSE_DELAY=-1","sa","");
  Flyway.configure().dataSource(ds).load().migrate();db=new JdbcTemplate(ds);tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
  configs=new SlackConfigStore(db,new SlackSecretVault("",folder.resolve("key").toString()));
  configs.save(new SlackConfigStore.Config("TTEST123","CTEST123",SlackDefectParser.DEFAULT_TEMPLATE,"","",true,0,"COT12345","CBACK123",SlackBacklogParser.DEFAULT_TEMPLATE),"xoxb-fake-test-token","xapp-fake-test-token");
  transport=mock(SlackTransport.class);
  when(transport.call(eq("auth.test"),anyString(),anyMap())).thenReturn(mapper.readTree("{\"ok\":true,\"team_id\":\"TTEST123\",\"bot_id\":\"BTEST123\"}"));
  when(transport.call(eq("reactions.add"),anyString(),anyMap())).thenReturn(mapper.readTree("{\"ok\":true}"));
  receipts=new SlackReceiptService(db,configs,transport,false);
  defects=new SlackInboxService(db,mapper,null,configs);overtime=new SlackOvertimeService(db,mapper,null);
 }
 @AfterEach void close(){receipts.close();}
 void defect(String ts){tx.executeWithoutResult(s->defects.accept("TTEST123","CTEST123",ts,"UTEST123",SlackPreviewTest.TEXT,SlackDefectParser.DEFAULT_TEMPLATE,1));}
 int count(String table){return db.queryForObject("SELECT COUNT(*) FROM "+table,Integer.class);}
 String state(){return db.queryForObject("SELECT state FROM slack_receipt_reaction",String.class);}
 @Test void marksBothChannelsAfterIntakeWithoutApprovingOrCreatingBusinessRecords(){
  defect("1792180000.1");tx.executeWithoutResult(s->overtime.accept("TTEST123","COT12345","1792180000.2","UTEST123",SlackOvertimeParser.EXAMPLE,1));
  assertEquals(2,count("slack_receipt_reaction"));verifyNoInteractions(transport);
  receipts.tick();receipts.tick();receipts.tick();
  verify(transport).call("reactions.add","xoxb-fake-test-token",Map.of("channel","CTEST123","timestamp","1792180000.1","name","white_check_mark"));
  verify(transport).call("reactions.add","xoxb-fake-test-token",Map.of("channel","COT12345","timestamp","1792180000.2","name","white_check_mark"));
  verify(transport,times(2)).call(eq("reactions.add"),anyString(),anyMap());
  assertEquals(0,receipts.status().get("receiptPending"));
  assertEquals("PENDING",db.queryForObject("SELECT status FROM slack_inbox",String.class));assertEquals("PENDING",db.queryForObject("SELECT status FROM slack_overtime_inbox",String.class));
  assertEquals(0,count("backlog_item"));assertEquals(0,count("overtime_entry"));
 }
 @Test void invalidAndDuplicateMessagesDoNotCreateExtraReceipts(){
  tx.executeWithoutResult(s->{defects.accept("TTEST123","CTEST123","1792180000.1","UTEST123","#defect\nBaşlık: eksik",SlackDefectParser.DEFAULT_TEMPLATE,1);overtime.accept("TTEST123","COT12345","1792180000.2","UTEST123","#mesai\nSaat: -2",1);});
  receipts.tick();verifyNoInteractions(transport);assertEquals(0,count("slack_receipt_reaction"));
  defect("1792180000.3");defect("1792180000.3");assertEquals(1,count("slack_receipt_reaction"));receipts.tick();defect("1792180000.3");receipts.tick();verify(transport,times(1)).call(eq("reactions.add"),anyString(),anyMap());
 }
 @Test void backlogReceiptOnlyAfterCommitAndWithoutApproval(){
  var backlog=new SlackBacklogService(db,mapper,null);
  tx.executeWithoutResult(s->{backlog.accept("TTEST123","CBACK123","1792180000.9","UTEST123",SlackBacklogTest.TEXT,SlackBacklogParser.DEFAULT_TEMPLATE,1);s.setRollbackOnly();});
  receipts.tick();verifyNoInteractions(transport);assertEquals(0,count("slack_receipt_reaction"));
  tx.executeWithoutResult(s->backlog.accept("TTEST123","CBACK123","1792180000.9","UTEST123",SlackBacklogTest.TEXT,SlackBacklogParser.DEFAULT_TEMPLATE,1));
  receipts.tick();receipts.tick();verify(transport,times(1)).call("reactions.add","xoxb-fake-test-token",Map.of("channel","CBACK123","timestamp","1792180000.9","name","white_check_mark"));
  assertEquals("SENT",state());assertEquals("PENDING",db.queryForObject("SELECT status FROM slack_backlog_inbox",String.class));assertEquals(0,count("backlog_item"));
 }
 @Test void failedTransactionCannotProduceAReaction(){
  tx.executeWithoutResult(s->{defects.accept("TTEST123","CTEST123","1792180000.1","UTEST123",SlackPreviewTest.TEXT,SlackDefectParser.DEFAULT_TEMPLATE,1);s.setRollbackOnly();});
  assertEquals(0,count("slack_inbox"));assertEquals(0,count("slack_receipt_reaction"));receipts.tick();verifyNoInteractions(transport);
 }
 @Test void missingScopeKeepsInboxAndDurableRetrySurvivesWorkerRestart(){
  defect("1792180000.1");when(transport.call(eq("reactions.add"),anyString(),anyMap())).thenThrow(new IllegalStateException("secret xoxb-private missing_scope"));
  receipts.tick();receipts.tick();assertEquals("PENDING",state());assertEquals(1,count("slack_inbox"));
  assertTrue(receipts.status().get("receiptError").toString().contains("reactions:write"));assertFalse(receipts.status().toString().contains("private"));
  verify(transport,times(1)).call(eq("reactions.add"),anyString(),anyMap());
  when(transport.call(eq("reactions.add"),anyString(),anyMap())).thenReturn(mapper.createObjectNode().put("ok",true));
  receipts.close();receipts=new SlackReceiptService(db,configs,transport,false);receipts.tick();
  assertEquals("SENT",state());assertEquals("",receipts.status().get("receiptError"));assertEquals(2,db.queryForObject("SELECT attempts FROM slack_receipt_reaction",Integer.class));
 }
 @Test void alreadyReactedIsIdempotentOnlyForReactionMethod()throws Exception{
  var duplicate=mapper.readTree("{\"ok\":false,\"error\":\"already_reacted\"}");
  assertDoesNotThrow(()->SlackTransport.checkedResponse("reactions.add",duplicate));
  assertThrows(IllegalStateException.class,()->SlackTransport.checkedResponse("users.info",duplicate));
  assertThrows(IllegalStateException.class,()->SlackTransport.checkedResponse("reactions.add",mapper.readTree("{\"ok\":false,\"error\":\"missing_scope\"}")));
  defect("1792180000.1");when(transport.call(eq("reactions.add"),anyString(),anyMap())).thenReturn(SlackTransport.checkedResponse("reactions.add",duplicate));receipts.tick();assertEquals("SENT",state());
 }
 @Test void stoppedCredentialsWrongWorkspaceAndUnwatchedChannelsCannotReact()throws Exception{
  defect("1792180000.1");configs.enabled(false);receipts.tick();verifyNoInteractions(transport);configs.enabled(true);
  when(transport.call(eq("auth.test"),anyString(),anyMap())).thenReturn(mapper.readTree("{\"team_id\":\"TOTHER99\",\"bot_id\":\"BOTHER99\"}"));
  receipts.tick();verify(transport,never()).call(eq("reactions.add"),anyString(),anyMap());assertEquals("PENDING",state());
  var c=configs.load("","");configs.save(new SlackConfigStore.Config(c.team(),"COTHER99",c.template(),"","",true,c.version(),""),"xoxb-fake-test-token","xapp-fake-test-token");receipts.tick();verify(transport,never()).call(eq("reactions.add"),anyString(),anyMap());
 }
 @Test void credentialsChangedDuringAuthAreRecheckedBeforeReaction(){
  defect("1792180000.1");when(transport.call(eq("auth.test"),anyString(),anyMap())).thenAnswer(call->{configs.forget();return mapper.readTree("{\"team_id\":\"TTEST123\",\"bot_id\":\"BTEST123\"}");});
  receipts.tick();verify(transport,never()).call(eq("reactions.add"),anyString(),anyMap());assertEquals("PENDING",state());
 }
}
