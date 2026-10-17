package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.*;
import java.net.http.WebSocket;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.*;

class SlackPreviewTest {
  static final String TEXT="#defect\nTür: TEST\nBaşlık: OTP gelmiyor\nOrtam: UAT\nÖnem: HIGH\nHedef: SPRINT";
  static final String BOT="xoxb-test-only-123456789",APP="xapp-test-only-123456789";
  final ObjectMapper mapper=new ObjectMapper();
  SlackPreviewService service;FakeSlack transport;
  final SlackOvertimeService overtime=mock(SlackOvertimeService.class);
  final Map<String,Map<String,Object>> received=new LinkedHashMap<>();
  SlackPreviewService create(String bot,String app){
    var config=mock(SlackConfigStore.class);when(config.load(anyString(),anyString())).thenReturn(new SlackConfigStore.Config("T09TFUVTBQQ","C0C9AFXQB4M",SlackDefectParser.DEFAULT_TEMPLATE,"","",false,0));when(config.save(any(),anyString(),anyString())).thenReturn(1);
    var inbox=mock(SlackInboxService.class);doAnswer(a->{String key=a.getArgument(2);received.putIfAbsent(key,SlackDefectParser.parse(a.getArgument(4),a.getArgument(5)));return null;}).when(inbox).accept(anyString(),anyString(),anyString(),anyString(),anyString(),anyString(),anyInt());
    return new SlackPreviewService(transport,mapper,"T09TFUVTBQQ","C0C9AFXQB4M",bot,app,config,inbox,overtime);
  }
  class FakeSlack extends SlackTransport {
    volatile WebSocket.Listener listener;volatile boolean wrongTeam;volatile String failure="";volatile int opened;volatile int acknowledgements;WebSocket ws=mock(WebSocket.class);
    FakeSlack(){super(mapper);when(ws.sendText(anyString(),eq(true))).thenAnswer(a->{acknowledgements++;return CompletableFuture.completedFuture(ws);});when(ws.sendPing(any())).thenReturn(CompletableFuture.completedFuture(ws));}
    @Override public JsonNode call(String method,String token,Map<String,String> input){
      if(!failure.isEmpty())throw new IllegalStateException(failure);
      return switch(method){case "auth.test"->mapper.valueToTree(Map.of("ok",true,"team_id",wrongTeam?"TOTHER99":"T09TFUVTBQQ","bot_id","B123456"));case "conversations.history"->{assertTrue(Set.of("C0C9AFXQB4M","C0CA3PMA1Q9").contains(input.get("channel")));yield mapper.valueToTree(Map.of("ok",true));}case "apps.connections.open"->mapper.valueToTree(Map.of("ok",true,"url","wss://wss-primary.slack.com/link?ticket=secret"));default->throw new AssertionError("Unexpected API: "+method);};
    }
    @Override public WebSocket open(String url,WebSocket.Listener l){listener=l;opened++;l.onOpen(ws);l.onText(ws,"{\"type\":\"hello\"}",true);return ws;}
    void send(String text)throws Exception{listener.onText(ws,text,true);}
  }
  void waitFor(BooleanSupplier condition)throws Exception{for(int i=0;i<100;i++){if(condition.getAsBoolean())return;Thread.sleep(20);}fail("Timed out");}
  void start()throws Exception{transport=new FakeSlack();service=create("","");service.start(Map.of("botToken",BOT,"appToken",APP));waitFor(()->"CONNECTED".equals(service.status().get("state")));}
  Map<String,Object> event(String channel,String ts,String text){return new LinkedHashMap<>(Map.of("type","message","channel",channel,"ts",ts,"user","U123456","text",text));}
  String envelope(String team,Map<String,Object> event)throws Exception{return mapper.writeValueAsString(Map.of("type","events_api","envelope_id",UUID.randomUUID().toString(),"payload",Map.of("team_id",team,"event",event)));}
  List<Map<String,Object>> previews(){return List.copyOf(received.values());}
  @AfterEach void close(){if(service!=null)service.close();}
  @Test void parserValidInvalidDuplicateUnicodeAndRedaction(){
    var p=SlackDefectParser.parse(TEXT);assertEquals(true,p.get("valid"));assertEquals("TEST_DEFECT",p.get("taskSubtype"));assertEquals("SPRINT",p.get("target"));
    assertEquals(false,SlackDefectParser.parse(TEXT+"\nTür: PROD").get("valid"));assertEquals(false,SlackDefectParser.parse(TEXT.replace("HIGH","whatever")).get("valid"));assertEquals(false,SlackDefectParser.parse("#defect\nBaşlık: Tek alan").get("valid"));
    assertFalse(SlackDefectParser.matches("Normal sohbet #defect"));assertEquals(false,SlackDefectParser.parse(TEXT+"x".repeat(12000)).get("valid"));
    assertFalse(SlackDefectParser.parse(TEXT+"\n"+BOT).toString().contains(BOT));
    assertEquals("PROD_DEFECT",SlackDefectParser.parse(TEXT.replace("Tür: TEST","Tür: PROD")).get("taskSubtype"));
    var sat=SlackDefectParser.parse(TEXT.replace("Ortam: UAT","Ortam: sat"));assertEquals(true,sat.get("valid"));assertEquals("SAT",sat.get("environment"));
    assertEquals(false,SlackDefectParser.parse(TEXT.replace("Ortam: UAT","Ortam: ADSAT")).get("valid"));
  }
  @Test void channelWorkspaceBotReplyAndDuplicateFilteringBoundedPreview()throws Exception{
    start();String ts="1792180000.000001";
    transport.send(envelope("TOTHER99",event("C0C9AFXQB4M",ts,TEXT)));
    transport.send(envelope("T09TFUVTBQQ",event("COTHER99",ts,TEXT)));
    var bot=event("C0C9AFXQB4M",ts,TEXT);bot.put("bot_id","B123456");transport.send(envelope("T09TFUVTBQQ",bot));
    var reply=event("C0C9AFXQB4M",ts,TEXT);reply.put("thread_ts",ts);transport.send(envelope("T09TFUVTBQQ",reply));
    var edit=event("C0C9AFXQB4M",ts,TEXT);edit.put("subtype","message_changed");transport.send(envelope("T09TFUVTBQQ",edit));
    transport.send(envelope("T09TFUVTBQQ",event("C0C9AFXQB4M",ts,"normal message")));assertTrue(previews().isEmpty());
    String message=envelope("T09TFUVTBQQ",event("C0C9AFXQB4M",ts,TEXT));transport.send(message);transport.send(message);assertEquals(1,previews().size());assertEquals(8,transport.acknowledgements);
    for(int i=2;i<40;i++)transport.send(envelope("T09TFUVTBQQ",event("C0C9AFXQB4M","1792180000."+String.format("%06d",i),TEXT)));
    assertEquals(39,previews().size());assertFalse(service.status().toString().contains(BOT));assertFalse(service.status().toString().contains(APP));
  }
  @Test void fragmentsAcknowledgementInvalidPreviewStopForgetAndStaleCallbacks()throws Exception{
    start();String message=envelope("T09TFUVTBQQ",event("C0C9AFXQB4M","1792180000.000010","#defect\nBaşlık: Eksik"));
    transport.listener.onText(transport.ws,message.substring(0,40),false);assertTrue(previews().isEmpty());transport.listener.onText(transport.ws,message.substring(40),true);assertEquals(1,previews().size());assertEquals(false,previews().getFirst().get("valid"));
    var old=transport.listener;service.stop(true);old.onText(transport.ws,message,true);old.onError(transport.ws,new RuntimeException(BOT));
    assertEquals("STOPPED",service.status().get("state"));assertFalse((Boolean)service.status().get("botTokenConfigured"));assertEquals(1,previews().size());
    assertThrows(IllegalArgumentException.class,()->service.start(Map.of()));assertThrows(IllegalArgumentException.class,()->service.start(Map.of("botToken",BOT+"\r\n","appToken",APP)));
  }
  @Test void wrongWorkspaceDoesNotOpenSocketAndDisconnectSchedulesRetry()throws Exception{
    transport=new FakeSlack();transport.wrongTeam=true;service=create(BOT,APP);service.start(Map.of());waitFor(()->"RETRYING".equals(service.status().get("state")));assertEquals(0,transport.opened);assertTrue(service.status().get("error").toString().contains("çalışma alanına"));
    transport.wrongTeam=false;service.start(Map.of());waitFor(()->"CONNECTED".equals(service.status().get("state")));transport.send("{\"type\":\"disconnect\"}");assertEquals("RETRYING",service.status().get("state"));
  }
  @Test void overtimeUsesSeparateConfiguredChannelAndSameSocket()throws Exception{
    start();service.start(Map.of("overtimeChannelId","C0CA3PMA1Q9"));waitFor(()->"CONNECTED".equals(service.status().get("state")));
    String text=SlackOvertimeParser.EXAMPLE.replace("#mesai","<#C0CA3PMA1Q9>");
    transport.send(envelope("T09TFUVTBQQ",event("C0C9AFXQB4M","1792180000.000001",text)));
    transport.send(envelope("T09TFUVTBQQ",event("C0CA3PMA1Q9","1792180000.000002",TEXT)));
    transport.send(envelope("TOTHER99",event("C0CA3PMA1Q9","1792180000.000003",text)));
    verifyNoInteractions(overtime);assertTrue(previews().isEmpty());
    transport.send(envelope("T09TFUVTBQQ",event("C0CA3PMA1Q9","1792180000.000004",text)));
    verify(overtime).accept(eq("T09TFUVTBQQ"),eq("C0CA3PMA1Q9"),eq("1792180000.000004"),eq("U123456"),eq(text),anyInt());
    assertThrows(IllegalArgumentException.class,()->service.save(Map.of("overtimeChannelId","C0C9AFXQB4M")));
  }
  @Test void socketAddressIsRestrictedAndErrorsCannotEchoSlackContent(){
    assertEquals("wss",SlackTransport.socketUri("wss://wss-primary.slack.com/link?ticket=x").getScheme());
    for(String u:List.of("ws://wss.slack.com","wss://slack.com.evil.test","wss://localhost","wss://user@wss.slack.com","https://wss.slack.com","wss://wss.slack.com:444"))assertThrows(IllegalStateException.class,()->SlackTransport.socketUri(u));
    assertFalse(SlackTransport.error(BOT).contains(BOT));
  }
}
