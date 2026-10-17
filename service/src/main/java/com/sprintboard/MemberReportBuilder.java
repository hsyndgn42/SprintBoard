package com.sprintboard;
import java.util.*;

/** Pure aggregation. Leave is capacity context, X is a contribution without an hourly estimate. */
final class MemberReportBuilder {
 private MemberReportBuilder(){}
 private static double number(Map<String,Object> row,String key){return row.get(key) instanceof Number n?n.doubleValue():0;}
 @SuppressWarnings("unchecked")
 static List<Map<String,Object>> build(Map<String,Object> sprint,List<Map<String,Object>> capacity,List<Map<String,Object>> members,Map<String,Double> recordedLeaves,Set<String> explicitMembers){
   boolean frozen=Boolean.TRUE.equals(sprint.get("closureFrozen"));
   Map<String,Map<String,Object>> people=new LinkedHashMap<>(),caps=new HashMap<>(),metadata=new HashMap<>();
   for(var m:members)metadata.put(m.get("id").toString(),m);
   for(var c:capacity)caps.put(c.get("memberId").toString(),c);
   java.util.function.Function<String,Map<String,Object>> person=id->people.computeIfAbsent(id,key->{
     var m=metadata.getOrDefault(id,Map.of());var c=caps.getOrDefault(id,Map.of());Map<String,Object> r=new LinkedHashMap<>();
     r.put("memberId",id);r.put("memberName",frozen?c.getOrDefault("memberName",m.getOrDefault("name",id)):m.getOrDefault("name",id));
     r.put("title",frozen?"":m.getOrDefault("title",""));r.put("teamRole",frozen?c.getOrDefault("role",m.getOrDefault("teamRole","")):m.getOrDefault("teamRole",""));
     r.put("engagement",frozen?(Boolean.TRUE.equals(c.get("supportMember"))?"SUPPORT":"CORE"):m.getOrDefault("engagement","CORE"));
     r.put("sprintId",sprint.get("id"));r.put("sprintNumber",sprint.get("number"));r.put("sprintName",sprint.get("name"));
     for(String field:List.of("taskCount","effortHours","done","undone","other","sizeSmall","sizeMedium","sizeLarge","sizeXLarge","pointedTasks","storyPointsTotal","supportTaskCount","unestimatedTaskCount"))r.put(field,0d);
     boolean unspecifiedSupport=!frozen&&!Boolean.TRUE.equals(c.get("allocationExplicit"))&&(Boolean.TRUE.equals(c.get("supportMember"))||"ARCHITECT".equals(r.get("teamRole")));
     boolean known=!c.isEmpty()&&!unspecifiedSupport;
     r.put("capacitySource",c.isEmpty()?"UNAVAILABLE":unspecifiedSupport?"UNSPECIFIED_SUPPORT":frozen?"FROZEN":"RECALCULATED");
     r.put("allocationExplicit",Boolean.TRUE.equals(c.get("allocationExplicit")));
     r.put("allocatedDays",known?number(c,"allocatedDays"):null);r.put("availableHours",known?number(c,"availableHours"):null);
     r.put("leaveDays",!c.isEmpty()?number(c,"leaveDays"):recordedLeaves.getOrDefault(id,0d));
     r.put("nonWorkingDays",!c.isEmpty()?number(c,"nonWorkingDays"):null);
     r.put("overtimeHours",!c.isEmpty()?number(c,"overtimeHours"):null);return r;
   });
   for(var task:(List<Map<String,Object>>)sprint.get("items")){
     if("LEAVE".equals(task.get("workKind"))||("BAU".equals(task.get("taskCategory"))&&"LEAVE".equals(task.get("taskSubtype"))))continue;
     Map<String,List<Map<String,Object>>> assigned=new LinkedHashMap<>();
     for(var a:(List<Map<String,Object>>)task.get("assignments"))assigned.computeIfAbsent(a.get("memberId").toString(),id->new ArrayList<>()).add(a);
     for(var entry:assigned.entrySet()){
       var r=person.apply(entry.getKey());var assignments=entry.getValue();
       if(frozen&&!caps.containsKey(entry.getKey()))r.put("memberName",assignments.getFirst().getOrDefault("memberName",r.get("memberName")));
       add(r,"taskCount",1);String state=Objects.toString(task.get("status"),"");add(r,state.equals("done")?"done":state.equals("undone")?"undone":"other",1);
       boolean support=assignments.stream().allMatch(a->Boolean.TRUE.equals(a.get("supportOnly")));
       double hours=assignments.stream().filter(a->!Boolean.TRUE.equals(a.get("supportOnly"))).mapToDouble(DefectReserve::planned).sum();
       add(r,"effortHours",hours);if(support)add(r,"supportTaskCount",1);else if(assignments.stream().mapToDouble(a->number(a,"estimatedHours")).sum()==0)add(r,"unestimatedTaskCount",1);
       String size=Objects.toString(task.get("size"),"");String sizeField=switch(size){case "SMALL"->"sizeSmall";case "MEDIUM"->"sizeMedium";case "LARGE"->"sizeLarge";case "X-LARGE"->"sizeXLarge";default->"";};
       if(!sizeField.isEmpty())add(r,sizeField,1);
       if(task.get("storyPoints") instanceof Number n){add(r,"pointedTasks",1);add(r,"storyPointsTotal",n.doubleValue());}
     }
   }
   // Do not infer historical participation simply from today's team roster.
   for(var c:capacity)if(frozen||number(c,"leaveDays")>0||explicitMembers.contains(c.get("memberId").toString()))person.apply(c.get("memberId").toString());
   if(!frozen){recordedLeaves.keySet().forEach(person::apply);explicitMembers.forEach(person::apply);}
   return new ArrayList<>(people.values());
 }
 private static void add(Map<String,Object> row,String key,double n){row.put(key,number(row,key)+n);}
}
