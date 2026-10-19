package com.sprintboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Corrections change the local preview only; approval remains a separate transaction. */
@Service
public class SlackMessageCorrectionService {
 private final JdbcTemplate db;private final ObjectMapper mapper;private final SlackConfigStore configs;
 public SlackMessageCorrectionService(JdbcTemplate db,ObjectMapper mapper,SlackConfigStore configs){this.db=db;this.mapper=mapper;this.configs=configs;}
 static void admin(){var auth=org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();if(auth==null||auth.getAuthorities().stream().noneMatch(a->a.getAuthority().equals("ROLE_ADMIN")))throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN,"Yönetici yetkisi gerekli.");}
 static String fingerprint(String value){try{return HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException("Mesaj sürümü okunamadı.");}}
 static void metadata(Map<String,Object> p,ResultSet r)throws SQLException {p.put("originalRaw",r.getString("raw_text"));p.put("fingerprint",fingerprint(r.getString("parsed_json")));}
 static void checkDecision(Map<String,Object> p,Map<String,Object> input){if((input.containsKey("fingerprint")||p.containsKey("correctedAt"))&&!Objects.equals(p.get("fingerprint"),input.get("fingerprint")))throw new IllegalArgumentException("Mesaj değişti; güncel bilgileri kontrol etmek için listeyi yenileyin.");}
 private String json(Object value){try{return mapper.writeValueAsString(value);}catch(Exception e){throw new IllegalStateException("Mesaj düzeltmesi yazılamadı.");}}
 @SuppressWarnings("unchecked") private Map<String,Object> parsed(String value){try{return mapper.readValue(value,Map.class);}catch(Exception e){throw new IllegalStateException("Mesaj okunamadı.");}}
 @Transactional public Map<String,Object> correct(boolean backlog,String id,Map<String,Object> input,String actor){
  admin();String table=backlog?"slack_backlog_inbox":"slack_inbox";
  var rows=db.query("SELECT * FROM "+table+" WHERE id=? FOR UPDATE",(r,n)->{
   var row=new LinkedHashMap<String,Object>();for(String key:List.of("status","parsed_json","team_id","channel_id","message_ts","source_url","user_id","source_key"))row.put(key,r.getString(key));return row;
  },id);
  if(rows.isEmpty())throw new IllegalArgumentException("Slack mesajı bulunamadı.");var current=rows.getFirst();
  if(!Set.of("PENDING","INVALID").contains(current.get("status")))throw new IllegalArgumentException("Sonuçlanmış mesaj düzenlenemez.");
  if(!Objects.equals(fingerprint(current.get("parsed_json").toString()),input.get("fingerprint")))throw new IllegalArgumentException("Mesaj başka bir işlemde değişti; listeyi yenileyin.");
  if(!(input.get("text") instanceof String text)||text.length()>12000)throw new IllegalArgumentException("Düzeltilmiş mesaj en fazla 12.000 karakter olmalı.");
  var config=configs.load("","");
  var correction=new LinkedHashMap<>(backlog?SlackBacklogParser.parse(text,config.backlogTemplate(),current.get("channel_id").toString()):SlackDefectParser.parse(text,config.template()));
  if(!Boolean.TRUE.equals(correction.get("valid")))throw new IllegalArgumentException(String.join(" ",(List<String>)correction.get("errors")));
  correction.put("correctedBy",actor);correction.put("correctedAt",Instant.now().toString());correction.put("correctionConfigVersion",config.version());
  db.update("UPDATE "+table+" SET parsed_json=?,status='PENDING' WHERE id=?",json(correction),id);
  db.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES(CURRENT_TIMESTAMP,?,?,'CORRECTED',?)",backlog?"slack-backlog":"slack-inbox",id,json(Map.of("actor",actor,"sourceUrl",current.get("source_url"),"senderId",current.get("user_id"),"before",parsed(current.get("parsed_json").toString()),"after",correction)));
  if(db.queryForObject("SELECT COUNT(*) FROM slack_receipt_reaction WHERE source_key=?",Integer.class,current.get("source_key"))==0)SlackReceiptService.enqueue(db,current.get("team_id").toString(),current.get("channel_id").toString(),current.get("message_ts").toString());
  return Map.of("status","PENDING");
 }
}
