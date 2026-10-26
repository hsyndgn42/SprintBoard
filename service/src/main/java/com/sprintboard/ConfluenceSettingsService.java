package com.sprintboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Settings screen behind /api/admin/confluence: stores configuration and proves the connection works. */
@Service
public class ConfluenceSettingsService {
 private final ConfluenceConfigStore configs; private final ConfluenceTransport transport;
 private final ConfluencePageService pages; private final JdbcTemplate db; private final ObjectMapper mapper; private final Clock clock;
 public ConfluenceSettingsService(ConfluenceConfigStore configs,ConfluenceTransport transport,ConfluencePageService pages,JdbcTemplate db,ObjectMapper mapper,Clock clock){
  this.configs=configs;this.transport=transport;this.pages=pages;this.db=db;this.mapper=mapper;this.clock=clock;
 }

 public Map<String,Object> status(){
  var c=configs.load();
  var status=new LinkedHashMap<String,Object>();
  status.put("baseUrl",c.baseUrl());status.put("spaceKey",c.spaceKey());status.put("parentPageId",c.parentPageId());
  status.put("enabled",c.enabled());status.put("version",c.version());status.put("patConfigured",c.patConfigured());
  return status;
 }

 public Map<String,Object> save(Map<String,Object> input){
  var next=new ConfluenceConfigStore.Config(text(input,"baseUrl"),text(input,"spaceKey"),text(input,"parentPageId"),flag(input,"enabled"),number(input,"version"),false);
  String pat=text(input,"pat");
  int version=configs.save(next,pat);
  audit("settings-saved",Map.of("enabled",next.enabled(),"spaceKey",next.spaceKey(),"tokenReplaced",!pat.isEmpty()));
  var status=status();status.put("version",version);return status;
 }

 public Map<String,Object> forget(){
  configs.forget();
  audit("token-removed",Map.of());
  return status();
 }

 /** Two calls: identity proves the token, space access proves the key is reachable with it. */
 public Map<String,Object> test(){
  var c=configs.load();
  if(c.baseUrl().isBlank())throw new IllegalArgumentException("Önce Confluence adresini girip kaydedin.");
  String token=configs.token();
  var result=new LinkedHashMap<String,Object>();
  var me=transport.get(c.baseUrl(),token,"/rest/api/user/current",Map.of());
  result.put("connected",true);
  result.put("user",me.path("displayName").asText(me.path("username").asText()));
  if(!c.spaceKey().isBlank()){
   try{
    var space=transport.get(c.baseUrl(),token,"/rest/api/space/"+c.spaceKey(),Map.of());
    result.put("space",space.path("name").asText(c.spaceKey()));
    result.put("spaceReachable",true);
   }catch(IllegalStateException|IllegalArgumentException e){
    result.put("spaceReachable",false);
    result.put("spaceError",e.getMessage());
   }
  }
  audit("connection-tested",Map.of("spaceReachable",result.getOrDefault("spaceReachable",false)));
  return result;
 }

 public Map<String,Object> publish(String sprintId){
  var published=pages.publish(sprintId,TaskActivity.actor(),clock.instant());
  audit("page-published",Map.of("sprintId",sprintId,"pageId",published.pageId(),"pageVersion",published.pageVersion()));
  return Map.of("sprintId",sprintId,"pageId",published.pageId(),"pageUrl",published.pageUrl(),"pageVersion",published.pageVersion(),"title",published.title());
 }

 public Map<String,Object> link(String sprintId){
  var link=pages.link(sprintId);
  var result=new LinkedHashMap<String,Object>();
  result.put("sprintId",sprintId);
  result.put("enabled",configs.load().enabled());
  result.put("pageId",Objects.toString(link.get("page_id"),""));
  result.put("pageUrl",Objects.toString(link.get("page_url"),""));
  result.put("publishedAt",Objects.toString(link.get("published_at"),""));
  return result;
 }

 /** Never record the token itself; only what changed and whether it succeeded. */
 private void audit(String action,Map<String,Object> detail){
  try{
   var details=new LinkedHashMap<String,Object>(detail);details.put("actor",TaskActivity.actor());
   db.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES(?,?,?,?,?)",java.sql.Timestamp.from(clock.instant()),"confluence","config",action,mapper.writeValueAsString(details));
  }catch(Exception ignored){/* Auditing must never block a settings change. */}
 }

 private static String text(Map<String,Object> input,String key){return input.get(key) instanceof String s?s.trim():"";}
 private static boolean flag(Map<String,Object> input,String key){return input.get(key) instanceof Boolean b&&b;}
 private static int number(Map<String,Object> input,String key){return input.get(key) instanceof Number n?n.intValue():0;}
}
