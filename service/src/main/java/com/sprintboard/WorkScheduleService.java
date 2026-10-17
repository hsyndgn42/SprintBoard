package com.sprintboard;

import com.fasterxml.jackson.databind.*;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Dated team defaults and immutable per-sprint policies. Missing legacy snapshots mean Mon-Fri/8h. */
@Service
public class WorkScheduleService {
  public static final String DATED="work_schedule:",SPRINT="sprint_schedule:";
  private final JdbcTemplate jdbc;private final ObjectMapper mapper;
  public WorkScheduleService(JdbcTemplate jdbc,ObjectMapper mapper){this.jdbc=jdbc;this.mapper=mapper;}
  public record Policy(double hoursPerDay,List<Integer> workingDays){
    public boolean works(LocalDate day){return workingDays.contains(day.getDayOfWeek().getValue());}
  }
  public static Policy legacy(){return new Policy(8,List.of(1,2,3,4,5));}
  public static Policy parse(JsonNode n){
    double hours=n.path("hoursPerDay").asDouble(Double.NaN);var days=new ArrayList<Integer>();
    if(!n.isObject()||n.size()!=2||!n.path("hoursPerDay").isNumber()||!Double.isFinite(hours)||hours<1||hours>24||hours*2!=Math.rint(hours*2)||!n.path("workingDays").isArray())throw new IllegalArgumentException("Günlük saat 1–24 arasında, yarım saat adımlı olmalı.");
    for(var d:n.path("workingDays")){if(!d.isIntegralNumber()||d.intValue()<1||d.intValue()>7||days.contains(d.intValue()))throw new IllegalArgumentException("Çalışma günleri geçersiz.");days.add(d.intValue());}
    if(days.isEmpty())throw new IllegalArgumentException("En az bir çalışma günü seçin.");Collections.sort(days);return new Policy(hours,List.copyOf(days));
  }
  private Policy decode(String value){try{return parse(mapper.readTree(value));}catch(com.fasterxml.jackson.core.JsonProcessingException e){throw new IllegalArgumentException("Çalışma düzeni okunamadı.",e);}}
  public Policy at(LocalDate date){var rows=jdbc.queryForList("SELECT setting_value FROM product_setting WHERE setting_key LIKE 'work_schedule:%' AND setting_key<=? ORDER BY setting_key DESC LIMIT 1",String.class,DATED+date);return rows.isEmpty()?legacy():decode(rows.getFirst());}
  public Policy forSprint(String id){var rows=jdbc.queryForList("SELECT setting_value FROM product_setting WHERE setting_key=?",String.class,SPRINT+id);return rows.isEmpty()?legacy():decode(rows.getFirst());}
  public void capture(String id,LocalDate start){write(SPRINT+id,at(start));}
  private void write(String key,Policy p){try{jdbc.update("MERGE INTO product_setting(setting_key,setting_value) KEY(setting_key) VALUES (?,?)",key,mapper.writeValueAsString(p));}catch(com.fasterxml.jackson.core.JsonProcessingException e){throw new IllegalArgumentException("Çalışma düzeni kaydedilemedi.",e);}}
  public String teamName(){var rows=jdbc.queryForList("SELECT setting_value FROM product_setting WHERE setting_key='team_name'",String.class);return rows.isEmpty()?"VibeCraft Team":rows.getFirst();}
  public List<Map<String,Object>> history(){return jdbc.query("SELECT setting_key,setting_value FROM product_setting WHERE setting_key LIKE 'work_schedule:%' ORDER BY setting_key",(rs,n)->{var p=decode(rs.getString(2));return Map.<String,Object>of("effectiveFrom",rs.getString(1).substring(DATED.length()),"hoursPerDay",p.hoursPerDay(),"workingDays",p.workingDays());});}
  @Transactional public Map<String,Object> update(Map<String,Object> input){
    String name=Objects.toString(input.get("teamName"),"").trim();if(name.isBlank()||name.length()>100||name.chars().anyMatch(Character::isISOControl))throw new IllegalArgumentException("Ekip adı 1–100 karakter olmalı.");
    String from=Objects.toString(input.get("effectiveFrom"),"");LocalDate date;try{date=LocalDate.parse(from);}catch(Exception e){throw new IllegalArgumentException("Geçerlilik tarihi gerekli.");}
    if(date.isBefore(LocalDate.now(ZoneId.of("Europe/Istanbul"))))throw new IllegalArgumentException("Çalışma düzeni geçmiş bir tarihten başlatılamaz.");
    var payload=mapper.createObjectNode();payload.set("hoursPerDay",mapper.valueToTree(input.get("hoursPerDay")));payload.set("workingDays",mapper.valueToTree(input.get("workingDays")));var p=parse(payload);
    jdbc.queryForObject("SELECT setting_value FROM product_setting WHERE setting_key='estimation_mode' FOR UPDATE",String.class);
    write(DATED+date,p);jdbc.update("MERGE INTO product_setting(setting_key,setting_value) KEY(setting_key) VALUES ('team_name',?)",name);
    jdbc.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES (CURRENT_TIMESTAMP,'settings',?,'work-schedule-updated',?)",DATED+date,"{\"effectiveFrom\":\""+date+"\"}");
    return Map.of("teamName",name,"effectiveFrom",date.toString(),"hoursPerDay",p.hoursPerDay(),"workingDays",p.workingDays());
  }
  public static void validateBackup(JsonNode tables,ObjectMapper mapper){
    Set<String> sprintIds=new HashSet<>();tables.path("sprint").forEach(s->sprintIds.add(s.path("id").asText()));
    for(var s:tables.path("product_setting")){
      String key=s.path("setting_key").asText(),value=s.path("setting_value").asText();
      if(key.equals("team_name")&&(value.isBlank()||value.length()>100||value.chars().anyMatch(Character::isISOControl)))throw new IllegalArgumentException("Yedekte ekip adı geçersiz.");
      if(key.startsWith(DATED)||key.startsWith(SPRINT))try{
        if(key.startsWith(DATED)&&!LocalDate.parse(key.substring(DATED.length())).toString().equals(key.substring(DATED.length())))throw new IllegalArgumentException("Geçersiz takvim tarihi.");
        if(key.startsWith(SPRINT)&&!sprintIds.contains(key.substring(SPRINT.length())))throw new IllegalArgumentException("Çalışma düzeninin sprinti bulunamadı.");
        parse(mapper.readTree(value));
      }catch(Exception e){throw new IllegalArgumentException("Yedekte çalışma düzeni geçersiz: "+key,e);}
    }
  }
}
