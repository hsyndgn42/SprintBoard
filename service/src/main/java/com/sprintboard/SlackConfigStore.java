package com.sprintboard;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SlackConfigStore {
 private final JdbcTemplate db;private final SlackSecretVault vault;
 public SlackConfigStore(JdbcTemplate db,SlackSecretVault vault){this.db=db;this.vault=vault;}
 public record Config(String team,String channel,String template,String bot,String app,boolean enabled,int version,String overtimeChannel){
  public Config(String team,String channel,String template,String bot,String app,boolean enabled,int version){this(team,channel,template,bot,app,enabled,version,"");}
 }
 public Config load(String team,String channel){var rows=db.query("SELECT * FROM slack_config WHERE id=1",(r,n)->new Config(r.getString("team_id"),r.getString("channel_id"),r.getString("template"),r.getString("bot_secret"),r.getString("app_secret"),r.getBoolean("enabled"),r.getInt("version"),r.getString("overtime_channel_id")));return rows.isEmpty()?new Config(team,channel,SlackDefectParser.DEFAULT_TEMPLATE,"","",false,0):rows.getFirst();}
 public String decrypt(String value){return vault.decrypt(value);}
 @Transactional public int save(Config c,String bot,String app){
  String b=vault.encrypt(bot),a=vault.encrypt(app);
  if(c.version()==0){try{db.update("INSERT INTO slack_config(id,team_id,channel_id,template,bot_secret,app_secret,enabled,version,overtime_channel_id) VALUES(1,?,?,?,?,?,?,1,?)",c.team(),c.channel(),c.template(),b,a,c.enabled(),c.overtimeChannel());}catch(org.springframework.dao.DuplicateKeyException e){throw new IllegalArgumentException("Slack ayarları değişti; sayfayı yenileyin.");}return 1;}
  if(db.update("UPDATE slack_config SET team_id=?,channel_id=?,template=?,bot_secret=?,app_secret=?,enabled=?,overtime_channel_id=?,version=version+1 WHERE id=1 AND version=?",c.team(),c.channel(),c.template(),b,a,c.enabled(),c.overtimeChannel(),c.version())!=1)throw new IllegalArgumentException("Slack ayarları değişti; sayfayı yenileyin.");return c.version()+1;
 }
 public void enabled(boolean enabled){db.update("UPDATE slack_config SET enabled=? WHERE id=1",enabled);}
 public void forget(){db.update("UPDATE slack_config SET bot_secret='',app_secret='',enabled=false,version=version+1 WHERE id=1");}
}
