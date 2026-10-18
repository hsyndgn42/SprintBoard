package com.sprintboard;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Durable, idempotent receipt reaction; unrelated to admin approval or task completion. */
@Service
public class SlackReceiptService {
 private static final String WARNING="Slack alındı tiki eklenemedi. Botun kanal üyeliğini, bağlantıyı ve reactions:write iznini kontrol edin; izin ekledikten sonra Reinstall to Workspace yapın. Onay kaydı korunuyor; yeniden denenecek.";
 private final JdbcTemplate db;private final SlackConfigStore configs;private final SlackTransport transport;
 private final ScheduledExecutorService worker=Executors.newSingleThreadScheduledExecutor(r->{var t=new Thread(r,"slack-receipts");t.setDaemon(true);return t;});
 private int version=-1;private String verifiedTeam="";private long nextAttempt;
 public SlackReceiptService(JdbcTemplate db,SlackConfigStore configs,SlackTransport transport,
   @org.springframework.beans.factory.annotation.Value("${sprintboard.slack.worker-enabled:true}") boolean enabled){
  this.db=db;this.configs=configs;this.transport=transport;
  if(enabled)worker.scheduleWithFixedDelay(this::safeTick,5,5,TimeUnit.SECONDS);
 }
 // Called in the inbox transaction, only for newly persisted, valid messages.
 static void enqueue(JdbcTemplate db,String team,String channel,String ts){
  db.update("INSERT INTO slack_receipt_reaction(source_key,team_id,channel_id,message_ts,created_at) VALUES(?,?,?,?,?)",team+":"+channel+":"+ts,team,channel,ts,Instant.now().toString());
 }
 public Map<String,Object> status(){
  var c=configs.load("","");String filter=" WHERE team_id=? AND channel_id IN (?,?,?) AND state='PENDING'";
  int pending=db.queryForObject("SELECT COUNT(*) FROM slack_receipt_reaction"+filter,Integer.class,c.team(),c.channel(),c.overtimeChannel(),c.backlogChannel());
  int failed=db.queryForObject("SELECT COUNT(*) FROM slack_receipt_reaction"+filter+" AND last_error<>''",Integer.class,c.team(),c.channel(),c.overtimeChannel(),c.backlogChannel());
  return Map.of("receiptPending",pending,"receiptError",failed>0?WARNING:"");
 }
 void safeTick(){try{tick();}catch(Exception ignored){nextAttempt=System.currentTimeMillis()+60000;}}
 synchronized void tick(){
  var c=configs.load("","");if(!c.enabled()||c.bot().isBlank())return;
  boolean changed=c.version()!=version;
  if(changed){version=c.version();verifiedTeam="";nextAttempt=0;}
  long now=System.currentTimeMillis();if(now<nextAttempt)return;
  var rows=db.queryForList("SELECT * FROM slack_receipt_reaction WHERE state='PENDING' AND team_id=? AND channel_id IN (?,?,?) AND (next_attempt<=? OR ?) ORDER BY next_attempt,created_at,source_key LIMIT 1",c.team(),c.channel(),c.overtimeChannel(),c.backlogChannel(),now,changed);
  if(rows.isEmpty())return;
  var row=rows.getFirst();String key=row.get("SOURCE_KEY").toString();
  try{
   String token=configs.decrypt(c.bot());
   if(!c.team().equals(verifiedTeam)){
    var auth=transport.call("auth.test",token,Map.of());
    if(!c.team().equals(auth.path("team_id").asText())||auth.path("bot_id").asText().isBlank())throw new IllegalStateException("Workspace mismatch");
    verifiedTeam=c.team();
   }
   var latest=configs.load("","");if(latest.version()!=c.version()||!latest.enabled())return;
   transport.call("reactions.add",token,Map.of("channel",row.get("CHANNEL_ID").toString(),"timestamp",row.get("MESSAGE_TS").toString(),"name","white_check_mark"));
   db.update("UPDATE slack_receipt_reaction SET state='SENT',sent_at=?,attempts=attempts+1,last_error='' WHERE source_key=?",Instant.now().toString(),key);
  }catch(Exception ignored){
   // Never echo token-bearing exception text; retries are safe even if Slack accepted a timed-out call.
   nextAttempt=now+60000;
   db.update("UPDATE slack_receipt_reaction SET attempts=attempts+1,next_attempt=?,last_error=? WHERE source_key=?",now+300000,WARNING,key);
  }
 }
 @jakarta.annotation.PreDestroy public void close(){worker.shutdownNow();}
}
