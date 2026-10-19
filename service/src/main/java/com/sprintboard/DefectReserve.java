package com.sprintboard;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import com.fasterxml.jackson.databind.JsonNode;

/** Reserves retain their original assignments; only the unused balance contributes to plan totals. */
public final class DefectReserve {
 private DefectReserve(){}
 public static boolean isReserve(Map<String,Object> t){return "BAU".equals(t.get("taskCategory"))&&"DEFECT_SUPPORT".equals(t.get("taskSubtype"));}
 public static boolean withinReserve(Map<String,Object> t){return "DEFECT".equals(t.get("taskCategory"))&&!Objects.toString(t.get("reserveTaskId"),"").isBlank()&&t.containsKey("extraPlanHours")&&number(t,"extraPlanHours")<=0.000001;}
 public static double number(Map<String,Object> m,String key){return m.get(key) instanceof Number n?n.doubleValue():0;}
 public static double hours(Map<String,Object> a){return Boolean.TRUE.equals(a.get("supportOnly"))?0:number(a,"estimatedHours");}
 public static double planned(Map<String,Object> a){return a.containsKey("planningHours")?number(a,"planningHours"):hours(a);}
 @SuppressWarnings("unchecked") public static List<Map<String,Object>> assignments(Map<String,Object> t){return (List<Map<String,Object>>)t.getOrDefault("assignments",List.of());}
 public static void links(JdbcTemplate db,String sprint,List<Map<String,Object>> tasks){
   var links=new HashMap<String,String>();db.query("SELECT l.task_id,l.reserve_task_id FROM defect_reserve_link l JOIN sprint_task t ON t.id=l.task_id WHERE t.sprint_id=?",rs->{links.put(rs.getString(1),rs.getString(2));},sprint);
   for(var t:tasks)t.put("reserveTaskId",links.get(t.get("id")));
 }
 public static List<Map<String,Object>> enrich(List<Map<String,Object>> tasks){
   for(var t:tasks){t.put("planningHours",number(t,"estimatedHours"));for(var a:assignments(t))a.put("planningHours",hours(a));}
   // Assigned effort is authoritative for defects; their original intake estimate may still be zero.
   // Keep the estimate intact and deduct covered effort from the reserve, not from the defect.
   for(var t:tasks)if("DEFECT".equals(t.get("taskCategory"))){
     double effort=assignments(t).isEmpty()?number(t,"estimatedHours"):assignments(t).stream().mapToDouble(DefectReserve::hours).sum();
     t.put("planningHours",effort);t.put("reserveCoveredHours",0d);t.put("extraPlanHours",effort);
   }
   var result=new ArrayList<Map<String,Object>>();
   for(var reserve:tasks)if(isReserve(reserve)){
     var linked=tasks.stream().filter(t->reserve.get("id").equals(t.get("reserveTaskId"))&&"DEFECT".equals(t.get("taskCategory"))).toList();
     var members=new LinkedHashMap<String,Map<String,Object>>();
     for(var t:concat(reserve,linked))for(var a:assignments(t)){
       String id=a.get("memberId").toString();var r=members.computeIfAbsent(id,k->{var m=new LinkedHashMap<String,Object>();m.put("memberId",id);m.put("memberName",a.get("memberName"));m.put("reservedHours",0d);m.put("allocatedHours",0d);return m;});
       String key=t==reserve?"reservedHours":"allocatedHours";r.put(key,number(r,key)+hours(a));
     }
     for(var r:members.values()){double reserved=number(r,"reservedHours"),allocated=number(r,"allocatedHours");r.put("remainingHours",Math.max(0,reserved-allocated));r.put("overHours",Math.max(0,allocated-reserved));r.put("coveredHours",Math.min(reserved,allocated));}
     for(var a:assignments(reserve)){var r=members.get(a.get("memberId"));a.put("planningHours",r.get("remainingHours"));}
     // A reserve is meaningful only after member allocation. Unassigned headline estimates do not reserve capacity.
     reserve.put("planningHours",members.values().stream().mapToDouble(m->number(m,"remainingHours")).sum());
     var summary=new LinkedHashMap<String,Object>();summary.put("taskId",reserve.get("id"));summary.put("name",reserve.get("name"));summary.put("members",new ArrayList<>(members.values()));summary.put("defectCount",linked.size());
     for(String key:List.of("reservedHours","allocatedHours","remainingHours","overHours","coveredHours"))summary.put(key,members.values().stream().mapToDouble(m->number(m,key)).sum());
     summary.put("unassignedDefectHours",linked.stream().filter(t->assignments(t).stream().noneMatch(a->!Boolean.TRUE.equals(a.get("supportOnly")))).mapToDouble(t->assignments(t).isEmpty()?number(t,"estimatedHours"):0).sum());
     result.add(summary);
     // Baseline tasks first, then sprint admission order. One person's spare budget cannot cover another.
     var balance=new HashMap<String,Double>();for(var a:assignments(reserve))balance.merge(a.get("memberId").toString(),hours(a),Double::sum);
     var ordered=linked.stream().sorted(Comparator.<Map<String,Object>>comparingDouble(t->number(t,"scopeOrder")).thenComparing(t->t.get("id").toString())).toList();
     for(var t:ordered){double covered=0,extra=0;
       if(assignments(t).isEmpty())extra=number(t,"estimatedHours");
       for(var a:assignments(t)){String member=a.get("memberId").toString();double used=hours(a),available=balance.getOrDefault(member,0d),take=Math.min(used,available);balance.put(member,available-take);covered+=take;extra+=used-take;}
       t.put("reserveCoveredHours",covered);t.put("extraPlanHours",extra);
     }
   }
   for(var t:tasks)if("DEFECT".equals(t.get("taskCategory"))&&Boolean.TRUE.equals(t.get("addedDuringSprint")))t.put("emergency",number(t,"extraPlanHours")>0.000001);
   return result;
 }
 private static List<Map<String,Object>> concat(Map<String,Object> reserve,List<Map<String,Object>> linked){var out=new ArrayList<Map<String,Object>>();out.add(reserve);out.addAll(linked);return out;}
 public static void set(JdbcTemplate db,String task,String reserve){
   var source=db.queryForMap("SELECT sprint_id,task_category FROM sprint_task WHERE id=?",task);
   if(!"DEFECT".equals(source.get("TASK_CATEGORY")))throw new IllegalArgumentException("Rezerv yalnız DEFECT işine bağlanabilir.");
   if(!reserve.isBlank()){
     var target=db.queryForList("SELECT id FROM sprint_task WHERE id=? AND sprint_id=? AND task_category='BAU' AND task_subtype='DEFECT_SUPPORT'",reserve,source.get("SPRINT_ID"));
     if(target.isEmpty())throw new IllegalArgumentException("Aynı sprintteki BAU Defect Support rezervini seçin.");
   }
   db.update("DELETE FROM defect_reserve_link WHERE task_id=?",task);
   if(!reserve.isBlank())db.update("INSERT INTO defect_reserve_link VALUES (?,?)",task,reserve);
 }
 public static void validateBackup(JsonNode tables){
   var tasks=new HashMap<String,JsonNode>();for(var t:tables.path("sprint_task"))tasks.put(t.path("id").asText(),t);
   for(var link:tables.path("defect_reserve_link")){
     var t=tasks.get(link.path("task_id").asText());var r=tasks.get(link.path("reserve_task_id").asText());
     if(t==null||r==null||!"DEFECT".equals(t.path("task_category").asText())||!"BAU".equals(r.path("task_category").asText())||!"DEFECT_SUPPORT".equals(r.path("task_subtype").asText())||!t.path("sprint_id").equals(r.path("sprint_id")))throw new IllegalArgumentException("Defect rezerv bağlantısı geçersiz.");
   }
 }
}
