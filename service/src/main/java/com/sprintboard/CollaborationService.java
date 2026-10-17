package com.sprintboard;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Service
public class CollaborationService {
  private final JdbcTemplate db; private final ObjectMapper mapper; private final WorkspaceService workspace; private final SprintFlowService flow;
  public CollaborationService(JdbcTemplate db,ObjectMapper mapper,WorkspaceService workspace,SprintFlowService flow){this.db=db;this.mapper=mapper;this.workspace=workspace;this.flow=flow;}
  private static String text(Map<String,?> input,String key){return Objects.toString(input.get(key),"").trim();}
  private static String required(Map<String,?> input,String key,int max){String s=text(input,key);if(s.isBlank()||s.length()>max)throw new IllegalArgumentException(""+key+": 1–"+max+" karakter gerekli.");return s;}
  private boolean admin(){var a=SecurityContextHolder.getContext().getAuthentication();return a!=null&&a.getAuthorities().stream().anyMatch(r->r.getAuthority().equals("ROLE_ADMIN"));}
  private void requireAdmin(){if(!admin())throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Yönetici yetkisi gerekli.");}
  public Map<String,Object> identity(String username){
    var rows=db.query("SELECT m.id,m.name FROM app_user u JOIN member m ON m.id=u.member_id WHERE u.username=? AND u.active=TRUE AND m.active=TRUE",(r,i)->Map.<String,Object>of("memberId",r.getString(1),"memberName",r.getString(2)),username);
    return rows.isEmpty()?Map.of():rows.getFirst();
  }
  private Map<String,Object> self(){var me=identity(TaskActivity.actor());if(me.isEmpty())throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Hesabınız etkin bir takım üyesine bağlı değil. Yöneticiyle görüşün.");return me;}
  @Transactional public void link(String username,Map<String,String> input){
    requireAdmin();
    var users=db.queryForList("SELECT username FROM app_user WHERE username=? FOR UPDATE",String.class,username);if(users.isEmpty())throw new IllegalArgumentException("Hesap bulunamadı.");
    String member=text(input,"memberId");
    if(!member.isBlank()){
      if(db.queryForObject("SELECT COUNT(*) FROM member WHERE id=? AND active=TRUE",Integer.class,member)!=1)throw new IllegalArgumentException("Etkin takım üyesi seçin.");
      if(db.queryForObject("SELECT COUNT(*) FROM app_user WHERE member_id=? AND username<>?",Integer.class,member,username)>0)throw new IllegalArgumentException("Bu üye başka bir hesaba bağlı.");
    }
    db.update("UPDATE app_user SET member_id=?,session_version=session_version+1 WHERE username=?",member.isBlank()?null:member,username);
    audit("account",username,"MEMBER_LINKED",Map.of("memberId",member));
  }
  private Map<String,Object> lockSprint(String sprint){
    var rows=db.queryForList("SELECT * FROM sprint WHERE id=? FOR UPDATE",sprint);if(rows.isEmpty())throw new IllegalArgumentException("Sprint bulunamadı.");return rows.getFirst();
  }
  private Map<String,Object> ownTask(String task,boolean allowAdmin){
    var ids=db.queryForList("SELECT sprint_id FROM sprint_task WHERE id=?",String.class,task);if(ids.isEmpty())throw new IllegalArgumentException("Görev bulunamadı.");
    var sprint=lockSprint(ids.getFirst());
    if(!"active".equals(sprint.get("STATUS"))||db.queryForObject("SELECT COUNT(*) FROM sprint_closure WHERE sprint_id=?",Integer.class,ids.getFirst())>0)throw new IllegalArgumentException("Yalnız aktif sprintte işlem yapılabilir.");
    var rows=db.queryForList("SELECT * FROM sprint_task WHERE id=? FOR UPDATE",task);if(rows.isEmpty())throw new IllegalArgumentException("Görev sprintten çıkarılmış.");
    var t=rows.getFirst();
    if("LEAVE".equals(t.get("WORK_KIND"))||"LEAVE".equals(t.get("TASK_SUBTYPE")))throw new IllegalArgumentException("İzin görevi otomatik yönetilir.");
    if(!(allowAdmin&&admin())){
      var me=self();
      if(db.queryForObject("SELECT COUNT(*) FROM assignment WHERE task_id=? AND member_id=?",Integer.class,task,me.get("memberId"))==0)throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Yalnız size atanan görevlerde işlem yapabilirsiniz.");
    }
    return t;
  }
  @Transactional public Object status(String task,Map<String,Object> input){
    if(!Set.of("status","note","expectedStatus").containsAll(input.keySet()))throw new IllegalArgumentException("Yalnız görev durumu ve açıklaması değiştirilebilir.");
    var t=ownTask(task,false);
    if(!Objects.equals(t.get("STATUS"),input.get("expectedStatus")))throw new IllegalArgumentException("Görev durumu değişmiş. Panoyu yenileyin.");
    if(text(input,"note").length()>2000)throw new IllegalArgumentException("Açıklama en fazla 2000 karakter.");
    return workspace.updateTask(task,input);
  }
  @Transactional public Object blocker(String task,Map<String,Object> input){ownTask(task,false);return flow.setBlocker(task,input);}
  private LocalDate day(Map<String,?> input,String key,Map<String,Object> sprint){
    LocalDate day;try{day=LocalDate.parse(text(input,key));}catch(Exception e){throw new IllegalArgumentException("Geçerli gün seçin.");}
    if(sprint.get("START_DATE")==null||sprint.get("END_DATE")==null||day.isBefore(((java.sql.Date)sprint.get("START_DATE")).toLocalDate())||day.isAfter(((java.sql.Date)sprint.get("END_DATE")).toLocalDate())||day.isAfter(LocalDate.now(ZoneId.of("Europe/Istanbul"))))throw new IllegalArgumentException("Gün sprint tarihleri içinde ve en geç bugün olmalı.");return day;
  }
  @Transactional public Object note(String task,Map<String,Object> input){
    var t=ownTask(task,true);var s=lockSprint(t.get("SPRINT_ID").toString());var date=day(input,"date",s);var me=identity(TaskActivity.actor());
    String body=required(input,"message",2000);
    TaskActivity.append(db,mapper,t.get("SPRINT_ID").toString(),task,t.get("TITLE").toString(),TaskActivity.actor(),Objects.toString(me.get("memberName"),TaskActivity.actor()),date,"WORK_NOTE",body,Map.of());
    return Map.of("saved",true);
  }
  public Object journal(String sprint){
    return db.query("SELECT * FROM task_activity WHERE sprint_id=? ORDER BY entry_date DESC,occurred_at DESC,id DESC",(r,i)->{
      var m=new LinkedHashMap<String,Object>();m.put("id",r.getString("id"));m.put("taskId",r.getString("task_id"));m.put("taskTitle",r.getString("task_title"));m.put("actor",r.getString("actor"));m.put("memberName",r.getString("member_name"));m.put("date",r.getString("entry_date"));m.put("createdAt",r.getString("occurred_at"));m.put("kind",r.getString("kind"));m.put("message",r.getString("message"));
      try{m.put("details",mapper.readValue(r.getString("detail_json"),Object.class));}catch(Exception e){throw new IllegalStateException("Günlük okunamadı.");}return m;
    },sprint);
  }
  @Transactional public Object request(Map<String,Object> input){
    String sprint=required(input,"sprintId",100);var s=lockSprint(sprint);var me=self();
    if(!Set.of("active","completed").contains(s.get("STATUS")))throw new IllegalArgumentException("Aktif veya tamamlanan sprint seçin.");
    LocalDate date=day(input,"date",s);String reason=required(input,"reason",1000);double hours;
    try{hours=Double.parseDouble(text(input,"hours"));}catch(Exception e){throw new IllegalArgumentException("Mesai saati gerekli.");}
    if(!Double.isFinite(hours)||hours<=0||hours>24)throw new IllegalArgumentException("Mesai 0'dan büyük, en fazla 24 saat olmalı.");
    String id=required(input,"requestId",100);try{UUID.fromString(id);}catch(Exception e){throw new IllegalArgumentException("Talep anahtarı geçersiz.");}
    var existing=db.queryForList("SELECT * FROM overtime_request WHERE id=?",id);
    if(!existing.isEmpty()){
      var old=existing.getFirst();if(!TaskActivity.actor().equals(old.get("REQUESTER"))||!me.get("memberId").equals(old.get("MEMBER_ID"))||!sprint.equals(old.get("SPRINT_ID"))||hours!=((Number)old.get("HOURS")).doubleValue()||!reason.equals(old.get("REASON"))||!date.toString().equals(old.get("WORK_DATE").toString())||!text(input,"taskId").equals(Objects.toString(old.get("TASK_ID"),"")))throw new IllegalArgumentException("Talep anahtarı başka bir kayıt için kullanılmış.");return Map.of("id",id);
    }
    var context=OvertimeTaskContext.resolve(db,sprint,text(input,"taskId"),me.get("memberId").toString(),!admin());
    if(db.queryForObject("SELECT COUNT(*) FROM overtime_request WHERE member_id=? AND sprint_id=? AND work_date=? AND hours=? AND status<>'REJECTED'",Integer.class,me.get("memberId"),sprint,date,hours)>0)throw new IllegalArgumentException("Bu gün ve saat için bekleyen/onaylı talebiniz zaten var.");
    db.update("INSERT INTO overtime_request(id,member_id,sprint_id,requester,work_date,hours,reason,status,created_at) VALUES (?,?,?,?,?,?,?,'PENDING',?)",id,me.get("memberId"),sprint,TaskActivity.actor(),date,hours,reason,Instant.now().toString());
    db.update("UPDATE overtime_request SET task_id=?,task_title=? WHERE id=?",context.get("taskId"),context.get("taskTitle"),id);
    audit("overtime-request",id,"REQUESTED",Map.of("memberId",me.get("memberId"),"sprintId",sprint,"hours",hours));return Map.of("id",id);
  }
  public Object requests(){
    boolean all=admin();String member=all?"":Objects.toString(identity(TaskActivity.actor()).get("memberId"),"");
    return db.query("SELECT r.*,m.name member_name,s.name sprint_name FROM overtime_request r JOIN member m ON m.id=r.member_id JOIN sprint s ON s.id=r.sprint_id "+(all?"":"WHERE r.requester=? OR r.member_id=? ")+"ORDER BY r.created_at DESC",(r,i)->{
      var m=new LinkedHashMap<String,Object>();for(String key:List.of("id","member_id","sprint_id","requester","member_name","sprint_name","work_date","reason","status","created_at","decided_at","decided_by","decision_note","entry_id","task_id","task_title"))m.put(key,r.getString(key));m.put("hours",r.getDouble("hours"));return m;
    },all?new Object[]{}:new Object[]{TaskActivity.actor(),member});
  }
  @Transactional public Object decide(String id,Map<String,Object> input){
    requireAdmin();var ids=db.queryForList("SELECT sprint_id FROM overtime_request WHERE id=?",String.class,id);if(ids.isEmpty())throw new IllegalArgumentException("Talep bulunamadı.");lockSprint(ids.getFirst());
    var r=db.queryForMap("SELECT * FROM overtime_request WHERE id=? FOR UPDATE",id);
    if(!"PENDING".equals(r.get("STATUS")))throw new IllegalArgumentException("Talep zaten sonuçlandırılmış. Listeyi yenileyin.");
    String result=text(input,"status"),note=required(input,"note",1000);if(!Set.of("APPROVED","REJECTED").contains(result))throw new IllegalArgumentException("Onay veya red seçin.");
    if(TaskActivity.actor().equals(r.get("REQUESTER")))throw new IllegalArgumentException("Kendi talebinizi onaylayamazsınız; doğrudan admin mesai kaydını kullanın.");
    Object entry=null;
    if(result.equals("APPROVED")){
      var payload=new LinkedHashMap<String,Object>(Map.of("memberId",r.get("MEMBER_ID"),"sprintId",r.get("SPRINT_ID"),"earnedHours",r.get("HOURS"),"usedHours",0,"plannedHours",0,"includeInCapacity",false,"taskId",input.containsKey("taskId")?text(input,"taskId"):Objects.toString(r.get("TASK_ID"),""),"note","Onaylı mesai talebi · "+r.get("WORK_DATE")+" · "+id));
      payload.put("planMode",Objects.toString(input.get("planMode"),"UNPLANNED"));payload.put("planId",text(input,"planId"));
      entry=workspace.createOvertimeEntry(payload).get("id");
    }
    if(entry!=null){var context=db.queryForMap("SELECT task_id,task_title FROM overtime_entry WHERE id=?",entry);db.update("UPDATE overtime_request SET task_id=?,task_title=? WHERE id=?",context.get("TASK_ID"),context.get("TASK_TITLE"),id);}
    db.update("UPDATE overtime_request SET status=?,decided_at=?,decided_by=?,decision_note=?,entry_id=? WHERE id=?",result,Instant.now().toString(),TaskActivity.actor(),note,entry,id);
    audit("overtime-request",id,result,Map.of("note",note,"planId",text(input,"planId"),"planMode",Objects.toString(input.get("planMode"),"UNPLANNED"),"taskId",input.containsKey("taskId")?text(input,"taskId"):Objects.toString(r.get("TASK_ID"),"")));return Map.of("id",id,"status",result);
  }
  private void activeLeaveSprint(Map<String,Object> sprint){
    if(!"active".equals(sprint.get("STATUS"))||db.queryForObject("SELECT COUNT(*) FROM sprint_closure WHERE sprint_id=?",Integer.class,sprint.get("ID"))>0)
      throw new IllegalArgumentException("İzin talebi yalnız açık aktif sprintte işlenebilir. Kapanan sprint için yöneticiyle görüşün.");
  }
  private Map<String,Object> leaveInput(Map<String,Object> r){
    return Map.of("memberId",r.get("MEMBER_ID"),"sprintId",r.get("SPRINT_ID"),"days",r.get("DAYS"),"start",r.get("START_ON").toString(),"end",r.get("END_ON").toString(),"leaveType",r.get("LEAVE_TYPE"),"overtimeAccounting","DEBIT");
  }
  @Transactional public Object requestLeave(Map<String,Object> input){
    if(!Set.of("requestId","sprintId","start","end","days","leaveType","reason").containsAll(input.keySet()))throw new IllegalArgumentException("Talep yalnız kendi üyeniz için oluşturulabilir.");
    String sprint=required(input,"sprintId",100);var s=lockSprint(sprint);var me=self();activeLeaveSprint(s);
    String id=required(input,"requestId",100);try{UUID.fromString(id);}catch(Exception e){throw new IllegalArgumentException("Talep anahtarı geçersiz.");}
    String kind=text(input,"leaveType"),reason=required(input,"reason",1000);
    if(!Set.of("ANNUAL","OVERTIME").contains(kind))throw new IllegalArgumentException("Yıllık izin veya mesai hakedişi seçin.");
    LocalDate start,end;try{start=LocalDate.parse(text(input,"start"));end=LocalDate.parse(text(input,"end"));}catch(Exception e){throw new IllegalArgumentException("Başlangıç ve bitiş tarihleri gerekli.");}
    if(!(input.get("days") instanceof Number count)||!Double.isFinite(count.doubleValue())||count.doubleValue()<=0||count.doubleValue()>100||count.doubleValue()*2!=Math.rint(count.doubleValue()*2))throw new IllegalArgumentException("İzin yarım gün adımlı, 0,5–100 gün olmalı.");
    double days=count.doubleValue();
    var existing=db.queryForList("SELECT * FROM leave_request WHERE id=?",id);
    if(!existing.isEmpty()){
      var r=existing.getFirst();
      if(!TaskActivity.actor().equals(r.get("REQUESTER"))||!me.get("memberId").equals(r.get("MEMBER_ID"))||!sprint.equals(r.get("SPRINT_ID"))||!start.toString().equals(r.get("START_ON").toString())||!end.toString().equals(r.get("END_ON").toString())||days!=((Number)r.get("DAYS")).doubleValue()||!kind.equals(r.get("LEAVE_TYPE"))||!reason.equals(r.get("REASON")))throw new IllegalArgumentException("Talep anahtarı başka bir kayıt için kullanılmış.");
      return Map.of("id",id);
    }
    // Same lock order as LeaveLedger: sprint, member. Pending requests never create leave records.
    db.queryForList("SELECT id FROM member WHERE id=? FOR UPDATE",me.get("memberId"));
    if(db.queryForObject("SELECT COUNT(*) FROM leave_request WHERE member_id=? AND status='PENDING' AND start_on<=? AND end_on>=?",Integer.class,me.get("memberId"),java.sql.Date.valueOf(end),java.sql.Date.valueOf(start))>0)throw new IllegalArgumentException("Bu tarihlerle çakışan bekleyen izin talebiniz var.");
    new LeaveLedgerService(db,mapper).validateNew(Map.of("memberId",me.get("memberId"),"sprintId",sprint,"start",start.toString(),"end",end.toString(),"days",days,"leaveType",kind,"overtimeAccounting","DEBIT"));
    db.update("INSERT INTO leave_request(id,member_id,sprint_id,requester,start_on,end_on,days,leave_type,reason,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,'PENDING',?)",id,me.get("memberId"),sprint,TaskActivity.actor(),java.sql.Date.valueOf(start),java.sql.Date.valueOf(end),days,kind,reason,Instant.now().toString());
    audit("leave-request",id,"REQUESTED",Map.of("memberId",me.get("memberId"),"sprintId",sprint,"days",days,"leaveType",kind));
    return Map.of("id",id);
  }
  public Object leaveRequests(){
    boolean all=admin();String member=all?"":Objects.toString(identity(TaskActivity.actor()).get("memberId"),"");
    return db.query("SELECT r.*,m.name member_name,s.name sprint_name FROM leave_request r JOIN member m ON m.id=r.member_id JOIN sprint s ON s.id=r.sprint_id "+(all?"":"WHERE r.requester=? OR r.member_id=? ")+"ORDER BY r.created_at DESC",(r,i)->{
      var out=new LinkedHashMap<String,Object>();for(String key:List.of("id","member_id","sprint_id","requester","member_name","sprint_name","start_on","end_on","leave_type","reason","status","created_at","decided_at","decided_by","decision_note","entry_id"))out.put(key,r.getString(key));out.put("days",r.getDouble("days"));return out;
    },all?new Object[]{}:new Object[]{TaskActivity.actor(),member});
  }
  @Transactional public Object decideLeave(String id,Map<String,Object> input){
    requireAdmin();var ids=db.queryForList("SELECT sprint_id FROM leave_request WHERE id=?",String.class,id);if(ids.isEmpty())throw new IllegalArgumentException("Talep bulunamadı.");
    var s=lockSprint(ids.getFirst());var r=db.queryForMap("SELECT * FROM leave_request WHERE id=? FOR UPDATE",id);
    if(!"PENDING".equals(r.get("STATUS")))throw new IllegalArgumentException("Talep zaten sonuçlandırılmış. Listeyi yenileyin.");
    String result=text(input,"status"),note=required(input,"note",1000);if(!Set.of("APPROVED","REJECTED").contains(result))throw new IllegalArgumentException("Onay veya red seçin.");
    if(TaskActivity.actor().equals(r.get("REQUESTER")))throw new IllegalArgumentException("Kendi talebinizi onaylayamazsınız; doğrudan admin izin kaydını kullanın.");
    Object entry=null;
    if("APPROVED".equals(result)){
      activeLeaveSprint(s);
      if(db.queryForObject("SELECT COUNT(*) FROM member WHERE id=? AND active=TRUE",Integer.class,r.get("MEMBER_ID"))!=1)throw new IllegalArgumentException("Üye artık aktif değil.");
      entry=workspace.createLeave(leaveInput(r)).get("id");
    }
    db.update("UPDATE leave_request SET status=?,decided_at=?,decided_by=?,decision_note=?,entry_id=? WHERE id=?",result,Instant.now().toString(),TaskActivity.actor(),note,entry,id);
    audit("leave-request",id,result,Map.of("note",note,"entryId",Objects.toString(entry,"")));
    return Map.of("id",id,"status",result);
  }
  private void audit(String type,String id,String action,Map<String,?> details){
    var d=new LinkedHashMap<String,Object>(details);d.put("actor",TaskActivity.actor());try{db.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES(CURRENT_TIMESTAMP,?,?,?,?)",type,id,action,mapper.writeValueAsString(d));}catch(Exception e){throw new IllegalStateException("İşlem günlüğü kaydedilemedi.",e);}
  }
}
