package com.sprintboard;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SlackOvertimeService {
 private final JdbcTemplate db;private final ObjectMapper mapper;private final CollaborationService collaboration;
 public SlackOvertimeService(JdbcTemplate db,ObjectMapper mapper,CollaborationService collaboration){this.db=db;this.mapper=mapper;this.collaboration=collaboration;}
 private String json(Object o){try{return mapper.writeValueAsString(o);}catch(Exception e){throw new IllegalStateException("Mesai mesajı kaydedilemedi.");}}
 @SuppressWarnings("unchecked") private Map<String,Object> parsed(String s){try{return mapper.readValue(s,Map.class);}catch(Exception e){throw new IllegalStateException("Mesai mesajı okunamadı.");}}
 @Transactional public void accept(String team,String channel,String ts,String user,String text,int version){
  String key=team+":"+channel+":"+ts;if(db.queryForObject("SELECT COUNT(*) FROM slack_overtime_inbox WHERE source_key=?",Integer.class,key)>0)return;
  var p=SlackOvertimeParser.parse(text,channel);
  try{db.update("INSERT INTO slack_overtime_inbox(id,source_key,team_id,channel_id,message_ts,user_id,source_url,raw_text,parsed_json,config_version,received_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)","slack-ot-"+UUID.randomUUID(),key,team,channel,ts,user,"https://app.slack.com/client/"+team+"/"+channel+"/thread/"+channel+"-"+ts,p.get("raw"),json(p),version,Instant.now().toString(),Boolean.TRUE.equals(p.get("valid"))?"PENDING":"INVALID");}catch(org.springframework.dao.DuplicateKeyException duplicate){return;/* Retry of an already persisted message. */}
  if(Boolean.TRUE.equals(p.get("valid")))SlackReceiptService.enqueue(db,team,channel,ts);
 }
 private Map<String,Object> row(java.sql.ResultSet r)throws java.sql.SQLException{
  var p=new LinkedHashMap<String,Object>(parsed(r.getString("parsed_json")));
  p.put("originalRaw",r.getString("raw_text"));p.put("fingerprint",fingerprint(r.getString("parsed_json")));p.put("channelId",r.getString("channel_id"));p.put("messageTs",r.getString("message_ts"));
  for(String[] names:new String[][]{{"id","id"},{"status","status"},{"reporterName","reporter_name"},{"sourceUrl","source_url"},{"userId","user_id"},{"teamId","team_id"},{"receivedAt","received_at"},{"decidedBy","decided_by"},{"decisionNote","decision_note"},{"memberId","member_id"},{"sprintId","sprint_id"},{"requestId","request_id"}})p.put(names[0],r.getString(names[1]));
  return p;
 }
 private String fingerprint(String value){try{return HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException("Mesai sürümü okunamadı.");}}
 private void admin(){var auth=org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();if(auth==null||auth.getAuthorities().stream().noneMatch(a->a.getAuthority().equals("ROLE_ADMIN")))throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN,"Yönetici yetkisi gerekli.");}
 @Transactional public Map<String,Object> correct(String id,Map<String,Object> input,String actor){
  admin();var rows=db.query("SELECT * FROM slack_overtime_inbox WHERE id=? FOR UPDATE",(r,n)->row(r),id);if(rows.isEmpty())throw new IllegalArgumentException("Mesai mesajı bulunamadı.");var current=rows.getFirst();
  if(!Set.of("PENDING","INVALID").contains(current.get("status")))throw new IllegalArgumentException("Sonuçlanmış mesaj düzenlenemez.");
  if(!Objects.equals(current.get("fingerprint"),input.get("fingerprint")))throw new IllegalArgumentException("Mesaj başka bir işlemde değişti; listeyi yenileyin.");
  if(!(input.get("text") instanceof String text))throw new IllegalArgumentException("Düzeltilmiş mesaj metni gerekli.");
  var correction=SlackOvertimeParser.parse(text,current.get("channelId").toString());if(!Boolean.TRUE.equals(correction.get("valid")))throw new IllegalArgumentException(String.join(" ",(List<String>)correction.get("errors")));
  correction.put("correctedBy",actor);correction.put("correctedAt",Instant.now().toString());
  db.update("UPDATE slack_overtime_inbox SET parsed_json=?,status='PENDING' WHERE id=?",json(correction),id);
  db.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES(CURRENT_TIMESTAMP,'slack-overtime',?,'CORRECTED',?)",id,json(Map.of("actor",actor,"sourceUrl",current.get("sourceUrl"),"senderId",current.get("userId"),"before",Map.of("date",current.get("date"),"hours",current.get("hours"),"sprintNumber",current.get("sprintNumber"),"reason",current.get("reason"),"raw",current.get("raw")),"after",correction)));
  String sourceKey=current.get("teamId")+":"+current.get("channelId")+":"+current.get("messageTs");
  if(db.queryForObject("SELECT COUNT(*) FROM slack_receipt_reaction WHERE source_key=?",Integer.class,sourceKey)==0)SlackReceiptService.enqueue(db,current.get("teamId").toString(),current.get("channelId").toString(),current.get("messageTs").toString());
  return Map.of("status","PENDING");
 }
 public Map<String,Object> list(String filter,int page){
  if(!Set.of("WAITING","APPROVED","REJECTED","ALL").contains(filter)||page<0||page>100000)throw new IllegalArgumentException("Geçersiz kuyruk filtresi.");
  String where=switch(filter){case "WAITING"->" WHERE status IN ('PENDING','INVALID')";case "ALL"->"";default->" WHERE status='"+filter+"'";};
  var items=db.query("SELECT * FROM slack_overtime_inbox"+where+" ORDER BY received_at DESC,id LIMIT 20 OFFSET ?",(r,n)->row(r),page*20);
  for(var p:items){
   var linked=db.queryForList("SELECT l.member_id FROM slack_member_link l JOIN member m ON m.id=l.member_id WHERE l.team_id=? AND l.user_id=? AND m.active=TRUE",String.class,p.get("teamId"),p.get("userId"));
   p.put("suggestedMemberId",linked.isEmpty()?"":linked.getFirst());
   var sprint=db.queryForList("SELECT id FROM sprint WHERE number=? AND status IN ('active','completed')",String.class,p.get("sprintNumber"));p.put("suggestedSprintId",sprint.size()==1?sprint.getFirst():"");
  }
  return Map.of("items",items,"total",db.queryForObject("SELECT COUNT(*) FROM slack_overtime_inbox"+where,Integer.class),"pending",db.queryForObject("SELECT COUNT(*) FROM slack_overtime_inbox WHERE status IN ('PENDING','INVALID')",Integer.class));
 }
 @Transactional public Map<String,Object> decide(String id,Map<String,Object> input,String actor){
  var auth=org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
  if(auth==null||auth.getAuthorities().stream().noneMatch(a->a.getAuthority().equals("ROLE_ADMIN")))throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN,"Yönetici yetkisi gerekli.");
  var rows=db.query("SELECT * FROM slack_overtime_inbox WHERE id=? FOR UPDATE",(r,n)->row(r),id);if(rows.isEmpty())throw new IllegalArgumentException("Mesai mesajı bulunamadı.");var p=rows.getFirst();
  if(!Set.of("PENDING","INVALID").contains(p.get("status")))throw new IllegalArgumentException("Mesaj zaten sonuçlandırılmış; listeyi yenileyin.");
  if((input.containsKey("fingerprint")||p.containsKey("correctedAt"))&&!Objects.equals(p.get("fingerprint"),input.get("fingerprint")))throw new IllegalArgumentException("Mesaj değişti; güncel bilgileri kontrol etmek için listeyi yenileyin.");
  String action=Objects.toString(input.get("action"),""),note=SlackDefectParser.safe(Objects.toString(input.get("note"),"")).strip();
  if(!Set.of("APPROVE","REJECT").contains(action)||note.isBlank()||note.length()>1000)throw new IllegalArgumentException("Onay/red ve 1–1.000 karakter karar notu gerekli.");
  String member=null,sprint=null,request=null;
  if(action.equals("APPROVE")){
   if(!Boolean.TRUE.equals(p.get("valid")))throw new IllegalArgumentException("Format hatalı; önce Mesajı düzelt ile alanları düzenleyip kaydedin.");
   if(!Boolean.TRUE.equals(input.get("confirmed")))throw new IllegalArgumentException("Gönderenin ekip üyesi eşleştirmesini ve mesaiyi onaylayın.");
   member=Objects.toString(input.get("memberId"),"");sprint=Objects.toString(input.get("sprintId"),"");
   var sprints=db.queryForList("SELECT * FROM sprint WHERE id=? FOR UPDATE",sprint);
   if(sprints.size()!=1||!Set.of("active","completed").contains(sprints.getFirst().get("STATUS")))throw new IllegalArgumentException("Aktif veya tamamlanan sprint seçin.");
   var s=sprints.getFirst();LocalDate date=LocalDate.parse(p.get("date").toString());
   if(s.get("START_DATE")==null||s.get("END_DATE")==null||date.isBefore(((java.sql.Date)s.get("START_DATE")).toLocalDate())||date.isAfter(((java.sql.Date)s.get("END_DATE")).toLocalDate())||date.isAfter(LocalDate.now(ZoneId.of("Europe/Istanbul"))))throw new IllegalArgumentException("Mesai tarihi seçilen sprint içinde ve en geç bugün olmalı.");
   if(db.queryForList("SELECT id FROM member WHERE id=? AND active=TRUE FOR UPDATE",String.class,member).isEmpty())throw new IllegalArgumentException("Etkin takım üyesi seçin.");
   double hours=((Number)p.get("hours")).doubleValue();
   if(db.queryForObject("SELECT COUNT(*) FROM overtime_request WHERE member_id=? AND work_date=? AND hours=? AND status<>'REJECTED'",Integer.class,member,date,hours)>0)throw new IllegalArgumentException("Aynı kişi, gün ve saat için bekleyen/onaylı mesai talebi var. Çift kayıt olmaması için mevcut talebi kontrol edin.");
   if(db.queryForObject("SELECT COALESCE(SUM(hours),0) FROM overtime_request WHERE member_id=? AND work_date=? AND status<>'REJECTED'",Double.class,member,date)+hours>24)throw new IllegalArgumentException("Bu kişinin gün içindeki mesai talepleri toplamı 24 saati aşamaz.");
   request=UUID.randomUUID().toString();
   db.update("INSERT INTO overtime_request(id,member_id,sprint_id,requester,work_date,hours,reason,status,created_at) VALUES(?,?,?,?,?,?,?,'PENDING',?)",request,member,sprint,"slack:"+p.get("teamId")+":"+p.get("userId"),date,hours,p.get("reason"),Instant.now().toString());
   collaboration.decide(request,Map.of("status","APPROVED","note",note,"taskId",Objects.toString(input.get("taskId"),""),"planMode",Objects.toString(input.get("planMode"),"UNPLANNED"),"planId",Objects.toString(input.get("planId"),"")));
   db.update("MERGE INTO slack_member_link(team_id,user_id,member_id,updated_by) KEY(team_id,user_id) VALUES(?,?,?,?)",p.get("teamId"),p.get("userId"),member,actor);
  }
  String status=action.equals("APPROVE")?"APPROVED":"REJECTED";
  db.update("UPDATE slack_overtime_inbox SET status=?,decided_at=?,decided_by=?,decision_note=?,member_id=?,sprint_id=?,request_id=? WHERE id=?",status,Instant.now().toString(),actor,note,member,sprint,request,id);
  db.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES(CURRENT_TIMESTAMP,'slack-overtime',?,?,?)",id,status,json(Map.of("actor",actor,"senderId",p.get("userId"),"teamId",p.get("teamId"),"memberId",Objects.toString(member,""),"sprintId",Objects.toString(sprint,""),"requestId",Objects.toString(request,""),"sourceUrl",p.get("sourceUrl"),"note",note)));
  return Map.of("status",status);
 }
}
