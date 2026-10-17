package com.sprintboard;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;

/** Plan links describe actual work; they never create capacity or assignment hours. */
final class OvertimePlanAccounting {
  static Map<String,Object> validate(JdbcTemplate db,Map<String,Object> input,String member,String sprint,double earned,double planned,boolean included){
    String mode=Objects.toString(input.get("planMode"),"UNPLANNED");
    String planId=Objects.toString(input.get("planId"),"").trim();
    if(!Set.of("UNPLANNED","PLANNED").contains(mode))throw new IllegalArgumentException("Plan kapsamında veya plansız mesai seçin.");
    if(mode.equals("UNPLANNED")){
      if(!planId.isEmpty())throw new IllegalArgumentException("Plansız mesaide plan seçilemez.");
      return Map.of();
    }
    if(earned<=0||planned!=0||included)throw new IllegalArgumentException("Plan eşleştirmesi yalnız gerçekleşen mesaiye yapılır; kapasiteye tekrar eklenemez.");
    var plans=db.queryForList("SELECT * FROM overtime_entry WHERE id=? FOR UPDATE",planId);
    if(plans.isEmpty())throw new IllegalArgumentException("Mesai planı bulunamadı.");
    var plan=plans.getFirst();
    if(!member.equals(plan.get("MEMBER_ID"))||!sprint.equals(plan.get("SPRINT_ID"))||((Number)plan.get("PLANNED_HOURS")).doubleValue()<=0)
      throw new IllegalArgumentException("Aynı kişi ve sprinte ait, iptal edilmemiş mesai planı seçin.");
    String task=Objects.toString(input.get("taskId"),"").trim(),planTask=Objects.toString(plan.get("TASK_ID"),"");
    if(!planTask.isBlank()&&!task.equals(planTask))throw new IllegalArgumentException("Mesai görevi seçilen planın göreviyle aynı olmalı.");
    return plan;
  }
  static void link(JdbcTemplate db,String entry,Map<String,Object> plan,double earned){
    db.update("UPDATE overtime_entry SET plan_classification=? WHERE id=?",plan.isEmpty()?(earned>0?"UNPLANNED":"LEGACY"):"PLANNED",entry);
    if(!plan.isEmpty())db.update("INSERT INTO overtime_plan_link(entry_id,plan_id) VALUES(?,?)",entry,plan.get("ID"));
  }
}
