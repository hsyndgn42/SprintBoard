package com.sprintboard;
import com.fasterxml.jackson.databind.*;
import java.time.*;
import java.util.*;
final class CollaborationBackup {
 static void validate(JsonNode tables,ObjectMapper mapper){
  try{
   for(var row:tables.path("task_activity")){
    LocalDate.parse(row.path("entry_date").asText());Instant.parse(row.path("occurred_at").asText());
    if(row.path("actor").asText().isBlank()||row.path("task_title").asText().isBlank()||row.path("kind").asText().isBlank()||row.path("message").asText().length()>2000||!mapper.readTree(row.path("detail_json").asText()).isObject())throw new IllegalArgumentException();
   }
   var leaves=new HashMap<String,JsonNode>();for(var e:tables.path("leave_record"))leaves.put(e.path("id").asText(),e);
   for(var row:tables.path("leave_request")){
     LocalDate a=LocalDate.parse(row.path("start_on").asText()),b=LocalDate.parse(row.path("end_on").asText());Instant.parse(row.path("created_at").asText());
     double days=row.path("days").asDouble(Double.NaN);String status=row.path("status").asText();
     if(b.isBefore(a)||!row.path("days").isNumber()||!Double.isFinite(days)||days<=0||days>100||days*2!=Math.rint(days*2)||!Set.of("ANNUAL","OVERTIME").contains(row.path("leave_type").asText())||row.path("requester").asText().isBlank()||row.path("reason").asText().isBlank()||!Set.of("PENDING","APPROVED","REJECTED").contains(status))throw new IllegalArgumentException();
     if(status.equals("PENDING")){if(!row.path("decided_at").isNull()||!row.path("decided_by").isNull()||!row.path("entry_id").isNull())throw new IllegalArgumentException();}
     else{Instant.parse(row.path("decided_at").asText());if(row.path("decided_by").asText().isBlank()||row.path("decision_note").asText().isBlank())throw new IllegalArgumentException();}
     if(status.equals("APPROVED")){
       // Admin may subsequently correct the leave; request remains the original approval record.
       var e=leaves.get(row.path("entry_id").asText());if(e==null||!e.path("member_id").equals(row.path("member_id"))||!e.path("sprint_id").equals(row.path("sprint_id")))throw new IllegalArgumentException();
     }else if(!row.path("entry_id").isNull())throw new IllegalArgumentException();
   }
   var entries=new HashMap<String,JsonNode>();for(var e:tables.path("overtime_entry"))entries.put(e.path("id").asText(),e);
   var linked=new HashSet<String>();
   for(var link:tables.path("overtime_plan_link")){
     String id=link.path("entry_id").asText();var actual=entries.get(id);var plan=entries.get(link.path("plan_id").asText());
     if(!linked.add(id)||actual==null||plan==null||actual==plan||!actual.path("plan_classification").asText().equals("PLANNED")||!actual.path("member_id").equals(plan.path("member_id"))||!actual.path("sprint_id").equals(plan.path("sprint_id"))||actual.path("earned_hours").asDouble()<=0||actual.path("planned_hours").asDouble()!=0||actual.path("include_in_capacity").asBoolean()||plan.path("plan_classification").asText().equals("PLANNED"))throw new IllegalArgumentException();
     if(!plan.path("task_id").isNull()&&!plan.path("task_id").equals(actual.path("task_id")))throw new IllegalArgumentException();
   }
   for(var e:entries.values()){
     String kind=e.path("plan_classification").asText();
     if(!Set.of("LEGACY","UNPLANNED","PLANNED").contains(kind)||kind.equals("PLANNED")!=linked.contains(e.path("id").asText()))throw new IllegalArgumentException();
   }
   for(var row:tables.path("overtime_request")){
    LocalDate.parse(row.path("work_date").asText());Instant.parse(row.path("created_at").asText());
    if(row.path("requester").asText().isBlank()||row.path("reason").asText().isBlank()||!row.path("hours").isNumber()||!Double.isFinite(row.path("hours").asDouble())||row.path("hours").asDouble()<=0||row.path("hours").asDouble()>24)throw new IllegalArgumentException();
    String status=row.path("status").asText();if(!Set.of("PENDING","APPROVED","REJECTED").contains(status))throw new IllegalArgumentException();
    if(status.equals("PENDING")){if(!row.path("decided_at").isNull()||!row.path("decided_by").isNull()||!row.path("entry_id").isNull())throw new IllegalArgumentException();}
    else {Instant.parse(row.path("decided_at").asText());if(row.path("decided_by").asText().isBlank()||row.path("decision_note").asText().isBlank())throw new IllegalArgumentException();}
    if(status.equals("APPROVED")){
     var e=entries.get(row.path("entry_id").asText());if(e==null||!e.path("member_id").equals(row.path("member_id"))||!e.path("sprint_id").equals(row.path("sprint_id"))||e.path("earned_hours").asDouble()!=row.path("hours").asDouble()||e.path("planned_hours").asDouble()!=0||e.path("used_hours").asDouble()!=0||e.path("include_in_capacity").asBoolean())throw new IllegalArgumentException();
    }else if(!row.path("entry_id").isNull())throw new IllegalArgumentException();
   }
  }catch(Exception e){throw new IllegalArgumentException("Görev günlüğü / mesai veya izin talebi yedek verisi geçersiz.",e);}
 }
}
