package com.sprintboard;

import com.fasterxml.jackson.databind.*;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Participation dates are inclusive; unknown historical boundaries are never guessed. */
@Service
public class ParticipationService {
 private final JdbcTemplate j; private final ObjectMapper m;
 public ParticipationService(JdbcTemplate j,ObjectMapper m){this.j=j;this.m=m;}
 public record Period(String joinedOn,String leftOn,boolean closed){}
 public List<Period> periods(String id){return j.query("SELECT joined_on,left_on,closed FROM member_participation WHERE member_id=? ORDER BY joined_on NULLS FIRST,id",(rs,n)->new Period(rs.getString(1),rs.getString(2),rs.getBoolean(3)),id);}
 public static boolean includes(Period p,LocalDate d){return (p.joinedOn()==null||!d.isBefore(LocalDate.parse(p.joinedOn())))&&(p.leftOn()!=null?!d.isAfter(LocalDate.parse(p.leftOn())):!p.closed());}
 public boolean at(String id,LocalDate d){return periods(id).stream().anyMatch(p->includes(p,d));}
 private String version(Object value){try{return HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(m.writeValueAsBytes(value)));}catch(Exception e){throw new IllegalStateException(e);}}
 public Map<String,Object> read(String id){if(j.queryForObject("SELECT COUNT(*) FROM member WHERE id=?",Integer.class,id)==0)return null;var list=periods(id);return Map.of("periods",list,"version",version(list));}
 public void initialize(String id,String joined){j.update("INSERT INTO member_participation VALUES(?,?,?,?,false)","participation-"+UUID.randomUUID(),id,joined==null||joined.isBlank()?null:java.sql.Date.valueOf(joined),null);}
 @Transactional public Map<String,Object> save(String id,Map<String,Object> input){
  j.queryForObject("SELECT setting_value FROM product_setting WHERE setting_key='estimation_mode' FOR UPDATE",String.class);
  var before=read(id);if(before==null)return null;
  if(!Objects.equals(before.get("version"),input.get("version")))throw new IllegalArgumentException("Katılım geçmişi başka bir işlemde değişti. Pencereyi yeniden açın; kaydedilmemiş taslağınızı önce kontrol edin.");
  JsonNode raw=m.valueToTree(input.get("periods"));var rows=parse(raw);
  j.update("DELETE FROM member_participation WHERE member_id=?",id);
  for(var p:rows)j.update("INSERT INTO member_participation VALUES(?,?,?,?,?)","participation-"+UUID.randomUUID(),id,p.joinedOn()==null?null:java.sql.Date.valueOf(p.joinedOn()),p.leftOn()==null?null:java.sql.Date.valueOf(p.leftOn()),p.closed());
  try{j.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES(CURRENT_TIMESTAMP,'member',?,'participation-updated',?)",id,m.writeValueAsString(Map.of("before",before.get("periods"),"after",rows)));}catch(Exception e){throw new IllegalStateException(e);}
  return read(id);
 }
 public static List<Period> parse(JsonNode raw){
  if(raw==null||!raw.isArray()||raw.isEmpty()||raw.size()>100)throw new IllegalArgumentException("En az bir, en fazla 100 katılım dönemi gerekli.");
  List<Period> rows=new ArrayList<>();
  for(var r:raw){if(!r.path("closed").isBoolean())throw new IllegalArgumentException("Dönem durumu gerekli.");String start=boundary(r.get("joinedOn")),end=boundary(r.get("leftOn"));boolean closed=r.path("closed").asBoolean();
   if(!closed&&end!=null||start!=null&&end!=null&&start.compareTo(end)>0)throw new IllegalArgumentException("Dönem tarihlerini kontrol edin; ayrılış katılımdan önce olamaz.");
   rows.add(new Period(start,end,closed));
  }
  rows.sort(Comparator.comparing(Period::joinedOn,Comparator.nullsFirst(Comparator.naturalOrder())));
  for(int i=0;i<rows.size();i++){var p=rows.get(i);if(i>0&&p.joinedOn()==null)throw new IllegalArgumentException("Yalnız ilk tarihsel dönemin katılımı belirsiz olabilir.");
   if(!p.closed()&&i<rows.size()-1)throw new IllegalArgumentException("Yeni katılım için önceki dönem kapanmış olmalı.");
   if(p.closed()&&p.leftOn()==null&&i>0)throw new IllegalArgumentException("Yeni kapalı dönemin ayrılış tarihi gerekli.");
   if(i>0){var previous=rows.get(i-1);if(previous.leftOn()!=null&&previous.leftOn().compareTo(p.joinedOn())>=0)throw new IllegalArgumentException("Katılım dönemleri çakışamaz; ayrılış günü döneme dahildir.");}
  }return rows;
 }
 private static String boundary(JsonNode n){if(n==null||n.isNull()||n.isTextual()&&n.asText().isBlank())return null;try{if(!n.isTextual())throw new Exception();return LocalDate.parse(n.asText()).toString();}catch(Exception e){throw new IllegalArgumentException("Katılım tarihi geçersiz.");}}
 public void capture(String sprint,LocalDate start,LocalDate end){
  for(String id:j.queryForList("SELECT id FROM member",String.class)){var periods=periods(id);var dates=start.datesUntil(end.plusDays(1)).filter(d->periods.stream().anyMatch(p->includes(p,d))).map(LocalDate::toString).toList();
   try{j.update("INSERT INTO sprint_member_presence VALUES(?,?,?)",sprint,id,m.writeValueAsString(dates));}catch(Exception e){throw new IllegalStateException(e);}
  }
 }
 /** Preserve captured participation on overlapping dates; extend only existing captured members. */
 public void resize(String sprint,LocalDate oldStart,LocalDate oldEnd,LocalDate start,LocalDate end){
  for(var row:j.query("SELECT member_id,days_json FROM sprint_member_presence WHERE sprint_id=?",(rs,n)->Map.of("MEMBER_ID",rs.getString(1),"DAYS_JSON",rs.getString(2)),sprint)){
   String member=row.get("MEMBER_ID").toString();var periods=periods(member);var dates=new TreeSet<String>();
   try{
    for(var value:m.readTree(row.get("DAYS_JSON").toString())){var day=LocalDate.parse(value.asText());if(!day.isBefore(start)&&!day.isAfter(end))dates.add(day.toString());}
    start.datesUntil(end.plusDays(1)).filter(d->d.isBefore(oldStart)||d.isAfter(oldEnd)).filter(d->periods.stream().anyMatch(p->includes(p,d))).forEach(d->dates.add(d.toString()));
    j.update("UPDATE sprint_member_presence SET days_json=? WHERE sprint_id=? AND member_id=?",m.writeValueAsString(dates),sprint,member);
   }catch(Exception e){throw new IllegalStateException("Sprint katılım günleri güncellenemedi.",e);}
  }
 }
 public List<LocalDate> days(String sprint,String member,LocalDate start,LocalDate end,Map<String,Object> legacy){
  var rows=j.queryForList("SELECT days_json FROM sprint_member_presence WHERE sprint_id=? AND member_id=?",String.class,sprint,member);
  if(!rows.isEmpty())try{List<LocalDate> result=new ArrayList<>();for(var n:m.readTree(rows.getFirst()))result.add(LocalDate.parse(n.asText()));return result;}catch(Exception e){throw new IllegalStateException(e);}
  // Existing sprints retain the legacy boundaries. New people do not silently enter a captured sprint.
  if(j.queryForObject("SELECT COUNT(*) FROM sprint_member_presence WHERE sprint_id=?",Integer.class,sprint)>0)return List.of();
  String joined=(String)legacy.get("joinedOn"),left=(String)legacy.get("leftOn");
  return start.datesUntil(end.plusDays(1)).filter(d->(joined==null||!d.isBefore(LocalDate.parse(joined)))&&(left==null||!d.isAfter(LocalDate.parse(left)))).toList();
 }
 public static void validateBackup(JsonNode tables,ObjectMapper m){
  Map<String,List<JsonNode>> grouped=new HashMap<>();Set<String> members=new HashSet<>();for(var member:tables.path("member"))members.add(member.path("id").asText());
  for(var row:tables.path("member_participation")){var p=m.createObjectNode();p.set("joinedOn",row.path("joined_on"));p.set("leftOn",row.path("left_on"));p.set("closed",row.path("closed"));grouped.computeIfAbsent(row.path("member_id").asText(),k->new ArrayList<>()).add(p);}
  if(!grouped.keySet().equals(members))throw new IllegalArgumentException("Her üyenin katılım geçmişi gerekli.");
  grouped.values().forEach(list->{var a=m.createArrayNode();list.forEach(a::add);parse(a);});
  Map<String,JsonNode> sprints=new HashMap<>();for(var s:tables.path("sprint"))sprints.put(s.path("id").asText(),s);
  for(var row:tables.path("sprint_member_presence"))try{var s=sprints.get(row.path("sprint_id").asText());var dates=m.readTree(row.path("days_json").asText());if(!dates.isArray()||s==null)throw new Exception();Set<String> seen=new HashSet<>();for(var d:dates){String day=LocalDate.parse(d.asText()).toString();if(!seen.add(day)||day.compareTo(s.path("start_date").asText())<0||day.compareTo(s.path("end_date").asText())>0)throw new Exception();}}catch(Exception e){throw new IllegalArgumentException("Sprint katılım günleri geçersiz.");}
 }
}

