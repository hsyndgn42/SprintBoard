package com.sprintboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SlackBacklogService {
 private final JdbcTemplate db;private final ObjectMapper mapper;private final WorkspaceService workspace;
 public SlackBacklogService(JdbcTemplate db,ObjectMapper mapper,WorkspaceService workspace){this.db=db;this.mapper=mapper;this.workspace=workspace;}
 private String json(Object value){try{return mapper.writeValueAsString(value);}catch(Exception e){throw new IllegalStateException("İş isteği yazılamadı.");}}
 @SuppressWarnings("unchecked") private Map<String,Object> parsed(String value){try{return mapper.readValue(value,Map.class);}catch(Exception e){throw new IllegalStateException("İş isteği okunamadı.");}}
 @Transactional public void accept(String team,String channel,String ts,String user,String text,String template,int version){
  String key=team+":"+channel+":"+ts;if(db.queryForObject("SELECT COUNT(*) FROM slack_backlog_inbox WHERE source_key=?",Integer.class,key)>0)return;
  var p=SlackBacklogParser.parse(text,template,channel);
  try{db.update("INSERT INTO slack_backlog_inbox(id,source_key,team_id,channel_id,message_ts,user_id,source_url,raw_text,parsed_json,config_version,received_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)","slack-backlog-"+UUID.randomUUID(),key,team,channel,ts,user,"https://app.slack.com/client/"+team+"/"+channel+"/thread/"+channel+"-"+ts,p.get("raw"),json(p),version,Instant.now().toString(),Boolean.TRUE.equals(p.get("valid"))?"PENDING":"INVALID");}catch(org.springframework.dao.DuplicateKeyException duplicate){return;}
  if(Boolean.TRUE.equals(p.get("valid")))SlackReceiptService.enqueue(db,team,channel,ts);
 }
 private Map<String,Object> row(java.sql.ResultSet r)throws java.sql.SQLException{
  var p=new LinkedHashMap<>(parsed(r.getString("parsed_json")));
  SlackMessageCorrectionService.metadata(p,r);
  for(String[] keys:new String[][]{{"id","id"},{"status","status"},{"reporterName","reporter_name"},{"userId","user_id"},{"teamId","team_id"},{"sourceUrl","source_url"},{"receivedAt","received_at"},{"decidedAt","decided_at"},{"decidedBy","decided_by"},{"decisionNote","decision_note"},{"backlogId","backlog_id"}})p.put(keys[0],r.getString(keys[1]));return p;
 }
 public Map<String,Object> list(String filter,int page){
  if(!Set.of("WAITING","APPROVED","REJECTED","ALL").contains(filter)||page<0||page>100000)throw new IllegalArgumentException("Geçersiz kuyruk filtresi.");
  String where=switch(filter){case "WAITING"->" WHERE status IN ('PENDING','INVALID')";case "ALL"->"";default->" WHERE status='"+filter+"'";};
  return Map.of("items",db.query("SELECT * FROM slack_backlog_inbox"+where+" ORDER BY received_at DESC,id LIMIT 20 OFFSET ?",(r,n)->row(r),page*20),"total",db.queryForObject("SELECT COUNT(*) FROM slack_backlog_inbox"+where,Integer.class),"pending",db.queryForObject("SELECT COUNT(*) FROM slack_backlog_inbox WHERE status IN ('PENDING','INVALID')",Integer.class));
 }
 @Transactional public Map<String,Object> decide(String id,Map<String,Object> input,String actor){
  var auth=org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
  if(auth==null||auth.getAuthorities().stream().noneMatch(a->a.getAuthority().equals("ROLE_ADMIN")))throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN,"Yönetici yetkisi gerekli.");
  var rows=db.query("SELECT * FROM slack_backlog_inbox WHERE id=? FOR UPDATE",(r,n)->row(r),id);if(rows.isEmpty())throw new IllegalArgumentException("İş isteği bulunamadı.");var p=rows.getFirst();
  if(!Set.of("PENDING","INVALID").contains(p.get("status")))throw new IllegalArgumentException("Bu istek zaten sonuçlandırılmış; listeyi yenileyin.");
  SlackMessageCorrectionService.checkDecision(p,input);
  String action=Objects.toString(input.get("action"),""),note=SlackDefectParser.safe(Objects.toString(input.get("note"),"")).strip(),backlog="";
  if(note.length()>1000)throw new IllegalArgumentException("Karar notu en fazla 1.000 karakter.");
  if(action.equals("APPROVE")){
   if(!Boolean.TRUE.equals(p.get("valid")))throw new IllegalArgumentException("Format hatalı; önce Mesajı düzelt ile alanları düzenleyip kaydedin.");
   String category=Objects.toString(input.get("taskCategory"),p.get("taskCategory").toString()),subtype=Objects.toString(input.get("taskSubtype"),"");
   if(!SlackBacklogParser.CATEGORIES.contains(category)||subtype.equals("LEAVE"))throw new IllegalArgumentException("İş isteği türü geçersiz; defect ve izinler kendi akışlarından girilmelidir.");
   String title=SlackDefectParser.safe(Objects.toString(input.get("title"),p.get("title").toString())).strip(),description=SlackDefectParser.safe(Objects.toString(input.get("description"),p.get("description").toString())).strip();
   if(description.isBlank()||description.length()>8000)throw new IllegalArgumentException("Açıklama 1–8.000 karakter olmalı.");
   Object raw=input.getOrDefault("estimatedHours",0);if(!(raw instanceof Number n)||!Double.isFinite(n.doubleValue())||n.doubleValue()<0||n.doubleValue()>10000)throw new IllegalArgumentException("Efor 0–10.000 saat olmalı.");
   var draft=new LinkedHashMap<String,Object>();draft.put("title",title);draft.put("criteria",description+"\n\nSlack iş isteği: "+p.get("sourceUrl"));draft.put("taskCategory",category);draft.put("taskSubtype",subtype);draft.put("size",input.get("size"));draft.put("storyPoints",input.get("storyPoints"));draft.put("estimatedHours",n.doubleValue());draft.put("roadmapId",Objects.toString(input.get("roadmapId"),""));
   backlog=workspace.createBacklog(draft).get("id").toString();
  }else if(!action.equals("REJECT"))throw new IllegalArgumentException("Karar APPROVE veya REJECT olmalı.");
  String state=action.equals("APPROVE")?"APPROVED":"REJECTED";
  db.update("UPDATE slack_backlog_inbox SET status=?,decided_at=?,decided_by=?,decision_note=?,backlog_id=? WHERE id=?",state,Instant.now().toString(),actor,note,backlog.isBlank()?null:backlog,id);
  var detail=new LinkedHashMap<String,Object>();detail.put("actor",actor);detail.put("sourceUrl",p.get("sourceUrl"));detail.put("requestId",id);detail.put("reporterId",p.get("userId"));detail.put("reporterName",p.get("reporterName"));detail.put("note",note);detail.put("backlogId",backlog);
  db.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES(CURRENT_TIMESTAMP,'slack-backlog',?,?,?)",id,state,json(detail));
  if(!backlog.isBlank())db.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES(CURRENT_TIMESTAMP,'backlog',?,'slack-request-approved',?)",backlog,json(detail));
  return Map.of("status",state,"backlogId",backlog);
 }
}
