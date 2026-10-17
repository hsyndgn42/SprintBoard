package com.sprintboard;

import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DefectService {
  private final JdbcTemplate jdbc;
  public DefectService(JdbcTemplate jdbc){this.jdbc=jdbc;}
  private String text(Map<String,Object> input,String key){var value=input.get(key);return value==null?"":value.toString().trim();}
  public static Map<String,Object> empty(){var r=new LinkedHashMap<String,Object>();r.put("severity","UNSET");r.put("environment","UNSET");r.put("relatedId",null);r.put("relatedTitle",null);r.put("verification","NOT_CHECKED");r.put("verifierId",null);r.put("verifierName",null);r.put("verificationNote","");r.put("verifiedAt",null);return r;}
  public Map<String,Map<String,Object>> all(){
    Map<String,Map<String,Object>> result=new HashMap<>();
    jdbc.query("SELECT d.*,b.title related_title,m.name verifier_name FROM defect_detail d LEFT JOIN backlog_item b ON b.id=d.related_id LEFT JOIN member m ON m.id=d.verifier_id",rs->{
      var row=empty();row.put("severity",rs.getString("severity"));row.put("environment",rs.getString("environment"));row.put("relatedId",rs.getString("related_id"));row.put("relatedTitle",rs.getString("related_title"));row.put("verification",rs.getString("verification"));row.put("verifierId",rs.getString("verifier_id"));row.put("verifierName",rs.getString("verifier_name"));row.put("verificationNote",rs.getString("verification_note"));row.put("verifiedAt",rs.getString("verified_at"));row.put("reporterName",rs.getString("reporter_name"));row.put("reporterId",rs.getString("reporter_id"));row.put("reporterTeamId",rs.getString("reporter_team_id"));row.put("sourceUrl",rs.getString("source_url"));result.put(rs.getString("backlog_id"),row);
    });return result;
  }
  @SuppressWarnings("unchecked")
  public void enrichReporterNames(List<Map<String,Object>> tasks){
    var details=all();
    for(var task:tasks){
      var current=details.get(task.get("backlogId"));var frozen=task.get("defect");
      if(current!=null&&current.get("reporterName")!=null&&frozen instanceof Map<?,?> old&&Objects.equals(old.get("reporterId"),current.get("reporterId"))&&Objects.equals(old.get("reporterTeamId"),current.get("reporterTeamId"))){
        var display=new LinkedHashMap<String,Object>((Map<String,Object>)old);display.put("reporterName",current.get("reporterName"));task.put("defect",display);
      }
    }
  }
  public void enrich(List<Map<String,Object>> rows,String idKey){var details=all();for(var row:rows)if("DEFECT".equals(row.get("taskCategory")))row.put("defect",details.getOrDefault(row.get(idKey),empty()));}
  @Transactional
  public Map<String,Object> save(String id,Map<String,Object> input){
    var rows=jdbc.queryForList("SELECT b.task_category,t.sprint_id,s.status FROM backlog_item b LEFT JOIN sprint_task t ON t.backlog_id=b.id LEFT JOIN sprint s ON s.id=t.sprint_id WHERE b.id=? FOR UPDATE",id);
    if(rows.isEmpty())return null;
    if(!"DEFECT".equals(rows.getFirst().get("TASK_CATEGORY")))throw new IllegalArgumentException("Bu alanlar yalnız Defect işleri içindir.");
    if("completed".equals(rows.getFirst().get("STATUS")))throw new IllegalArgumentException("Tamamlanan sprintin defect kaydı değiştirilemez.");
    var previous=all().getOrDefault(id,empty());
    input=new LinkedHashMap<>(input);
    for(String legacy:List.of("verification","verifierId","verificationNote"))if(!input.containsKey(legacy))input.put(legacy,previous.get(legacy));
    String severity=text(input,"severity"),environment=text(input,"environment"),verification=text(input,"verification");
    if(!Set.of("UNSET","CRITICAL","HIGH","MEDIUM","LOW").contains(severity))throw new IllegalArgumentException("Geçersiz defect önem derecesi.");
    if(!Set.of("UNSET","DEV","SIT","SAT","UAT","PREPROD","PROD","OTHER").contains(environment))throw new IllegalArgumentException("Geçersiz defect ortamı.");
    if(!Set.of("NOT_CHECKED","PENDING","PASSED","FAILED").contains(verification))throw new IllegalArgumentException("Geçersiz doğrulama sonucu.");
    String related=text(input,"relatedId"),verifier=text(input,"verifierId"),note=text(input,"verificationNote");
    if(note.length()>2000)throw new IllegalArgumentException("Doğrulama notu en fazla 2000 karakter olabilir.");
    if(id.equals(related)||!related.isBlank()&&jdbc.queryForObject("SELECT COUNT(*) FROM backlog_item WHERE id=?",Integer.class,related)==0)throw new IllegalArgumentException("İlgili iş bulunamadı veya iş kendisine bağlandı.");
    if(!verifier.isBlank()&&jdbc.queryForObject("SELECT COUNT(*) FROM member WHERE id=?",Integer.class,verifier)==0)throw new IllegalArgumentException("Doğrulayan kişi bulunamadı.");
    var old=all().getOrDefault(id,empty());
    boolean changed=!verification.equals(old.get("verification"))||!Objects.equals(verifier.isBlank()?null:verifier,old.get("verifierId"))||!note.equals(old.get("verificationNote"));
    Object at=Set.of("PASSED","FAILED").contains(verification)?changed?Instant.now().toString():old.get("verifiedAt"):null;
    jdbc.update("MERGE INTO defect_detail(backlog_id,severity,environment,related_id,verification,verifier_id,verification_note,verified_at) KEY(backlog_id) VALUES (?,?,?,?,?,?,?,?)",id,severity,environment,related.isBlank()?null:related,verification,verifier.isBlank()?null:verifier,note,at);
    jdbc.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES (CURRENT_TIMESTAMP,'backlog',?,'defect-updated',?)",id,"{\"verification\":\""+verification+"\",\"severity\":\""+severity+"\",\"environment\":\""+environment+"\"}");
    return all().get(id);
  }
  public void copy(String from,String to){jdbc.update("INSERT INTO defect_detail(backlog_id,severity,environment,related_id,reporter_id,reporter_team_id,source_url,reporter_name) SELECT ?,severity,environment,related_id,reporter_id,reporter_team_id,source_url,reporter_name FROM defect_detail WHERE backlog_id=?",to,from);}
  public void resetVerification(String id){jdbc.update("UPDATE defect_detail SET verification='NOT_CHECKED',verifier_id=NULL,verification_note='',verified_at=NULL WHERE backlog_id=?",id);}
}
