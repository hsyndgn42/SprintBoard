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
  task.put("assignments",List.of(Map.of("memberName","İsa","estimatedHours",hours)));
  return task;
 }

 @Test void pageListsPlannedWorkByCategoryAndHidesLeave(){
  var leave=new LinkedHashMap<String,Object>(Map.of("name","Private sick reason","taskCategory","BAU","taskSubtype","LEAVE","workKind","LEAVE","status","todo"));
  var sprint=Map.<String,Object>of("id","s17","number",17,"name","Sprint 17","goal","<Kapsam>","start","2026-11-03","end","2026-11-14","status","planned",
   "items",List.of(task("Tasarım işi","DESIGN","todo",8,null),task("Geliştirme işi","DEV","todo",16,null),task("Test işi","TEST","todo",4,"GENERAL_TEST"),leave));
  var capacity=List.<Map<String,Object>>of(Map.of("supportMember",false,"availableHours",120),Map.of("supportMember",true,"availableHours",40));
  String html=ConfluencePageService.storage(sprint,capacity,Instant.parse("2026-10-26T09:00:00Z"));

  assertTrue(html.contains("Tasarım · 1"));assertTrue(html.contains("Geliştirme · 1"));assertTrue(html.contains("Test ve kalite · 1"));
  // Design must be listed before development so the wiki matches the review export order.
  assertTrue(html.indexOf("Tasarım · 1")<html.indexOf("Geliştirme · 1"));
  assertFalse(html.contains("Private sick reason"));
  assertTrue(html.contains("&lt;Kapsam&gt;"));assertFalse(html.contains("<Kapsam>"));
  assertTrue(html.contains("120 sa"),"core capacity excludes support members");
  assertTrue(html.contains("28 sa"),"delivery and BAU effort are summed from the planning hours");
  assertEquals("Sprint 17 · Sprint 17 · Plan",ConfluencePageService.title(sprint));
 }

 @Test void emptySprintStillProducesAReadablePage(){
  var sprint=Map.<String,Object>of("id","s18","number",18,"name","Sprint 18","goal","","start","2026-11-17","end","2026-11-28","status","planned","items",List.of());
  String html=ConfluencePageService.storage(sprint,List.of(),Instant.parse("2026-10-26T09:00:00Z"));
  assertTrue(html.contains("planlanmış iş yok"));
 }

 @Test void onlyContentPathsOnHttpsHostsAreAccepted(){
  assertEquals(URI.create("https://wiki.local/rest/api/content"),ConfluenceTransport.endpoint("https://wiki.local/","/rest/api/content",Map.of()));
  assertThrows(IllegalArgumentException.class,()->ConfluenceTransport.endpoint("https://wiki.local","/rest/api/../admin",Map.of()));
  assertThrows(IllegalArgumentException.class,()->ConfluenceTransport.endpoint("https://wiki.local","/plugins/servlet",Map.of()));
  assertThrows(IllegalArgumentException.class,()->ConfluenceTransport.endpoint("http://wiki.local","/rest/api/content",Map.of()));
  assertThrows(IllegalArgumentException.class,()->ConfluenceTransport.endpoint("https://user:pw@wiki.local","/rest/api/content",Map.of()));
 }
}
