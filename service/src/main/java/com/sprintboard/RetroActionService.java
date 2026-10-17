package com.sprintboard;

import java.time.LocalDate;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Retro follow-up remains editable after sprint closure, independently of delivery status. */
@Service
public class RetroActionService {
 private final JdbcTemplate jdbc;
 private final WorkspaceService workspace;
 public RetroActionService(JdbcTemplate jdbc,WorkspaceService workspace){this.jdbc=jdbc;this.workspace=workspace;}
 private boolean exists(String sprint){return jdbc.queryForObject("SELECT COUNT(*) FROM sprint WHERE id=?",Integer.class,sprint)>0;}
 public List<Map<String,Object>> list(String sprint){
   if(!exists(sprint))return null;
   return jdbc.query("""
     SELECT a.*,m.name owner_name,m.active owner_active,b.title backlog_title,b.state backlog_state,t.sprint_id linked_sprint_id,t.status linked_task_status
     FROM retro_action a LEFT JOIN member m ON m.id=a.owner_id LEFT JOIN backlog_item b ON b.id=a.backlog_id
     LEFT JOIN sprint_task t ON t.backlog_id=b.id
     WHERE a.sprint_id=? ORDER BY CASE WHEN a.status IN ('DONE','CANCELLED') THEN 1 ELSE 0 END,a.due_date NULLS LAST,a.created_at,a.id
     """,(rs,i)->{
       Map<String,Object> row=new LinkedHashMap<>();
       row.put("id",rs.getString("id"));row.put("sprintId",rs.getString("sprint_id"));row.put("title",rs.getString("title"));row.put("description",rs.getString("description"));
       row.put("ownerId",rs.getString("owner_id"));row.put("ownerName",rs.getString("owner_name"));row.put("ownerActive",rs.getBoolean("owner_active"));
       row.put("dueDate",rs.getString("due_date"));row.put("status",rs.getString("status"));row.put("backlogId",rs.getString("backlog_id"));
       row.put("backlogTitle",rs.getString("backlog_title"));row.put("backlogState",rs.getString("backlog_state"));
       row.put("linkedSprintId",rs.getString("linked_sprint_id"));row.put("linkedTaskStatus",rs.getString("linked_task_status"));
       row.put("version",rs.getInt("version"));row.put("createdAt",rs.getString("created_at"));row.put("updatedAt",rs.getString("updated_at"));return row;
     },sprint);
 }
 private String text(Map<String,Object> input,String key){return Objects.toString(input.get(key),"").trim();}
 private Map<String,Object> find(String sprint,String id){return list(sprint).stream().filter(a->id.equals(a.get("id"))).findFirst().orElseThrow();}
 private Map<String,Object> lock(String sprint,String id){
   var rows=jdbc.queryForList("SELECT * FROM retro_action WHERE sprint_id=? AND id=? FOR UPDATE",sprint,id);return rows.isEmpty()?null:rows.getFirst();
 }
 private void version(Map<String,Object> input,Map<String,Object> row){
   if(!(input.get("version") instanceof Number n)||n.doubleValue()!=((Number)row.get("VERSION")).intValue())
     throw new IllegalArgumentException("Aksiyon başka bir işlemde değişti. Listeyi yenileyip tekrar düzenleyin.");
 }
 private void validate(Map<String,Object> input,Map<String,Object> previous){
   String title=text(input,"title"),description=text(input,"description"),owner=text(input,"ownerId"),backlog=text(input,"backlogId");
   if(title.isBlank()||title.length()>300)throw new IllegalArgumentException("Aksiyon başlığı 1–300 karakter olmalı.");
   if(description.length()>10000)throw new IllegalArgumentException("Aksiyon açıklaması en fazla 10.000 karakter olabilir.");
   if(!Set.of("OPEN","IN_PROGRESS","DONE","CANCELLED").contains(text(input,"status")))throw new IllegalArgumentException("Geçersiz aksiyon durumu.");
   if(!owner.isBlank()){
     var members=jdbc.queryForList("SELECT active FROM member WHERE id=?",owner);
     if(members.isEmpty())throw new IllegalArgumentException("Sorumlu kişi bulunamadı.");
     if(!Boolean.TRUE.equals(members.getFirst().get("ACTIVE"))&&(previous==null||!owner.equals(previous.get("OWNER_ID"))))
       throw new IllegalArgumentException("Yeni sorumlu olarak etkin bir ekip üyesi seçin.");
   }
   if(!backlog.isBlank()&&jdbc.queryForObject("SELECT COUNT(*) FROM backlog_item WHERE id=?",Integer.class,backlog)==0)throw new IllegalArgumentException("Bağlanacak backlog işi bulunamadı.");
   String date=text(input,"dueDate");
   if(!date.isBlank())try{LocalDate parsed=LocalDate.parse(date);if(parsed.getYear()<1900||parsed.getYear()>9999)throw new IllegalArgumentException();}catch(Exception e){throw new IllegalArgumentException("Geçerli hedef tarih girin.");}
 }
 private Object nullable(Map<String,Object> input,String key){String value=text(input,key);return value.isBlank()?null:value;}
 @Transactional public Map<String,Object> create(String sprint,Map<String,Object> input){
   if(!exists(sprint))return null;validate(input,null);String id="retro-"+UUID.randomUUID();
   jdbc.update("INSERT INTO retro_action(id,sprint_id,title,description,owner_id,due_date,status,backlog_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
     id,sprint,text(input,"title"),text(input,"description"),nullable(input,"ownerId"),nullable(input,"dueDate"),text(input,"status"),nullable(input,"backlogId"));
   audit(id,"retro-action-created");return find(sprint,id);
 }
 @Transactional public Map<String,Object> update(String sprint,String id,Map<String,Object> input){
   var row=lock(sprint,id);if(row==null)return null;version(input,row);validate(input,row);
   jdbc.update("UPDATE retro_action SET title=?,description=?,owner_id=?,due_date=?,status=?,backlog_id=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
     text(input,"title"),text(input,"description"),nullable(input,"ownerId"),nullable(input,"dueDate"),text(input,"status"),nullable(input,"backlogId"),id);
   audit(id,"retro-action-updated");return find(sprint,id);
 }
 @Transactional public Map<String,Object> createBacklog(String sprint,String id,Map<String,Object> input){
   var row=lock(sprint,id);if(row==null)return null;
   // A double click/retry cannot create two backlog items.
   if(row.get("BACKLOG_ID")!=null)return find(sprint,id);
   version(input,row);
   if(Set.of("DONE","CANCELLED").contains(row.get("STATUS")))throw new IllegalArgumentException("Backlog işi oluşturmak için aksiyon açık olmalı.");
   Map<String,Object> task=new HashMap<>(input);task.put("title",row.get("TITLE"));task.put("criteria",row.get("DESCRIPTION"));
   String owner=Objects.toString(row.get("OWNER_ID"),"");
   task.put("ownerId",!owner.isBlank()&&jdbc.queryForObject("SELECT COUNT(*) FROM member WHERE id=? AND active=TRUE",Integer.class,owner)>0?owner:"");
   Object raw=input.getOrDefault("estimatedHours",0);
   if(!(raw instanceof Number n)||!Double.isFinite(n.doubleValue())||n.doubleValue()<0)throw new IllegalArgumentException("Geçerli, negatif olmayan efor girin.");
   String backlog=workspace.createBacklog(task).get("id").toString();
   jdbc.update("UPDATE retro_action SET backlog_id=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",backlog,id);
   audit(id,"retro-backlog-created");return find(sprint,id);
 }
 private void audit(String id,String action){jdbc.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES(CURRENT_TIMESTAMP,'retro-action',?,?,'{}')",id,action);}
}
