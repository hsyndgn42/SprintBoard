package com.sprintboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Settings screen behind /api/admin/jira: stores configuration and proves the connection works. */
@Service
public class JiraSettingsService {
 private final JiraConfigStore configs; private final JiraTransport transport; private final JdbcTemplate db; private final ObjectMapper mapper; private final Clock clock;
 public JiraSettingsService(JiraConfigStore configs,JiraTransport transport,JdbcTemplate db,ObjectMapper mapper,Clock clock){this.configs=configs;this.transport=transport;this.db=db;this.mapper=mapper;this.clock=clock;}

 public Map<String,Object> status(){
  var c=configs.load();
  var status=new LinkedHashMap<String,Object>();
  status.put("baseUrl",c.baseUrl());status.put("projectKey",c.projectKey());status.put("boardId",c.boardId());
  status.put("defectJql",c.defectJql());status.put("fieldDefaults",c.fieldDefaults());
  status.put("enabled",c.enabled());status.put("version",c.version());status.put("patConfigured",c.patConfigured());
  return status;
 }

 public Map<String,Object> save(Map<String,Object> input){
  String fields=text(input,"fieldDefaults");
  if(!fields.isEmpty()){try{mapper.readTree(fields);}catch(Exception e){throw new IllegalArgumentException("Alan varsayılanları geçerli bir JSON olmalı.");}}
  var next=new JiraConfigStore.Config(text(input,"baseUrl"),text(input,"projectKey"),text(input,"boardId"),text(input,"defectJql"),fields,flag(input,"enabled"),number(input,"version"),false);
  String pat=text(input,"pat");
  int version=configs.save(next,pat);
  audit("settings-saved",Map.of("enabled",next.enabled(),"projectKey",next.projectKey(),"tokenReplaced",!pat.isEmpty()));
  var status=status();status.put("version",version);return status;
 }

 public Map<String,Object> forget(){
  configs.forget();
  audit("token-removed",Map.of());
  return status();
 }

 /** Two calls: identity proves the token, project access proves the key is reachable with it. */
 public Map<String,Object> test(){
  var c=configs.load();
  if(c.baseUrl().isBlank())throw new IllegalArgumentException("Önce Jira adresini girip kaydedin.");
  String token=configs.token();
  var result=new LinkedHashMap<String,Object>();
  var me=transport.get(c.baseUrl(),token,"/rest/api/2/myself",Map.of());
  result.put("connected",true);
  result.put("user",me.path("displayName").asText(me.path("name").asText()));
  result.put("account",me.path("name").asText());
  if(!c.projectKey().isBlank()){
   try{
    var project=transport.get(c.baseUrl(),token,"/rest/api/2/project/"+c.projectKey(),Map.of());
    result.put("project",project.path("name").asText());
    result.put("projectReachable",true);
   }catch(IllegalStateException|IllegalArgumentException e){
    result.put("projectReachable",false);
    result.put("projectError",e.getMessage());
   }
  }
  audit("connection-tested",Map.of("projectReachable",result.getOrDefault("projectReachable",false)));
  return result;
 }

 /** Never record the token itself; only what changed and whether it succeeded. */
 private void audit(String action,Map<String,Object> detail){
  try{
   var details=new LinkedHashMap<String,Object>(detail);details.put("actor",TaskActivity.actor());
   db.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES(?,?,?,?,?)",java.sql.Timestamp.from(clock.instant()),"jira","config",action,mapper.writeValueAsString(details));
  }catch(Exception ignored){/* Auditing must never block a settings change. */}
 }

 private static String text(Map<String,Object> input,String key){return input.get(key) instanceof String s?s.trim():"";}
 private static boolean flag(Map<String,Object> input,String key){return input.get(key) instanceof Boolean b&&b;}
 private static int number(Map<String,Object> input,String key){return input.get(key) instanceof Number n?n.intValue():0;}
}
