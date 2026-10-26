package com.sprintboard;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class JiraConfigStore {
 /** Verified live against TDEF; kept editable because other squads may use another component. */
 public static final String DEFAULT_DEFECT_JQL="project = TDEF AND component = \"Vibe-Fix\" ORDER BY created DESC";
 /** Field ids and option ids confirmed by creating VBCRF-776 on the live server. */
 public static final String DEFAULT_FIELDS="""
 {"sizePoints":{"SMALL":1,"MEDIUM":3,"LARGE":5,"X-LARGE":8},
  "bauPoints":{"bau-meeting":8,"bau-support":8,"bau-training":8,"bau-leave":1},
  "pbiTypeByCategory":{"DEV":"30023","DESIGN":"30023","ANALYZE":"30023","TEST":"30023","DEFECT":"30025","BAU":"30024","OTHER":"30023"},
  "businessValueByPriority":{"CRITICAL":"30013","HIGH":"30013","NORMAL":"30013","LOW":"30013","UNSET":"30013"},
  "priorityByRoadmapPriority":{"CRITICAL":"2","HIGH":"10000","NORMAL":"3","LOW":"4","UNSET":"3"},
  "epicIssueTypeId":"238","epicNameFieldId":"customfield_12874",
  "epicExtraFields":{"customfield_30186":{"id":"33344"}},
  "tcTaskFieldId":"customfield_10356","defaultTcTaskId":"",
  "kpiIssueKey":"RRCA-11438","checklistOptionId":"39621","fallbackEpicKey":""}""";

 private final JdbcTemplate db; private final JiraSecretVault vault;
 public JiraConfigStore(JdbcTemplate db,JiraSecretVault vault){this.db=db;this.vault=vault;}

 /** patConfigured replaces the token itself; the secret never travels back to the browser. */
 public record Config(String baseUrl,String projectKey,String boardId,String defectJql,String fieldDefaults,boolean enabled,int version,boolean patConfigured){}

 public Config load(){
  var rows=db.query("SELECT * FROM jira_config WHERE id=1",(r,n)->new Config(trimUrl(r.getString("base_url")),r.getString("project_key"),r.getString("board_id"),r.getString("defect_jql"),r.getString("field_defaults"),r.getBoolean("enabled"),r.getInt("version"),!r.getString("pat_secret").isBlank()));
  return rows.isEmpty()?new Config("","","",DEFAULT_DEFECT_JQL,DEFAULT_FIELDS,false,0,false):rows.getFirst();
 }

 /** Every caller appends its own path, so a trailing slash would produce a double slash. */
 static String trimUrl(String value){
  String trimmed=value==null?"":value.trim();
  while(trimmed.endsWith("/"))trimmed=trimmed.substring(0,trimmed.length()-1);
  return trimmed;
 }

 public String token(){
  var rows=db.query("SELECT pat_secret FROM jira_config WHERE id=1",(r,n)->r.getString("pat_secret"));
  if(rows.isEmpty()||rows.getFirst().isBlank())throw new IllegalArgumentException("Jira kişisel erişim tokenı girilmemiş.");
  return vault.decrypt(rows.getFirst());
 }

 @Transactional public int save(Config c,String pat){
  String baseUrl=trimUrl(c.baseUrl()),project=c.projectKey().trim().toUpperCase(Locale.ROOT),jql=c.defectJql().trim();
  if(!baseUrl.isEmpty()&&!baseUrl.startsWith("https://"))throw new IllegalArgumentException("Jira adresi https:// ile başlamalı.");
  if(!project.isEmpty()&&!project.matches("[A-Z][A-Z0-9_]{1,20}"))throw new IllegalArgumentException("Jira proje anahtarı geçersiz. Örn. VBCRF");
  if(c.enabled()&&(baseUrl.isEmpty()||project.isEmpty()))throw new IllegalArgumentException("Entegrasyonu açmadan önce Jira adresi ve proje anahtarı girilmeli.");
  if(jql.isEmpty())jql=DEFAULT_DEFECT_JQL;
  String fields=c.fieldDefaults()==null||c.fieldDefaults().isBlank()?DEFAULT_FIELDS:c.fieldDefaults();
  if(c.version()==0){
   if(c.enabled()&&pat.isBlank())throw new IllegalArgumentException("Entegrasyonu açmadan önce bir token girilmeli.");
   try{db.update("INSERT INTO jira_config(id,base_url,project_key,board_id,pat_secret,defect_jql,field_defaults,enabled,version) VALUES(1,?,?,?,?,?,?,?,1)",baseUrl,project,c.boardId().trim(),vault.encrypt(pat),jql,fields,c.enabled());}
   catch(org.springframework.dao.DuplicateKeyException e){throw new IllegalArgumentException("Jira ayarları değişti; sayfayı yenileyin.");}
   return 1;
  }
  // An empty token means "leave it as it is"; the form never receives the stored value back.
  int updated=pat.isBlank()
   ?db.update("UPDATE jira_config SET base_url=?,project_key=?,board_id=?,defect_jql=?,field_defaults=?,enabled=?,version=version+1 WHERE id=1 AND version=?",baseUrl,project,c.boardId().trim(),jql,fields,c.enabled(),c.version())
   :db.update("UPDATE jira_config SET base_url=?,project_key=?,board_id=?,pat_secret=?,defect_jql=?,field_defaults=?,enabled=?,version=version+1 WHERE id=1 AND version=?",baseUrl,project,c.boardId().trim(),vault.encrypt(pat),jql,fields,c.enabled(),c.version());
  if(updated!=1)throw new IllegalArgumentException("Jira ayarları değişti; sayfayı yenileyin.");
  if(c.enabled()&&pat.isBlank()&&!load().patConfigured())throw new IllegalArgumentException("Entegrasyonu açmadan önce bir token girilmeli.");
  return c.version()+1;
 }

 public void forget(){db.update("UPDATE jira_config SET pat_secret='',enabled=false,version=version+1 WHERE id=1");}
}
