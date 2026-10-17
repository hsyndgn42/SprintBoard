package com.sprintboard;

import com.fasterxml.jackson.databind.*;
import jakarta.annotation.PreDestroy;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Receives only into a durable approval inbox. Never creates tasks or sends Slack messages. */
@Service
public class SlackPreviewService {
  private final SlackTransport transport;private final ObjectMapper mapper;private String team,channel,template,overtimeChannel;private int version;
  private final SlackConfigStore configs;private final SlackInboxService inbox;private final SlackOvertimeService overtime;
  private final ScheduledExecutorService executor=Executors.newSingleThreadScheduledExecutor(r->{Thread t=new Thread(r,"slack-preview");t.setDaemon(true);return t;});
  private String botToken,appToken,state="STOPPED",error="",lastReceived="",connectedAt="",credentialSource;
  private boolean desired,connecting,closed;private long generation,nextAttempt,lastFrame,lastPing;private WebSocket socket;
  @Value("${sprintboard.slack.worker-enabled:true}") private boolean workerEnabled=true;
  public SlackPreviewService(SlackTransport transport,ObjectMapper mapper,
      @Value("${sprintboard.slack.team-id:}") String team,@Value("${sprintboard.slack.channel-id:}") String channel,
      @Value("${sprintboard.slack.bot-token:}") String botToken,@Value("${sprintboard.slack.app-token:}") String appToken,SlackConfigStore configs,SlackInboxService inbox,SlackOvertimeService overtime){
    this.transport=transport;this.mapper=mapper;this.configs=configs;this.inbox=inbox;this.overtime=overtime;
    var stored=configs.load(team,channel);this.team=stored.team();this.channel=stored.channel();this.template=stored.template();this.version=stored.version();this.overtimeChannel=stored.overtimeChannel();this.botToken="";this.appToken="";
    if((!this.team.isBlank()&&!this.team.matches("T[A-Z0-9]{5,30}"))||(!this.channel.isBlank()&&!this.channel.matches("[CG][A-Z0-9]{5,30}")))throw new IllegalArgumentException("Slack workspace/kanal kimliği geçersiz.");
    try{this.botToken=version>0?configs.decrypt(stored.bot()):botToken;this.appToken=version>0?configs.decrypt(stored.app()):appToken;desired=stored.enabled()&&!this.botToken.isBlank()&&!this.appToken.isBlank();}catch(IllegalStateException e){error=e.getMessage();}
    credentialSource=version>0?"DATABASE":botToken.isBlank()&&appToken.isBlank()?"NONE":"ENVIRONMENT";
    executor.scheduleWithFixedDelay(this::tick,2,5,TimeUnit.SECONDS);
  }
  @org.springframework.context.event.EventListener(org.springframework.boot.context.event.ApplicationReadyEvent.class)
  public void ready(){executor.execute(this::tick);}
  public synchronized Map<String,Object> status(){
    var r=new LinkedHashMap<String,Object>();r.put("mode","ADMIN_APPROVAL");r.put("teamId",team);r.put("channelId",channel);r.put("overtimeChannelId",overtimeChannel);r.put("overtimeTemplate",SlackOvertimeParser.EXAMPLE);r.put("template",template);r.put("version",version);r.put("state",state);r.put("error",error);r.put("botTokenConfigured",!botToken.isBlank());r.put("appTokenConfigured",!appToken.isBlank());r.put("credentialSource",credentialSource);r.put("connectedAt",connectedAt);r.put("lastReceivedAt",lastReceived);return r;
  }
  public synchronized Map<String,Object> save(Map<String,Object> input){return configure(input,false);}
  private Map<String,Object> configure(Map<String,Object> input,boolean enable){
    String nextTeam=Objects.toString(input.get("teamId"),team).trim(),nextChannel=Objects.toString(input.get("channelId"),channel).trim(),nextTemplate=Objects.toString(input.get("template"),template);
    if(!nextTeam.matches("T[A-Z0-9]{5,30}")||!nextChannel.matches("[CG][A-Z0-9]{5,30}"))throw new IllegalArgumentException("Workspace T…, kanal C… veya G… kimliği olmalı.");
    String nextOvertime=Objects.toString(input.get("overtimeChannelId"),overtimeChannel).trim();
    if(!nextOvertime.isBlank()&&(!nextOvertime.matches("[CG][A-Z0-9]{5,30}")||nextOvertime.equals(nextChannel)))throw new IllegalArgumentException("Mesai kanalı ayrı bir C… veya G… kimliği olmalı.");
    SlackDefectParser.template(nextTemplate);
    if(input.containsKey("version")&&(!(input.get("version") instanceof Number n)||n.intValue()!=version))throw new IllegalArgumentException("Ayarlar değişti; sayfayı yenileyin.");
    String bot=token(input,"botToken",botToken,"xoxb-"),app=token(input,"appToken",appToken,"xapp-");
    if(enable&&(bot.isBlank()||app.isBlank()))throw new IllegalArgumentException("Bot token ve App token gerekli.");
    int saved=configs.save(new SlackConfigStore.Config(nextTeam,nextChannel,nextTemplate,"","",enable,version,nextOvertime),bot,app);
    stopInternal();overtimeChannel=nextOvertime;team=nextTeam;channel=nextChannel;template=nextTemplate;version=saved;botToken=bot;appToken=app;credentialSource="DATABASE";state="STOPPED";error="";
    return status();
  }
  public synchronized Map<String,Object> parse(String text){return SlackDefectParser.parse(text,template);}
  public synchronized Map<String,Object> start(Map<String,Object> input){
    if(closed)throw new IllegalStateException("Servis kapanıyor.");
    configure(input,true);desired=true;nextAttempt=0;error="";state="CONNECTING";
    executor.execute(this::tick);return status();
  }
  private static String token(Map<String,Object> input,String name,String old,String prefix){
    Object raw=input.get(name);if(raw==null||raw instanceof String s&&s.isBlank())return old;
    if(!(raw instanceof String value)||value.length()>1024||!value.matches(prefix+"[A-Za-z0-9_-]{10,}"))throw new IllegalArgumentException(name.equals("botToken")?"Bot token xoxb- ile başlamalı; boşluk içermemeli.":"App token xapp- ile başlamalı; boşluk içermemeli.");return value;
  }
  public synchronized Map<String,Object> stop(boolean forget){if(forget){if(version==0)version=configs.save(new SlackConfigStore.Config(team,channel,template,"","",false,0,overtimeChannel),"","");else{configs.forget();version=configs.load(team,channel).version();}}else configs.enabled(false);stopInternal();state="STOPPED";error="";if(forget){botToken="";appToken="";credentialSource="NONE";}return status();}
  private void stopInternal(){desired=false;connecting=false;generation++;connectedAt="";if(socket!=null){socket.abort();socket=null;}}
  private void tick(){
    if(!workerEnabled)return;
    long epoch;String bot,app,expectedTeam,expectedChannel,expectedOvertime;
    synchronized(this){
      if(!desired||closed)return;
      long now=System.currentTimeMillis();
      if(socket!=null){
        if(now-lastFrame>90000){fail(generation,"Slack bağlantısı yanıt vermiyor; yeniden bağlanılacak.");return;}
        if(now-lastPing>30000){lastPing=now;long g=generation;try{socket.sendPing(ByteBuffer.wrap(new byte[]{1})).exceptionally(e->{fail(g,"Slack bağlantısı kesildi; yeniden bağlanılacak.");return null;});}catch(Exception e){fail(g,"Slack bağlantısı kesildi; yeniden bağlanılacak.");}}
        return;
      }
      if(connecting||now<nextAttempt)return;
      connecting=true;state="CONNECTING";epoch=++generation;bot=botToken;app=appToken;expectedTeam=team;expectedChannel=channel;expectedOvertime=overtimeChannel;
    }
    try{
      JsonNode auth=transport.call("auth.test",bot,Map.of());
      if(!expectedTeam.equals(auth.path("team_id").asText())||auth.path("bot_id").asText().isBlank())throw new IllegalStateException("Bot token beklenen Slack çalışma alanına ait değil.");
      // Verify access without importing historical messages. Do not retain the API result.
      transport.call("conversations.history",bot,Map.of("channel",expectedChannel,"limit","1"));
      if(!expectedOvertime.isBlank())transport.call("conversations.history",bot,Map.of("channel",expectedOvertime,"limit","1"));
      String url=transport.call("apps.connections.open",app,Map.of()).path("url").asText();
      synchronized(this){if(epoch!=generation||!desired)return;}
      WebSocket ws=transport.open(url,new Listener(epoch));
      synchronized(this){if(epoch!=generation||!desired){ws.abort();return;}socket=ws;connecting=false;lastFrame=System.currentTimeMillis();lastPing=lastFrame;}
    }catch(Exception e){fail(epoch,e instanceof IllegalStateException?e.getMessage():"Slack bağlantısı kurulamadı.");}
  }
  private synchronized void fail(long epoch,String message){
    if(epoch!=generation||!desired||closed)return;
    generation++;if(socket!=null){socket.abort();socket=null;}connecting=false;state="RETRYING";error=message;connectedAt="";nextAttempt=System.currentTimeMillis()+60000;
  }
  /** Package-visible for deterministic tests. Never exposed as a public webhook. */
  synchronized void receive(JsonNode envelope,long epoch){
    if(epoch!=generation||!desired)return;lastFrame=System.currentTimeMillis();
    String type=envelope.path("type").asText();
    if(type.equals("hello")){state="CONNECTED";error="";connectedAt=Instant.now().toString();return;}
    if(type.equals("disconnect")){fail(epoch,"Slack bağlantıyı yeniliyor; yeniden bağlanılacak.");return;}
    if(!type.equals("events_api"))return;
    JsonNode payload=envelope.path("payload"),event=payload.path("event");
    if(!team.equals(payload.path("team_id").asText())||(!channel.equals(event.path("channel").asText())&&!overtimeChannel.equals(event.path("channel").asText()))||!"message".equals(event.path("type").asText()))return;
    if(event.hasNonNull("bot_id")||event.hasNonNull("subtype")||event.hasNonNull("thread_ts"))return;
    String text=event.path("text").asText(),ts=event.path("ts").asText(),user=event.path("user").asText();
    if(!ts.matches("[0-9]{10,16}\\.[0-9]{1,10}")||!user.matches("[UW][A-Z0-9]{5,30}"))return;
    if(channel.equals(event.path("channel").asText())&&SlackDefectParser.matches(text))inbox.accept(team,channel,ts,user,text,template,version);
    else if(!overtimeChannel.isBlank()&&overtimeChannel.equals(event.path("channel").asText())&&SlackOvertimeParser.matches(text,overtimeChannel))overtime.accept(team,overtimeChannel,ts,user,text,version);
    else return;
    lastReceived=Instant.now().toString();
  }
  private class Listener implements WebSocket.Listener {
    private final long epoch;private final StringBuilder buffer=new StringBuilder();Listener(long epoch){this.epoch=epoch;}
    @Override public void onOpen(WebSocket ws){ws.request(1);}
    @Override public CompletionStage<?> onText(WebSocket ws,CharSequence data,boolean last){
      if(buffer.length()+data.length()>131072){buffer.setLength(0);ws.abort();fail(epoch,"Slack mesaj boyutu sınırı aşıldı.");return null;}
      buffer.append(data);
      CompletionStage<?> acknowledgement=CompletableFuture.completedFuture(null);
      if(last){try{
        JsonNode envelope=mapper.readTree(buffer.toString());String id=envelope.path("envelope_id").asText();
        receive(envelope,epoch);
        // Persist before ACK so a failed database write can be retried by Slack.
        if(!id.isBlank()&&id.length()<200)acknowledgement=ws.sendText(mapper.writeValueAsString(Map.of("envelope_id",id)),true);
      }catch(Exception e){fail(epoch,"Slack mesajı okunamadı; yeniden bağlanılacak.");}finally{buffer.setLength(0);}}
      // Request the next frame only after ACK completes; JDK WebSocket rejects overlapping text sends.
      return acknowledgement.whenComplete((unused,failure)->{if(failure!=null)fail(epoch,"Slack alındı onayı gönderilemedi.");else ws.request(1);});
    }
    @Override public CompletionStage<?> onPong(WebSocket ws,ByteBuffer message){synchronized(SlackPreviewService.this){if(epoch==generation)lastFrame=System.currentTimeMillis();}ws.request(1);return null;}
    @Override public CompletionStage<?> onClose(WebSocket ws,int code,String reason){fail(epoch,"Slack bağlantısı kapandı; yeniden bağlanılacak.");return null;}
    @Override public void onError(WebSocket ws,Throwable error){fail(epoch,"Slack bağlantısı kesildi; yeniden bağlanılacak.");}
  }
  @PreDestroy public synchronized void close(){closed=true;stopInternal();executor.shutdownNow();}
}
