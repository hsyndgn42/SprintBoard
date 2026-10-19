package com.sprintboard;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** Durable, bounded-page catch-up. Checkpoints advance only after the entire window is read. */
@Service
public class SlackHistoryService {
 private final JdbcTemplate db; private final SlackConfigStore configs; private final SlackTransport transport;
 private final SlackInboxService defects; private final SlackOvertimeService overtime; private final SlackBacklogService backlog;
 private final Clock clock; private final boolean enabled;
 private Instant nextCall=Instant.EPOCH;
 public SlackHistoryService(JdbcTemplate db,SlackConfigStore configs,SlackTransport transport,SlackInboxService defects,SlackOvertimeService overtime,SlackBacklogService backlog,Clock clock,@Value("${sprintboard.slack.worker-enabled:true}") boolean enabled){
  this.db=db;this.configs=configs;this.transport=transport;this.defects=defects;this.overtime=overtime;this.backlog=backlog;this.clock=clock;this.enabled=enabled;
 }
 static Map<String,String> channels(SlackConfigStore.Config c){var m=new LinkedHashMap<String,String>();if(!c.channel().isBlank())m.put("DEFECT",c.channel());if(!c.overtimeChannel().isBlank())m.put("OVERTIME",c.overtimeChannel());if(!c.backlogChannel().isBlank())m.put("BACKLOG",c.backlogChannel());return m;}
 private String scope(SlackConfigStore.Config c,String kind,String channel){return c.team()+":"+channel+":"+kind;}
 public Map<String,Object> status(){return Map.of("workerEnabled",enabled,"listening",configs.load("","").enabled(),"initialLookbackDays",7,"history",db.queryForList("SELECT id,channel_id,kind,source,state,scanned,matched,message,oldest,latest,created_at,updated_at FROM slack_history_job ORDER BY created_at DESC,id DESC LIMIT 12"));}
 public synchronized Map<String,Object> scan(Map<String,Object> input,String actor){
  var c=configs.load("","");if(!c.enabled()||c.bot().isBlank())throw new IllegalArgumentException("Önce Slack ayarlarını kaydedip dinlemeyi başlatın.");
  LocalDate from,to;try{from=LocalDate.parse(Objects.toString(input.get("from"),""));to=LocalDate.parse(Objects.toString(input.get("to"),""));}catch(Exception e){throw new IllegalArgumentException("Başlangıç ve bitiş tarihlerini seçin.");}
  var today=clock.instant().atZone(SlackDigestService.ZONE).toLocalDate();
  if(to.isBefore(from)||to.isAfter(today)||from.isBefore(to.minusDays(90)))throw new IllegalArgumentException("En fazla 91 günlük, geleceğe taşmayan bir aralık seçin. Daha eski dönemleri ayrı tarayabilirsiniz.");
  String request=Objects.toString(input.get("requestId"),"");try{UUID.fromString(request);}catch(Exception e){throw new IllegalArgumentException("Geçersiz tarama kimliği.");}
  Instant end=to.plusDays(1).atStartOfDay(SlackDigestService.ZONE).toInstant().minusNanos(1000);
  String oldest=ts(from.atStartOfDay(SlackDigestService.ZONE).toInstant());String latest=ts(end.isAfter(clock.instant())?clock.instant():end);
  for(var entry:channels(c).entrySet())insert("manual:"+request+":"+entry.getKey(),c,entry.getKey(),entry.getValue(),"MANUAL",oldest,latest,actor);
  return status();
 }
 private void insert(String id,SlackConfigStore.Config c,String kind,String channel,String source,String from,String to,String actor){
  try{db.update("INSERT INTO slack_history_job(id,scope_key,team_id,channel_id,kind,source,oldest,latest,page_latest,created_at,updated_at,next_at,actor) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",id,scope(c,kind,channel),c.team(),channel,kind,source,from,to,to,clock.instant().toString(),clock.instant().toString(),clock.instant().toString(),actor);}catch(org.springframework.dao.DuplicateKeyException ignored){}
 }
 static String ts(Instant instant){return instant.getEpochSecond()+"."+String.format(Locale.ROOT,"%06d",instant.getNano()/1000);}
 @Scheduled(fixedDelay=10000,initialDelay=20000) public void scheduled(){if(enabled)tick();}
 synchronized void tick(){
  var c=configs.load("","");if(!c.enabled()||c.bot().isBlank()||clock.instant().isBefore(nextCall))return;
  var now=clock.instant();var watched=channels(c);
  // Never run a queued job for a formerly configured team/channel.
  for(var job:db.queryForList("SELECT id,team_id,channel_id,kind FROM slack_history_job WHERE state IN ('PENDING','RETRY')"))if(!c.team().equals(job.get("TEAM_ID"))||!Objects.equals(watched.get(job.get("KIND")),job.get("CHANNEL_ID")))db.update("UPDATE slack_history_job SET state='CANCELLED',message='Kanal ayarı değişti; tarama durduruldu.',updated_at=? WHERE id=?",now.toString(),job.get("ID"));
  for(var e:watched.entrySet()){
   String key=scope(c,e.getKey(),e.getValue());if(db.queryForObject("SELECT COUNT(*) FROM slack_history_job WHERE scope_key=? AND source='AUTO' AND state IN ('PENDING','RETRY')",Integer.class,key)>0)continue;
   var checkpoint=db.queryForList("SELECT completed_until FROM slack_history_checkpoint WHERE scope_key=?",String.class,key);
   Instant from=checkpoint.isEmpty()?now.minus(Duration.ofDays(7)):Instant.ofEpochSecond(new BigDecimal(checkpoint.getFirst()).longValue()).minusSeconds(60);
   if(from.plusSeconds(240).isAfter(now))continue;
   insert("auto:"+UUID.randomUUID(),c,e.getKey(),e.getValue(),"AUTO",ts(from),ts(now),"scheduler");
  }
  var rows=db.queryForList("SELECT * FROM slack_history_job WHERE state IN ('PENDING','RETRY') AND next_at<=? ORDER BY next_at,created_at,id LIMIT 1",now.toString());if(rows.isEmpty())return;
  var job=rows.getFirst();String id=job.get("ID").toString();nextCall=now.plusSeconds(65);
  try{
   String token=configs.decrypt(c.bot());var auth=transport.call("auth.test",token,Map.of());
   if(!c.team().equals(auth.path("team_id").asText())||auth.path("bot_id").asText().isBlank())throw new IllegalStateException("Token seçili çalışma alanına ait değil.");
   var fields=new HashMap<String,String>();fields.put("channel",job.get("CHANNEL_ID").toString());fields.put("oldest",job.get("OLDEST").toString());fields.put("latest",job.get("PAGE_LATEST").toString());fields.put("inclusive","true");fields.put("limit","15");if(!job.get("PAGE_CURSOR").toString().isBlank())fields.put("cursor",job.get("PAGE_CURSOR").toString());
   var result=transport.call("conversations.history",token,fields);
   var fresh=configs.load("","");if(!fresh.enabled()||fresh.version()!=c.version())return;
   if(!result.path("messages").isArray())throw new IllegalStateException("Slack mesaj listesi alınamadı.");
   int matched=0;String minimum=job.get("PAGE_LATEST").toString();
   for(var message:result.path("messages")){
    String timestamp=message.path("ts").asText();if(timestamp.matches("[0-9]{10,16}\\.[0-9]{1,10}")&&new BigDecimal(timestamp).compareTo(new BigDecimal(minimum))<0)minimum=timestamp;
    if(accept(c,job.get("KIND").toString(),job.get("CHANNEL_ID").toString(),message))matched++;
   }
   String cursor=result.path("response_metadata").path("next_cursor").asText();boolean more=result.path("has_more").asBoolean()||!cursor.isBlank();
   if(more&&cursor.isBlank()&&minimum.equals(job.get("PAGE_LATEST")))throw new IllegalStateException("Geçmiş taraması ilerlemedi; yeniden denenecek.");
   // All accepts have committed. Persist checkpoint before completion: a crash only replays this window.
   if(!more&&"AUTO".equals(job.get("SOURCE")))db.update("MERGE INTO slack_history_checkpoint(scope_key,completed_until) KEY(scope_key) VALUES(?,?)",job.get("SCOPE_KEY"),job.get("LATEST"));
   db.update("UPDATE slack_history_job SET state=?,page_cursor=?,page_latest=?,scanned=scanned+?,matched=matched+?,message='',updated_at=?,next_at=? WHERE id=?",more?"PENDING":"SUCCESS",cursor,cursor.isBlank()?minimum:job.get("PAGE_LATEST"),result.path("messages").size(),matched,now.toString(),now.plusSeconds(65).toString(),id);
   db.update("DELETE FROM slack_history_job WHERE state IN ('SUCCESS','CANCELLED') AND updated_at<?",now.minus(Duration.ofDays(30)).toString());
  }catch(Exception e){
   long seconds=e instanceof SlackTransport.RateLimited r?r.seconds:300;nextCall=now.plusSeconds(seconds);
   // Expired Slack cursors are safe to discard: replay is idempotent.
   if(e instanceof SlackTransport.InvalidCursor)db.update("UPDATE slack_history_job SET page_cursor='',page_latest=latest WHERE id=?",id);
   db.update("UPDATE slack_history_job SET state='RETRY',message=?,updated_at=?,next_at=? WHERE id=?",e instanceof SlackTransport.RateLimited?e.getMessage():"Tarama tamamlanamadı; bağlantı/kanal izinlerini kontrol edin. Kayıtlar korunarak tekrar denenecek.",now.toString(),nextCall.toString(),id);
  }
 }
 boolean accept(SlackConfigStore.Config c,String kind,String channel,JsonNode message){
  if(!"message".equals(message.path("type").asText())||message.has("bot_id")||!message.path("subtype").asText().isBlank()||(message.has("thread_ts")&&!message.path("thread_ts").asText().equals(message.path("ts").asText())))return false;
  String ts=message.path("ts").asText(),user=message.path("user").asText(),text=message.path("text").asText();if(!ts.matches("[0-9]{10,16}\\.[0-9]{1,10}")||!user.matches("[UW][A-Z0-9]{5,30}"))return false;
  if(kind.equals("DEFECT")&&SlackDefectParser.matches(text))defects.accept(c.team(),channel,ts,user,text,c.template(),c.version());
  else if(kind.equals("OVERTIME")&&SlackOvertimeParser.matches(text,channel))overtime.accept(c.team(),channel,ts,user,text,c.version());
  else if(kind.equals("BACKLOG")&&SlackBacklogParser.matches(text,channel))backlog.accept(c.team(),channel,ts,user,text,c.backlogTemplate(),c.version());
  else return false;return true;
 }
}
