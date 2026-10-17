package com.sprintboard;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;

/** Resolves only known defect senders, outside the Socket Mode ACK and approval transactions. */
@Service
public class SlackReporterService {
 private final JdbcTemplate db;private final SlackConfigStore configs;private final SlackTransport transport;private final TransactionTemplate transaction;
 private final ScheduledExecutorService worker=Executors.newSingleThreadScheduledExecutor(r->{var t=new Thread(r,"slack-reporter");t.setDaemon(true);return t;});
 private final Map<String,Long> unavailable=new HashMap<>();
 private volatile String error="";private volatile long nextAttempt;private int version=-1;private String verifiedTeam="";
 public SlackReporterService(JdbcTemplate db,SlackConfigStore configs,SlackTransport transport,PlatformTransactionManager manager,@org.springframework.beans.factory.annotation.Value("${sprintboard.slack.resolve-names:true}") boolean enabled){
  this.db=db;this.configs=configs;this.transport=transport;this.transaction=new TransactionTemplate(manager);
  if(enabled)worker.scheduleWithFixedDelay(this::safeTick,20,10,TimeUnit.SECONDS);
 }
 public Map<String,Object> status(){return Map.of("reporterError",error);}
 public void retry(){worker.execute(()->{unavailable.clear();nextAttempt=0;safeTick();});}
 void safeTick(){try{tick();}catch(Exception ignored){error="Slack kişi adları alınamadı. Bağlantı ve users:read iznini kontrol edin.";nextAttempt=System.currentTimeMillis()+300000;}}
 void tick(){
  var c=configs.load("","");if(c.bot().isBlank()||!c.enabled())return;
  if(c.version()!=version){version=c.version();verifiedTeam="";nextAttempt=0;unavailable.clear();error="";}
  if(System.currentTimeMillis()<nextAttempt)return;
  var users=db.queryForList("SELECT user_id FROM slack_inbox WHERE team_id=? AND reporter_name IS NULL UNION SELECT reporter_id FROM defect_detail WHERE reporter_team_id=? AND reporter_name IS NULL AND reporter_id IS NOT NULL UNION SELECT user_id FROM slack_overtime_inbox WHERE team_id=? AND reporter_name IS NULL ORDER BY 1 LIMIT 1000",String.class,c.team(),c.team(),c.team());
  if(users.isEmpty()){error="";return;}var candidates=users.stream().filter(u->unavailable.getOrDefault(u,0L)<=System.currentTimeMillis()).toList();if(candidates.isEmpty())return;String user=candidates.getFirst();
  var cached=db.queryForList("SELECT reporter_name FROM slack_inbox WHERE team_id=? AND user_id=? AND reporter_name IS NOT NULL UNION SELECT reporter_name FROM defect_detail WHERE reporter_team_id=? AND reporter_id=? AND reporter_name IS NOT NULL UNION SELECT reporter_name FROM slack_overtime_inbox WHERE team_id=? AND user_id=? AND reporter_name IS NOT NULL LIMIT 1",String.class,c.team(),user,c.team(),user,c.team(),user);
  String name;
  if(!cached.isEmpty())name=cached.getFirst();
  else {
   String token=configs.decrypt(c.bot());
   if(!c.team().equals(verifiedTeam)){
    if(!c.team().equals(transport.call("auth.test",token,Map.of()).path("team_id").asText()))throw new IllegalStateException("Workspace mismatch");
    verifiedTeam=c.team();
   }
   var result=transport.call("users.info",token,Map.of("user",user));var person=result.path("user");
   if(!user.equals(person.path("id").asText()))throw new IllegalStateException("User mismatch");
   name=fullName(person);
   if(name.isBlank()){error="Slack profilinde ad soyad bulunamadı; profilin tam ad alanını doldurun.";unavailable.put(user,System.currentTimeMillis()+300000);return;}
  }
  var latest=configs.load("","");if(latest.version()!=c.version()||!latest.enabled())return;
  String resolved=name;
  transaction.executeWithoutResult(s->{
   db.update("UPDATE slack_inbox SET reporter_name=? WHERE team_id=? AND user_id=? AND reporter_name IS NULL",resolved,c.team(),user);
   db.update("UPDATE slack_overtime_inbox SET reporter_name=? WHERE team_id=? AND user_id=? AND reporter_name IS NULL",resolved,c.team(),user);
   db.update("UPDATE defect_detail SET reporter_name=? WHERE reporter_team_id=? AND reporter_id=? AND reporter_name IS NULL",resolved,c.team(),user);
  });error="";
 }
 static String fullName(JsonNode user){
  String name=user.path("profile").path("real_name").asText("").strip();
  if(name.isBlank())name=user.path("real_name").asText("").strip();
  if(name.isBlank())name=(user.path("profile").path("first_name").asText("")+" "+user.path("profile").path("last_name").asText("")).strip();
  name=name.replaceAll("[\\p{Cntrl}\\p{Cf}]","").strip();return name.length()>300?name.substring(0,300):name;
 }
 @jakarta.annotation.PreDestroy public void close(){worker.shutdownNow();}
}
