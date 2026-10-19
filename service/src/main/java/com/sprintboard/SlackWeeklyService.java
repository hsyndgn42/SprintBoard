package com.sprintboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class SlackWeeklyService {
 private final JdbcTemplate db;private final SlackConfigStore configs;private final SlackTransport transport;private final WeeklyOvertimeReport reports;private final ObjectMapper mapper;private final Clock clock;private final boolean enabled;
 private boolean ready;
 record Config(boolean enabled,int weekday,String time,int version,String due){}
 public SlackWeeklyService(JdbcTemplate db,SlackConfigStore configs,SlackTransport transport,WeeklyOvertimeReport reports,ObjectMapper mapper,Clock clock,@Value("${sprintboard.slack.worker-enabled:true}") boolean enabled){this.db=db;this.configs=configs;this.transport=transport;this.reports=reports;this.mapper=mapper;this.clock=clock;this.enabled=enabled;}
 Config config(){return db.queryForObject("SELECT * FROM slack_weekly_config WHERE id=1",(r,n)->new Config(r.getBoolean("enabled"),r.getInt("weekday"),r.getString("send_time"),r.getInt("version"),r.getString("next_due")));}
 static Instant next(int weekday,String time,Instant after){var local=after.atZone(SlackDigestService.ZONE);for(int i=0;i<=7;i++){var day=local.toLocalDate().plusDays(i);var slot=day.atTime(LocalTime.parse(time)).atZone(SlackDigestService.ZONE).toInstant();if(day.getDayOfWeek().getValue()==weekday&&slot.isAfter(after))return slot;}throw new IllegalArgumentException("Gönderim günü geçersiz.");}
 @EventListener(ApplicationReadyEvent.class) public synchronized void start(){
  db.update("UPDATE slack_weekly_run SET state='UNCERTAIN',message='Servis gönderim sırasında yeniden başladı; kanalı kontrol edin.' WHERE state='PUBLISHING'");db.update("UPDATE slack_weekly_run SET state='FAILED',message='Gönderim hazırlığı yarıda kaldı.' WHERE state='STARTED'");
  var c=config();if(c.due.isBlank())db.update("UPDATE slack_weekly_config SET next_due=? WHERE id=1",next(c.weekday,c.time,clock.instant()).toString());ready=true;
 }
 public Map<String,Object> status(){var c=config();var slack=configs.load("","");return Map.of("enabled",c.enabled,"weekday",c.weekday,"sendTime",c.time,"version",c.version,"channelId",slack.overtimeChannel(),"listening",slack.enabled(),"workerEnabled",enabled,"nextSendAt",c.enabled?c.due:"","history",db.queryForList("SELECT * FROM slack_weekly_run ORDER BY created_at DESC,id DESC LIMIT 10"));}
 public synchronized Map<String,Object> save(Map<String,Object> input){
  if(!(input.get("enabled") instanceof Boolean)||!(input.get("weekday") instanceof Number day)||day.doubleValue()!=day.intValue()||day.intValue()<1||day.intValue()>7||!(input.get("version") instanceof Number))throw new IllegalArgumentException("Gün ve ayar bilgilerini kontrol edin.");
  String time=Objects.toString(input.get("sendTime"),"");if(!time.matches("(?:[01][0-9]|2[0-3]):[0-5][0-9]"))throw new IllegalArgumentException("Saat HH:mm biçiminde olmalı.");
  if(Boolean.TRUE.equals(input.get("enabled"))&&configs.load("","").overtimeChannel().isBlank())throw new IllegalArgumentException("Önce mesai kanalını bağlantı ayarlarında kaydedin.");
  if(db.update("UPDATE slack_weekly_config SET enabled=?,weekday=?,send_time=?,version=version+1,next_due=? WHERE id=1 AND version=?",input.get("enabled"),day.intValue(),time,next(day.intValue(),time,clock.instant()).toString(),((Number)input.get("version")).intValue())!=1)throw new IllegalArgumentException("Ayarlar değişti; yenileyip tekrar deneyin.");
  db.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES(CURRENT_TIMESTAMP,'slack-weekly','config','updated',?)",mapper.valueToTree(Map.of("actor",TaskActivity.actor(),"weekday",day.intValue(),"time",time,"enabled",input.get("enabled"))).toString());return status();
 }
 public WeeklyOvertimeReport.Report preview(){return reports.build(WeeklyOvertimeReport.previousMonday(clock.instant().atZone(SlackDigestService.ZONE).toLocalDate()),clock.instant());}
 public synchronized Map<String,Object> manual(Map<String,Object> input,String actor){
  String request=Objects.toString(input.get("requestId"),"");try{UUID.fromString(request);}catch(Exception e){throw new IllegalArgumentException("Geçersiz gönderim kimliği.");}
  String id="manual:"+request;if(db.queryForObject("SELECT COUNT(*) FROM slack_weekly_run WHERE id=?",Integer.class,id)>0)return status();
  var c=configs.load("","");if(!c.overtimeChannel().equals(input.get("channelId")))throw new IllegalArgumentException("Mesai kanalı değişti; onayı yeniden açın.");
  validate(c);var report=preview();insert(id,"MANUAL",report.from(),report.to(),c,actor);send(id,report,c);return status();
 }
 private void validate(SlackConfigStore.Config c){if(!c.enabled()||c.bot().isBlank()||c.overtimeChannel().isBlank())throw new IllegalArgumentException("Mesai kanalını ve Slack dinlemesini etkinleştirin.");}
 @Scheduled(fixedDelay=30000,initialDelay=30000) public void scheduled(){if(ready&&enabled)tick();}
 synchronized void tick(){
  var cfg=config();if(!cfg.enabled||cfg.due.isBlank()||clock.instant().isBefore(Instant.parse(cfg.due)))return;
  var c=configs.load("","");if(!c.enabled()||c.bot().isBlank()||c.overtimeChannel().isBlank())return;
  // After long downtime send only the latest due week, never a burst of stale reports.
  Instant due=Instant.parse(cfg.due);while(!next(cfg.weekday,cfg.time,due).isAfter(clock.instant()))due=next(cfg.weekday,cfg.time,due);
  String id="auto:"+due.atZone(SlackDigestService.ZONE).toLocalDate();var runs=db.queryForList("SELECT * FROM slack_weekly_run WHERE id=?",id);
  if(!runs.isEmpty()){
   var run=runs.getFirst();if(!"FAILED".equals(run.get("STATE"))||((Number)run.get("ATTEMPTS")).intValue()>=3||!c.team().equals(run.get("TEAM_ID"))||!c.overtimeChannel().equals(run.get("CHANNEL_ID"))){advance(cfg,due);return;}
   if(Instant.parse(run.get("UPDATED_AT").toString()).plusSeconds(300).isAfter(clock.instant()))return;
  }
  LocalDate from=WeeklyOvertimeReport.previousMonday(due.atZone(SlackDigestService.ZONE).toLocalDate());
  if(runs.isEmpty())insert(id,"AUTO",from.toString(),from.plusDays(6).toString(),c,"scheduler");
  WeeklyOvertimeReport.Report report;
  try{report=reports.build(from,clock.instant());}catch(Exception e){finish(id,"FAILED","Mesai raporu hazırlanamadı; kayıtları kontrol edin.");db.update("UPDATE slack_weekly_run SET attempts=attempts+1 WHERE id=?",id);return;}
  send(id,report,c);
  if(!"FAILED".equals(db.queryForObject("SELECT state FROM slack_weekly_run WHERE id=?",String.class,id)))advance(cfg,due);
 }
 private void advance(Config cfg,Instant due){db.update("UPDATE slack_weekly_config SET next_due=? WHERE id=1 AND version=?",next(cfg.weekday,cfg.time,due).toString(),cfg.version);}
 private void insert(String id,String source,String from,String to,SlackConfigStore.Config c,String actor){db.update("INSERT INTO slack_weekly_run(id,source,team_id,channel_id,period_start,period_end,state,created_at,updated_at,actor) VALUES(?,?,?,?,?,?,'STARTED',?,?,?)",id,source,c.team(),c.overtimeChannel(),from,to,clock.instant().toString(),clock.instant().toString(),actor);}
 private void finish(String id,String state,String message){db.update("UPDATE slack_weekly_run SET state=?,message=?,updated_at=? WHERE id=?",state,message,clock.instant().toString(),id);}
 private void send(String id,WeeklyOvertimeReport.Report report,SlackConfigStore.Config c){
  boolean publishing=false;db.update("UPDATE slack_weekly_run SET state='STARTED',attempts=attempts+1,updated_at=? WHERE id=?",clock.instant().toString(),id);
  try{
   String token=configs.decrypt(c.bot());var auth=transport.call("auth.test",token,Map.of());if(!c.team().equals(auth.path("team_id").asText())||auth.path("bot_id").asText().isBlank())throw new IllegalStateException();
   byte[] bytes=report.html().getBytes(StandardCharsets.UTF_8);if(bytes.length>5_000_000)throw new IllegalStateException();
   var upload=transport.call("files.getUploadURLExternal",token,Map.of("filename","mesai-"+report.from()+".html","length",Integer.toString(bytes.length)));String file=upload.path("file_id").asText();if(!file.matches("F[A-Z0-9]+"))throw new IllegalStateException();transport.upload(upload.path("upload_url").asText(),bytes);
   var fresh=configs.load("","");if(!fresh.enabled()||fresh.version()!=c.version())throw new IllegalStateException();
   finish(id,"PUBLISHING","");publishing=true;
   transport.call("files.completeUploadExternal",token,Map.of("files",mapper.writeValueAsString(List.of(Map.of("id",file,"title","Haftalık mesai · "+report.from()+" – "+report.to()))),"channel_id",c.overtimeChannel(),"blocks",mapper.writeValueAsString(report.blocks())));
   finish(id,"SUCCESS","Mesai özeti ve kişi bazlı HTML raporu gönderildi.");
  }catch(Exception e){finish(id,publishing?"UNCERTAIN":"FAILED",publishing?"Gönderim teyit edilemedi; çift gönderimi önlemek için Slack kanalını kontrol edin. Otomatik tekrar yapılmaz.":"Gönderim başarısız. Bot/kanal üyeliği, files:write izni ve bağlantıyı kontrol edin.");}
 }
}
