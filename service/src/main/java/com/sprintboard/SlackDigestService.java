package com.sprintboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.*;
import org.springframework.stereotype.Service;

/** Single-instance durable daily delivery journal. Never retries an ambiguous publication. */
@Service @EnableScheduling
public class SlackDigestService {
 static final ZoneId ZONE=ZoneId.of("Europe/Istanbul");
 private final JdbcTemplate db;private final SlackTransport transport;private final SlackConfigStore secrets;private final SprintDigestSnapshot snapshots;private final ObjectMapper mapper;private final Clock clock;
 @Value("${sprintboard.slack.digest.scheduler-enabled:true}") private boolean schedulerEnabled;
 @Value("${sprintboard.slack.bot-token:}") private String fallbackToken;
 @Value("${sprintboard.slack.team-id:}") private String fallbackTeam;
 private volatile boolean ready;
 public SlackDigestService(JdbcTemplate db,SlackTransport transport,SlackConfigStore secrets,SprintDigestSnapshot snapshots,ObjectMapper mapper,Clock clock){this.db=db;this.transport=transport;this.secrets=secrets;this.snapshots=snapshots;this.mapper=mapper;this.clock=clock;}
 record Config(boolean enabled,String channel,String time,boolean weekends,int version){}
 Config config(){return db.queryForObject("SELECT * FROM slack_digest_config WHERE id=1",(r,n)->new Config(r.getBoolean("enabled"),r.getString("channel_id"),r.getString("send_time"),r.getBoolean("weekends"),r.getInt("version")));}
 @EventListener(ApplicationReadyEvent.class) public synchronized void start(){
  db.update("UPDATE slack_digest_run SET state='UNCERTAIN',message='Servis gönderim sırasında yeniden başladı. Çift gönderimi önlemek için kanalı kontrol edin.' WHERE state='PUBLISHING'");
  db.update("UPDATE slack_digest_run SET state='FAILED',message='Gönderim hazırlığı servis yeniden başlatıldığı için tamamlanamadı.' WHERE state='STARTED'");ready=true;
 }
 public Map<String,Object> status(){var c=config();var result=new LinkedHashMap<String,Object>();result.put("enabled",c.enabled);result.put("channelId",c.channel);result.put("sendTime",c.time);result.put("weekends",c.weekends);result.put("version",c.version);result.put("timezone",ZONE.toString());result.put("schedulerEnabled",schedulerEnabled);result.put("nextSendAt",next(c));result.put("history",db.query("SELECT * FROM slack_digest_run ORDER BY created_at DESC,id DESC LIMIT 10",(r,n)->Map.of("id",r.getString("id"),"source",r.getString("source"),"sprintName",Objects.toString(r.getString("sprint_name"),""),"channelId",r.getString("channel_id"),"state",r.getString("state"),"createdAt",r.getString("created_at"),"updatedAt",r.getString("updated_at"),"message",r.getString("message"),"actor",r.getString("actor"))));return result;}
 String next(Config c){
  if(!c.enabled||!schedulerEnabled)return "";var now=clock.instant().atZone(ZONE);
  for(int d=0;d<8;d++){
   var date=now.toLocalDate().plusDays(d);if(!c.weekends&&date.getDayOfWeek().getValue()>5)continue;
   var slot=date.atTime(LocalTime.parse(c.time)).atZone(ZONE);var runs=db.queryForList("SELECT state,attempts,updated_at,channel_id,team_id FROM slack_digest_run WHERE id=?","auto:"+date);
   if(runs.isEmpty())return (slot.isBefore(now)?now:slot).toInstant().toString();
   var r=runs.getFirst();if(d==0&&"FAILED".equals(r.get("STATE"))&&((Number)r.get("ATTEMPTS")).intValue()<3&&c.channel.equals(r.get("CHANNEL_ID"))&&secrets.load(fallbackTeam,"").team().equals(r.get("TEAM_ID"))){var retry=Instant.parse(r.get("UPDATED_AT").toString()).plusSeconds(300);return (retry.isBefore(clock.instant())?clock.instant():retry).toString();}
  }return "";
 }
 @org.springframework.transaction.annotation.Transactional public synchronized Map<String,Object> save(Map<String,Object> input){
  String channel=Objects.toString(input.get("channelId"),"").trim(),time=Objects.toString(input.get("sendTime"),"");
  if(!channel.matches("[CG][A-Z0-9]{5,30}"))throw new IllegalArgumentException("Geçerli bir Slack kanal ID'si girin.");
  if(!time.matches("(?:[01][0-9]|2[0-3]):[0-5][0-9]"))throw new IllegalArgumentException("Gönderim saati HH:mm biçiminde olmalı.");
  if(!(input.get("version") instanceof Number version)||!(input.get("enabled") instanceof Boolean)||!(input.get("weekends") instanceof Boolean))throw new IllegalArgumentException("Ayarlar eksik; sayfayı yenileyin.");
  if(db.update("UPDATE slack_digest_config SET enabled=?,channel_id=?,send_time=?,weekends=?,version=version+1 WHERE id=1 AND version=?",input.get("enabled"),channel,time,input.get("weekends"),version.intValue())!=1)throw new IllegalArgumentException("Ayarlar değişti; yenileyip tekrar deneyin.");
  db.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES(CURRENT_TIMESTAMP,'slack-digest','config','updated',?)",mapper.valueToTree(Map.of("actor",TaskActivity.actor(),"channel",channel,"time",time,"enabled",input.get("enabled"),"weekends",input.get("weekends"))).toString());return status();
 }
 public SprintDigestSnapshot.Snapshot preview(String sprintId){return snapshots.build(sprintId,clock.instant());}
 public synchronized Map<String,Object> manual(String sprintId,String requestId,String actor){return manual(sprintId,requestId,actor,config().channel);}
 public synchronized Map<String,Object> manual(String sprintId,String requestId,String actor,String expectedChannel){
  try{UUID.fromString(requestId);}catch(Exception e){throw new IllegalArgumentException("Geçersiz gönderim kimliği.");}
  String id="manual:"+requestId;
  if(db.queryForObject("SELECT COUNT(*) FROM slack_digest_run WHERE id=?",Integer.class,id)>0)return status();
  var snapshot=snapshots.build(sprintId,clock.instant());if(snapshot==null)throw new IllegalArgumentException("Aktif sprint yok; gönderim yapılmadı.");
  var c=config();if(!c.channel.equals(expectedChannel))throw new IllegalArgumentException("Hedef kanal değişti; gönderim onayını yeniden açın.");var sc=secrets.load(fallbackTeam,"");insert(id,"MANUAL",c,sc.team(),actor);send(id,snapshot,c,sc);return status();
 }
 @Scheduled(fixedDelay=30000,initialDelay=30000) public void scheduled(){if(ready&&schedulerEnabled)tick();}
 synchronized void tick(){
  var c=config();if(!c.enabled)return;var now=clock.instant().atZone(ZONE);if(!c.weekends&&now.getDayOfWeek().getValue()>5||now.toLocalTime().isBefore(LocalTime.parse(c.time)))return;
  String id="auto:"+now.toLocalDate();var existing=db.queryForList("SELECT state,attempts,updated_at,channel_id,team_id FROM slack_digest_run WHERE id=?",id);var sc=secrets.load(fallbackTeam,"");
  if(!existing.isEmpty()){var r=existing.getFirst();if(!"FAILED".equals(r.get("STATE"))||((Number)r.get("ATTEMPTS")).intValue()>=3||!c.channel.equals(r.get("CHANNEL_ID"))||!sc.team().equals(r.get("TEAM_ID"))||Instant.parse(r.get("UPDATED_AT").toString()).plusSeconds(300).isAfter(clock.instant()))return;}
  else {try{insert(id,"AUTO",c,sc.team(),"scheduler");}catch(org.springframework.dao.DuplicateKeyException e){return;}}
  SprintDigestSnapshot.Snapshot snapshot;
  try{snapshot=snapshots.build(null,clock.instant());}
  catch(Exception e){db.update("UPDATE slack_digest_run SET attempts=attempts+1 WHERE id=?",id);finish(id,"FAILED","Sprint özeti hazırlanamadı; kayıtları kontrol edin.");return;}
  if(snapshot==null){finish(id,"SKIPPED","Aktif sprint yok; gönderim atlandı.");return;}
  // A journal failure after publication must never be converted into a retryable FAILED state.
  send(id,snapshot,c,sc);
 }
 private void insert(String id,String source,Config c,String team,String actor){String now=clock.instant().toString();db.update("INSERT INTO slack_digest_run(id,source,channel_id,team_id,state,created_at,updated_at,actor) VALUES(?,?,?,?,'STARTED',?,?,?)",id,source,c.channel,team,now,now,actor);}
 private void finish(String id,String state,String message){db.update("UPDATE slack_digest_run SET state=?,message=?,updated_at=? WHERE id=?",state,message,clock.instant().toString(),id);}
 private void send(String id,SprintDigestSnapshot.Snapshot snapshot,Config c,SlackConfigStore.Config sc){
  boolean publishing=false;db.update("UPDATE slack_digest_run SET sprint_id=?,sprint_name=?,state='STARTED',attempts=attempts+1,updated_at=? WHERE id=?",snapshot.sprintId(),snapshot.name(),clock.instant().toString(),id);
  try{
   String token=sc.version()==0?fallbackToken:secrets.decrypt(sc.bot());if(token==null||token.isBlank())throw new IllegalStateException("Slack bot tokenı kayıtlı değil; Slack bağlantı ayarlarını güncelleyin.");
   var auth=transport.call("auth.test",token,Map.of());if(!sc.team().equals(auth.path("team_id").asText())||auth.path("bot_id").asText().isBlank())throw new IllegalStateException("Bot tokenı seçili Slack çalışma alanına ait değil.");
   byte[] content=snapshot.html().getBytes(StandardCharsets.UTF_8);if(content.length>5_000_000)throw new IllegalStateException("Review HTML 5 MB sınırını aşıyor; fotoğrafların boyutunu azaltın.");
   var upload=transport.call("files.getUploadURLExternal",token,Map.of("filename","sprint-"+snapshot.number()+"-review.html","length",String.valueOf(content.length)));
   String file=upload.path("file_id").asText();if(!file.matches("F[A-Z0-9]+"))throw new IllegalStateException("Slack geçerli bir dosya kimliği döndürmedi.");
   transport.upload(upload.path("upload_url").asText(),content);
   String files=mapper.writeValueAsString(List.of(Map.of("id",file,"title",snapshot.name()+" · Sprint Review")));
   // Persist before the irreversible publication. Restart/timeout after this point is ambiguous.
   finish(id,"PUBLISHING","");publishing=true;
   // Slack ignores blocks when initial_comment is present. Publish only the structured card.
   transport.call("files.completeUploadExternal",token,Map.of("files",files,"channel_id",c.channel,"blocks",mapper.writeValueAsString(snapshot.blocks())));finish(id,"SUCCESS","Sprint özeti ve Review HTML gönderildi.");
  }catch(Exception e){
   String message=publishing?"Gönderim teyit edilemedi. Tekrar göndermeden önce Slack kanalını kontrol edin; otomatik tekrar yapılmaz.":(e instanceof IllegalStateException?Objects.toString(e.getMessage(),"Gönderim başarısız."):"Review HTML gönderilemedi.");
   finish(id,publishing?"UNCERTAIN":"FAILED",message.substring(0,Math.min(500,message.length())));
  }
 }
}
