package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;

import java.net.URI;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;

class ConfluencePageTest {
 private static Map<String,Object> task(String name,String category,String status,double hours,String subtype){
  var task=new LinkedHashMap<String,Object>();
  task.put("name",name);task.put("taskCategory",category);task.put("status",status);task.put("estimatedHours",hours);
  if(subtype!=null)task.put("taskSubtype",subtype);
  task.put("assignments",List.of(Map.of("memberName","İsa","memberId","m1","estimatedHours",hours)));
  return task;
 }

 @Test void pageListsPlannedWorkByCategoryAndHidesLeave(){
  var leave=new LinkedHashMap<String,Object>(Map.of("name","Private sick reason","taskCategory","BAU","taskSubtype","LEAVE","workKind","LEAVE","status","todo"));
  var sprint=Map.<String,Object>of("id","s17","number",17,"name","Sprint 17","goal","<Kapsam>","start","2026-11-03","end","2026-11-14","status","planned",
   "items",List.of(task("Tasarım işi","DESIGN","todo",8,null),task("Geliştirme işi","DEV","todo",16,null),task("Test işi","TEST","todo",4,"GENERAL_TEST"),leave));
  var capacity=List.<Map<String,Object>>of(Map.of("supportMember",false,"availableHours",120),Map.of("supportMember",true,"availableHours",40));
  String html=ConfluencePageService.storage(sprint,capacity,Instant.parse("2026-10-26T09:00:00Z"),"https://jira.local");

  assertTrue(html.contains("Tasarım (1 iş)"));assertTrue(html.contains("Geliştirme (1 iş)"));assertTrue(html.contains("Test ve kalite (1 iş)"));
  // Design must be listed before development so the wiki matches the review export order.
  assertTrue(html.indexOf("Tasarım (1 iş)")<html.indexOf("Geliştirme (1 iş)"));
  assertFalse(html.contains("Private sick reason"));
  assertTrue(html.contains("&lt;Kapsam&gt;"));assertFalse(html.contains("<Kapsam>"));
  assertTrue(html.contains("120 sa"),"core capacity excludes support members");
  assertTrue(html.contains("28 sa"),"delivery and BAU effort are summed from the planning hours");
  assertEquals("Sprint 17 · Sprint 17 · Plan",ConfluencePageService.title(sprint));
 }

 @Test void emptySprintStillProducesAReadablePage(){
  var sprint=Map.<String,Object>of("id","s18","number",18,"name","Sprint 18","goal","","start","2026-11-17","end","2026-11-28","status","planned","items",List.of());
  String html=ConfluencePageService.storage(sprint,List.of(),Instant.parse("2026-10-26T09:00:00Z"),"");
  assertTrue(html.contains("planlanmış iş yok"));
 }

 @Test void theLoadBarSeparatesWhatFitsFromWhatDoesNot(){
  var sprint=Map.<String,Object>of("id","s19","number",19,"name","Sprint 19","goal","Fazla yük","start","2026-12-01","end","2026-12-12","status","active",
   "items",List.of(task("Ağır iş","DEV","todo",90,null)));
  var capacity=List.<Map<String,Object>>of(Map.of("supportMember",false,"availableHours",60));
  String html=ConfluencePageService.storage(sprint,capacity,Instant.parse("2026-10-26T09:00:00Z"),"");
  assertTrue(html.contains("30 sa sığmıyor"),"the overflow is named, not just implied");
  assertTrue(html.contains("#E8BDB8"),"the overflow segment is the only alarming colour on the page");
 }

 @Test void thePageUsesConfluenceNativeFurniture(){
  var sprint=Map.<String,Object>of("id","s20","number",20,"name","Sprint 20","goal","Hedef","start","2026-12-15","end","2026-12-26","status","planned",
   "items",List.of(task("Jira işi","DEV","doing",8,null)));
  var task=new LinkedHashMap<>(SprintDigestSnapshot.rows(sprint,"items").getFirst());task.put("jiraKey","VBCRF-779");
  var linked=Map.<String,Object>of("id","s20","number",20,"name","Sprint 20","goal","Hedef","start","2026-12-15","end","2026-12-26","status","planned","items",List.of(task));
  String html=ConfluencePageService.storage(linked,List.of(Map.of("supportMember",false,"availableHours",40)),Instant.parse("2026-10-26T09:00:00Z"),"https://jira.local");
  assertTrue(html.contains("<time datetime=\"2026-12-15\" />"),"dates render as Confluence date lozenges");
  assertTrue(html.contains("ac:name=\"status\""),"task state rides on a coloured lozenge");
  assertTrue(html.contains("https://jira.local/browse/VBCRF-779"),"the PBI key links back to Jira");
  assertTrue(html.contains("Kim ne yapıyor"),"everyone can find their own load");
 }

 @Test void onlyContentPathsOnHttpsHostsAreAccepted(){
  assertEquals(URI.create("https://wiki.local/rest/api/content"),ConfluenceTransport.endpoint("https://wiki.local/","/rest/api/content",Map.of()));
  assertThrows(IllegalArgumentException.class,()->ConfluenceTransport.endpoint("https://wiki.local","/rest/api/../admin",Map.of()));
  assertThrows(IllegalArgumentException.class,()->ConfluenceTransport.endpoint("https://wiki.local","/plugins/servlet",Map.of()));
  assertThrows(IllegalArgumentException.class,()->ConfluenceTransport.endpoint("http://wiki.local","/rest/api/content",Map.of()));
  assertThrows(IllegalArgumentException.class,()->ConfluenceTransport.endpoint("https://user:pw@wiki.local","/rest/api/content",Map.of()));
 }

 @Test void connectionFailuresNameTheActualCause(){
  var uri=URI.create("https://itwiki.vodafone.local/rest/api/content");
  assertTrue(ConfluenceTransport.reason(uri,new java.net.UnknownHostException("x")).contains("çözülemedi"));
  assertTrue(ConfluenceTransport.reason(uri,new javax.net.ssl.SSLHandshakeException("x")).contains("sertifika"));
  assertTrue(ConfluenceTransport.reason(uri,new java.net.ConnectException("x")).contains("ulaşılamadı"));
  assertTrue(ConfluenceTransport.reason(uri,new java.io.IOException("x")).contains("itwiki.vodafone.local"));
 }
}
