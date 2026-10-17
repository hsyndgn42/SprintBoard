package com.sprintboard;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.fasterxml.jackson.databind.JsonNode;

@Service
public class MemberCapacityService {
 private final JdbcTemplate j;
 public MemberCapacityService(JdbcTemplate j){this.j=j;}
 public record Policy(double hoursPerDay,int focusPercent){public double planningHours(){return hoursPerDay*focusPercent/100d;}}
 public Policy at(String member,LocalDate date,double teamHours){var rows=j.query("SELECT hours_per_day,focus_percent FROM member_capacity_policy WHERE member_id=? AND effective_from<=? ORDER BY effective_from DESC LIMIT 1",(rs,n)->new Policy(rs.getObject(1)==null?teamHours:rs.getDouble(1),rs.getInt(2)),member,java.sql.Date.valueOf(date));return rows.isEmpty()?new Policy(teamHours,100):rows.getFirst();}
 public Policy forSprint(String sprint,String member,double teamHours){var rows=j.query("SELECT hours_per_day,focus_percent FROM sprint_member_policy WHERE sprint_id=? AND member_id=?",(rs,n)->new Policy(rs.getDouble(1),rs.getInt(2)),sprint,member);return rows.isEmpty()?new Policy(teamHours,100):rows.getFirst();}
 public void capture(String sprint,LocalDate start,double teamHours){for(String member:j.queryForList("SELECT id FROM member",String.class)){var p=at(member,start,teamHours);j.update("INSERT INTO sprint_member_policy VALUES (?,?,?,?)",sprint,member,p.hoursPerDay(),p.focusPercent());}}
 public Map<String,Object> read(String member){
  if(j.queryForObject("SELECT COUNT(*) FROM member WHERE id=?",Integer.class,member)==0)return null;
  var rows=j.query("SELECT * FROM member_capacity_policy WHERE member_id=? ORDER BY effective_from DESC",(rs,n)->{Map<String,Object> row=new LinkedHashMap<>();row.put("effectiveFrom",rs.getDate("effective_from").toString());row.put("hoursPerDay",rs.getObject("hours_per_day"));row.put("focusPercent",rs.getInt("focus_percent"));return row;},member);
  return Map.of("memberId",member,"today",LocalDate.now(ZoneId.of("Europe/Istanbul")).toString(),"history",rows);
 }
 @Transactional public Map<String,Object> save(String member,Map<String,Object> input){
  if(read(member)==null)return null;
  LocalDate from;try{from=LocalDate.parse(Objects.toString(input.get("effectiveFrom"),""));}catch(Exception e){throw new IllegalArgumentException("Geçerlilik tarihi gerekli.");}
  if(from.isBefore(LocalDate.now(ZoneId.of("Europe/Istanbul"))))throw new IllegalArgumentException("Kapasite ayarı geçmiş tarihten başlatılamaz.");
  Object raw=input.get("hoursPerDay");Double hours=raw==null?null:raw instanceof Number n?n.doubleValue():Double.NaN;
  Object f=input.get("focusPercent");double focus=f instanceof Number n?n.doubleValue():Double.NaN;
  validate(hours,focus);
  j.queryForObject("SELECT setting_value FROM product_setting WHERE setting_key='estimation_mode' FOR UPDATE",String.class);
  var ids=j.queryForList("SELECT id FROM member_capacity_policy WHERE member_id=? AND effective_from=?",String.class,member,java.sql.Date.valueOf(from));
  if(ids.isEmpty())j.update("INSERT INTO member_capacity_policy VALUES (?,?,?,?,?)","member-policy-"+UUID.randomUUID(),member,java.sql.Date.valueOf(from),hours,(int)focus);
  else j.update("UPDATE member_capacity_policy SET hours_per_day=?,focus_percent=? WHERE id=?",hours,(int)focus,ids.getFirst());
  j.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES(CURRENT_TIMESTAMP,'member',?,'capacity-policy-updated',?)",member,"{\"effectiveFrom\":\""+from+"\",\"hoursPerDay\":"+hours+",\"focusPercent\":"+(int)focus+"}");
  return read(member);
 }
 private static void validate(Double hours,double focus){if(hours!=null&&(!Double.isFinite(hours)||hours<1||hours>24||hours*2!=Math.rint(hours*2)))throw new IllegalArgumentException("Günlük saat 1–24 arasında yarım saat adımlı olmalı; boşsa takım varsayılanı kullanılır.");if(!Double.isFinite(focus)||focus<0||focus>100||focus!=Math.rint(focus))throw new IllegalArgumentException("Odak oranı %0–100 arasında tam sayı olmalı.");}
 public static void validateBackup(JsonNode tables){for(String table:List.of("member_capacity_policy","sprint_member_policy"))for(var row:tables.path(table)){
   JsonNode h=row.path("hours_per_day"),f=row.path("focus_percent");if(!h.isNull()&&!h.isNumber()||!f.isIntegralNumber()||table.equals("sprint_member_policy")&&h.isNull())throw new IllegalArgumentException("Kişi kapasite yedeği geçersiz.");validate(h.isNull()?null:h.doubleValue(),f.doubleValue());
   if(table.equals("member_capacity_policy"))try{LocalDate.parse(row.path("effective_from").asText());}catch(Exception e){throw new IllegalArgumentException("Kapasite tarihi geçersiz.");}
  }}
}
