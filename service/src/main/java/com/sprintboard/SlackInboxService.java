package com.sprintboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SlackInboxService {
 private final JdbcTemplate db;private final ObjectMapper mapper;private final WorkspaceService workspace;
 public SlackInboxService(JdbcTemplate db,ObjectMapper mapper,WorkspaceService workspace,SlackConfigStore configs){this.db=db;this.mapper=mapper;this.workspace=workspace;}
 private String json(Object value){try{return mapper.writeValueAsString(value);}catch(Exception e){throw new IllegalStateException("Slack kaydı yazılamadı.");}}
 @SuppressWarnings("unchecked") private Map<String,Object> parsed(String value){try{return mapper.readValue(value,Map.class);}catch(Exception e){throw new IllegalStateException("Slack kaydı okunamadı.");}}
 @Transactional public void accept(String team,String channel,String ts,String user,String raw,String template,int version){
  String key=team+":"+channel+":"+ts;if(db.queryForObject("SELECT COUNT(*) FROM slack_inbox WHERE source_key=?",Integer.class,key)>0)return;
  var p=SlackDefectParser.parse(raw,template);String id="slack-"+UUID.randomUUID();
  try{db.update("INSERT INTO slack_inbox(id,source_key,team_id,channel_id,message_ts,user_id,source_url,raw_text,parsed_json,config_version,received_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",id,key,team,channel,ts,user,"https://app.slack.com/client/"+team+"/"+channel+"/thread/"+channel+"-"+ts,p.get("raw"),json(p),version,Instant.now().toString(),Boolean.TRUE.equals(p.get("valid"))?"PENDING":"INVALID");}catch(org.springframework.dao.DuplicateKeyException duplicate){return;/* Slack retries are idempotent. */}
  if(Boolean.TRUE.equals(p.get("valid")))SlackReceiptService.enqueue(db,team,channel,ts);
 }
 private Map<String,Object> row(java.sql.ResultSet r)throws java.sql.SQLException{
  var p=new LinkedHashMap<String,Object>(parsed(r.getString("parsed_json")));p.put("id",r.getString("id"));p.put("status",r.getString("status"));p.put("sourceUrl",r.getString("source_url"));p.put("userId",r.getString("user_id"));p.put("reporterName",r.getString("reporter_name"));p.put("teamId",r.getString("team_id"));p.put("receivedAt",r.getString("received_at"));p.put("decidedBy",r.getString("decided_by"));p.put("decidedAt",r.getString("decided_at"));p.put("decisionNote",r.getString("decision_note"));p.put("backlogId",r.getString("backlog_id"));p.put("taskId",r.getString("task_id"));p.put("sprintId",r.getString("sprint_id"));return p;
 }
 public Map<String,Object> list(String filter,int page){
  if(!Set.of("WAITING","APPROVED","REJECTED","ALL").contains(filter)||page<0||page>100000)throw new IllegalArgumentException("Geçersiz kuyruk filtresi.");
  String where=switch(filter){case "WAITING"->" WHERE status IN ('PENDING','INVALID')";case "ALL"->"";default->" WHERE status='"+filter+"'";};
  return Map.of("items",db.query("SELECT * FROM slack_inbox"+where+" ORDER BY received_at DESC,id LIMIT 20 OFFSET ?",(r,n)->row(r),page*20),"total",db.queryForObject("SELECT COUNT(*) FROM slack_inbox"+where,Integer.class),"pending",db.queryForObject("SELECT COUNT(*) FROM slack_inbox WHERE status IN ('PENDING','INVALID')",Integer.class));
 }
 @Transactional public Map<String,Object> decide(String id,Map<String,Object> input,String actor){
  var rows=db.query("SELECT * FROM slack_inbox WHERE id=? FOR UPDATE",(r,n)->row(r),id);if(rows.isEmpty())throw new IllegalArgumentException("Slack kaydı bulunamadı.");var p=rows.getFirst();
  if(!Set.of("PENDING","INVALID").contains(p.get("status")))throw new IllegalArgumentException("Bu mesaj için daha önce karar verilmiş; listeyi yenileyin.");
  String action=Objects.toString(input.get("action"),""),note=SlackDefectParser.safe(Objects.toString(input.get("note"),"")).trim();
  if(note.length()>1000)throw new IllegalArgumentException("Karar notu en fazla 1.000 karakter.");
  String backlog=null,task=null,sprint=null;
  if(action.equals("APPROVE")){
   if(!Boolean.TRUE.equals(p.get("valid")))throw new IllegalArgumentException("Format hatalı; mesajı Slack'ten düzeltilmiş yeni mesaj olarak gönderin veya reddedin.");
   String target=Objects.toString(input.get("target"),p.get("target").toString());if(!Set.of("BACKLOG","SPRINT").contains(target))throw new IllegalArgumentException("Hedef BACKLOG veya SPRINT olmalı.");
   var draft=new LinkedHashMap<String,Object>();draft.put("title",p.get("title"));draft.put("taskCategory","DEFECT");draft.put("taskSubtype",p.get("taskSubtype"));draft.put("size",input.get("size"));draft.put("storyPoints",input.get("storyPoints"));draft.put("estimatedHours",0);draft.put("criteria","Slack bildirimi: "+p.get("sourceUrl"));draft.put("defect",Map.of("severity",p.get("severity"),"environment",p.get("environment"),"verification","NOT_CHECKED"));
   if(target.equals("SPRINT")){
    sprint=Objects.toString(input.get("sprintId"),"");var states=db.queryForList("SELECT status FROM sprint WHERE id=? FOR UPDATE",String.class,sprint);
    if(states.size()!=1||!states.getFirst().equals("active"))throw new IllegalArgumentException("Seçilen sprint artık aktif değil; güncel sprinti seçin veya backlog'a alın.");
    if(!Boolean.TRUE.equals(input.get("confirmed")))throw new IllegalArgumentException("Aktif sprint kapsamına eklemeyi onaylayın.");
    draft.put("readinessAcknowledged",true);draft.put("reason",note.isBlank()?"Slack defect bildirimi admin onayıyla eklendi.":note);draft.put("reserveTaskId",Objects.toString(input.get("reserveTaskId"),""));
    var added=workspace.createSprintTask(sprint,draft);task=added.get("id").toString();backlog=added.get("backlogId").toString();
   }else backlog=workspace.createBacklog(draft).get("id").toString();
   db.update("UPDATE defect_detail SET reporter_id=?,reporter_team_id=?,source_url=?,reporter_name=? WHERE backlog_id=?",p.get("userId"),p.get("teamId"),p.get("sourceUrl"),p.get("reporterName"),backlog);
  }else if(!action.equals("REJECT"))throw new IllegalArgumentException("Karar APPROVE veya REJECT olmalı.");
  String state=action.equals("APPROVE")?"APPROVED":"REJECTED";
  db.update("UPDATE slack_inbox SET status=?,decided_at=?,decided_by=?,decision_note=?,backlog_id=?,task_id=?,sprint_id=? WHERE id=?",state,Instant.now().toString(),actor,note,backlog,task,sprint,id);
  db.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES(CURRENT_TIMESTAMP,'slack-inbox',?,?,?)",id,state,json(Map.of("actor",actor,"backlogId",backlog==null?"":backlog,"note",note)));
  return Map.of("status",state,"backlogId",backlog==null?"":backlog,"sprintId",sprint==null?"":sprint);
 }
}
