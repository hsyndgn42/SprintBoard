package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;

import java.net.URI;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;

class ConfluencePageTest {
 private static final Instant NOW=Instant.parse("2026-10-26T09:00:00Z");

 private static Map<String,Object> task(String name,String category,String status,double hours,String subtype){
  var task=new LinkedHashMap<String,Object>();
  task.put("name",name);task.put("taskCategory",category);task.put("status",status);task.put("estimatedHours",hours);
  if(subtype!=null)task.put("taskSubtype",subtype);
  task.put("assignments",List.of(Map.of("memberName","İsa","memberId","m1","estimatedHours",hours)));
  return task;
 }
 private static Map<String,Object> member(String name,double available,double planned,boolean support){
  return Map.of("memberName",name,"availableHours",available,"plannedHours",planned,"supportMember",support);
 }

 @Test void pageListsPlannedWorkByCategoryAndHidesLeave(){
  var leave=new LinkedHashMap<String,Object>(Map.of("name","Private sick reason","taskCategory","BAU","taskSubtype","LEAVE","workKind","LEAVE","status","todo"));
  var sprint=Map.<String,Object>of("id","s17","number",17,"name","Sprint 17","goal","<Kapsam>","start","2026-11-03","end","2026-11-14","status","planned",
   "items",List.of(task("Tasarım işi","DESIGN","todo",8,null),task("Geliştirme işi","DEV","todo",16,null),task("Test işi","TEST","todo",4,"GENERAL_TEST"),leave));
  var capacity=List.of(member("İsa",120,28,false),member("Destek",40,40,true));
  String html=ConfluencePageService.storage(sprint,capacity,NOW,"https://jira.local");

  assertTrue(html.contains("Tasarım (1 iş, 8 sa)"));assertTrue(html.contains("Geliştirme (1 iş, 16 sa)"));assertTrue(html.contains("Test ve kalite (1 iş, 4 sa)"));
  // Design must be listed before development so the wiki matches the review export order.
  assertTrue(html.indexOf("Tasarım (1 iş")<html.indexOf("Geliştirme (1 iş"));
  assertFalse(html.contains("Private sick reason"));
  assertTrue(html.contains("&lt;Kapsam&gt;"));assertFalse(html.contains("<Kapsam>"));
  assertTrue(html.contains("120 sa"),"core capacity excludes support members");
  assertFalse(html.contains("Destek"),"support members stay out of the core load");
  assertTrue(html.contains("3 Kasım 2026"),"dates are written in Turkish");
  assertEquals("Sprint 17 · Sprint 17 · Plan",ConfluencePageService.title(sprint));
 }

 /** The team total used to cancel one person's spare hours against another's missing ones. */
 @Test void overloadAndSlackAreCountedPerPerson(){
  var sprint=Map.<String,Object>of("id","s19","number",19,"name","Sprint 19","goal","Hedef","start","2026-12-01","end","2026-12-12","status","active",
   "items",List.of(task("İş","DEV","todo",90,null)));
  var capacity=List.of(member("Aşan",40,48,false),member("Boşu olan",40,10,false),member("Tam",40,40,false));
  String html=ConfluencePageService.storage(sprint,capacity,NOW,"");

  assertTrue(html.contains(">8 sa</strong>"),"only the overloaded person contributes to the overload total");
  assertTrue(html.contains(">30 sa</strong>"),"slack is reported even while someone else is over");
  assertTrue(html.contains("8 sa aşım"));assertTrue(html.contains("30 sa boşta"));assertTrue(html.contains("tam dolu"));
  assertTrue(html.indexOf("Aşan")<html.indexOf("Tam"),"the fullest person is listed first");
  assertTrue(html.contains("#b65c53"),"an overloaded bar is the only red on the page");
 }

 @Test void barsAndLozengesUseConfluenceSafeMarkup(){
  var task=task("Jira işi","DEV","doing",8,null);task.put("jiraKey","VBCRF-779");
  var sprint=Map.<String,Object>of("id","s20","number",20,"name","Sprint 20","goal","Hedef","start","2026-12-15","end","2026-12-26","status","planned","items",List.of(task));
  String html=ConfluencePageService.storage(sprint,List.of(member("İsa",40,8,false)),NOW,"https://jira.local");

  assertTrue(html.contains("ac:name=\"status\""),"task state rides on a coloured lozenge");
  assertTrue(html.contains("class=\"highlight-#267a68\""),"Confluence paints a cell only when the class is present too");
  assertTrue(html.contains("https://jira.local/browse/VBCRF-779"),"the PBI key links back to Jira");
  assertTrue(html.contains("Kişi bazında yük"));
 }

 @Test void emptySprintStillProducesAReadablePage(){
  var sprint=Map.<String,Object>of("id","s18","number",18,"name","Sprint 18","goal","","start","2026-11-17","end","2026-11-28","status","planned","items",List.of());
  String html=ConfluencePageService.storage(sprint,List.of(),NOW,"");
  assertTrue(html.contains("planlanmış iş yok"));
  assertTrue(html.contains("hedef yazılmadı"));
 }

 @Test void onlyContentPathsOnHttpsHostsAreAccepted(){
  assertEquals(URI.create("https://wiki.local/rest/api/content"),ConfluenceTransport.endpoint("https://wiki.local/","/rest/api/content",Map.of()));
  assertThrows(IllegalArgumentException.class,()->ConfluenceTransport.endpoint("https://wiki.local","/rest/api/../admin",Map.of()));
  assertThrows(IllegalArgumentException.class,()->ConfluenceTransport.endpoint("https://wiki.local","/plugins/servlet",Map.of()));
  assertThrows(IllegalArgumentException.class,()->ConfluenceTransport.endpoint("http://wiki.local","/rest/api/content",Map.of()));
  assertThrows(IllegalArgumentException.class,()->ConfluenceTransport.endpoint("******wiki.local","/rest/api/content",Map.of()));
 }

 @Test void connectionFailuresNameTheActualCause(){
  var uri=URI.create("https://itwiki.vodafone.local/rest/api/content");
  assertTrue(ConfluenceTransport.reason(uri,new java.net.UnknownHostException("x")).contains("çözülemedi"));
  assertTrue(ConfluenceTransport.reason(uri,new javax.net.ssl.SSLHandshakeException("x")).contains("sertifika"));
  assertTrue(ConfluenceTransport.reason(uri,new java.net.ConnectException("x")).contains("ulaşılamadı"));
  assertTrue(ConfluenceTransport.reason(uri,new java.io.IOException("x")).contains("itwiki.vodafone.local"));
 }
}
