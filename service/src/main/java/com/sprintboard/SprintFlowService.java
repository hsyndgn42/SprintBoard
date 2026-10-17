package com.sprintboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Current blockers and append-only scope events; no retrospective reconstruction. */
@Service
public class SprintFlowService {
  private final JdbcTemplate jdbc; private final ObjectMapper mapper;
  public SprintFlowService(JdbcTemplate jdbc,ObjectMapper mapper){this.jdbc=jdbc;this.mapper=mapper;}
  private static Map<String,Object> map(Object... pairs){var m=new LinkedHashMap<String,Object>();for(int i=0;i<pairs.length;i+=2)m.put((String)pairs[i],pairs[i+1]);return m;}
  private String json(Object o){try{return mapper.writeValueAsString(o);}catch(Exception e){throw new IllegalStateException(e);}}
  private Object parse(String s){try{return mapper.readValue(s,Object.class);}catch(Exception e){throw new IllegalStateException("Akış kaydı okunamadı.",e);}}
  public static String reason(Map<String,Object> input){Object r=input.get("reason");if(!(r instanceof String s)||s.isBlank()||s.trim().length()>2000)throw new IllegalArgumentException("1–2000 karakter gerekçe gerekli.");return s.trim();}
  public static int version(Map<String,Object> input){Object v=input.get("version");if(!(v instanceof Number n)||n.doubleValue()!=n.intValue()||n.intValue()<0)throw new IllegalArgumentException("Geçerli kayıt sürümü gerekli.");return n.intValue();}
  public void enrich(List<Map<String,Object>> tasks){
    if(tasks.isEmpty())return;
    var additions=new HashMap<String,Map<?,?>>();var order=new HashMap<String,Integer>();int sequence=0;
    for(String raw:jdbc.queryForList("SELECT task_json FROM sprint_scope_event WHERE sprint_id=? AND action='ADDED' ORDER BY sequence_no",String.class,tasks.getFirst().get("sprintId"))){
      var t=(Map<?,?>)parse(raw);String id=String.valueOf(t.get("id"));additions.put(id,t);order.put(id,++sequence);
    }
    for(var t:tasks){t.put("blocker",blocker(t.get("id").toString()));t.put("scopeOrder",order.getOrDefault(t.get("id"),0));var addition=additions.get(t.get("id"));if(addition!=null){t.put("emergency",Boolean.TRUE.equals(addition.get("emergency")));t.put("addedDuringSprint",true);}}
  }
  public Map<String,Object> blocker(String task){var rows=jdbc.query("SELECT * FROM task_blocker WHERE task_id=?",(r,i)->map("blocked",r.getBoolean("blocked"),"reason",r.getString("reason"),"updatedAt",r.getString("updated_at"),"version",r.getInt("version")),task);return rows.isEmpty()?map("blocked",false,"reason","","updatedAt",null,"version",0):rows.getFirst();}
  public void begin(String sprint,List<Map<String,Object>> tasks,boolean starting){
    if(jdbc.queryForObject("SELECT COUNT(*) FROM sprint_flow WHERE sprint_id=?",Integer.class,sprint)>0)return;
    jdbc.update("INSERT INTO sprint_flow(sprint_id,origin,tracked_at,baseline_json,version) VALUES (?,?,?,?,0)",sprint,starting?"START":"OBSERVED",Instant.now().toString(),json(tasks));
  }
  public Map<String,Object> read(String sprint,List<Map<String,Object>> tasks){
    var rows=jdbc.queryForList("SELECT * FROM sprint_flow WHERE sprint_id=?",sprint);
    long wip=tasks.stream().filter(t->"doing".equals(t.get("status"))&&!BauPolicy.isBau(t)).count();
    long blocked=tasks.stream().filter(t->!BauPolicy.isBau(t)&&t.get("blocker") instanceof Map<?,?> b&&Boolean.TRUE.equals(b.get("blocked"))).count();
    if(rows.isEmpty())return map("origin","UNTRACKED","trackedAt",null,"baseline",List.of(),"events",List.of(),"version",0,"wipLimit",null,"wip",wip,"blocked",blocked,"currentCount",tasks.size(),"added",0,"removed",0);
    var row=rows.getFirst();var events=jdbc.query("SELECT * FROM sprint_scope_event WHERE sprint_id=? ORDER BY sequence_no",(r,i)->map("id",r.getString("id"),"action",r.getString("action"),"at",r.getString("occurred_at"),"reason",r.getString("reason"),"task",parse(r.getString("task_json"))),sprint);
    return map("origin",row.get("ORIGIN"),"trackedAt",row.get("TRACKED_AT"),"baseline",parse(jdbc.queryForObject("SELECT baseline_json FROM sprint_flow WHERE sprint_id=?",String.class,sprint)),"events",events,"version",row.get("VERSION"),"wipLimit",row.get("WIP_LIMIT"),"wip",wip,"blocked",blocked,"currentCount",tasks.size(),"added",events.stream().filter(e->"ADDED".equals(e.get("action"))).count(),"removed",events.stream().filter(e->"REMOVED".equals(e.get("action"))).count());
  }
  public void record(String sprint,String action,String reason,Map<String,Object> task){
    int sequence=jdbc.queryForObject("SELECT COALESCE(MAX(sequence_no),0)+1 FROM sprint_scope_event WHERE sprint_id=?",Integer.class,sprint);
    jdbc.update("INSERT INTO sprint_scope_event VALUES (?,?,?,?,?,?,?)",UUID.randomUUID().toString(),sprint,sequence,action,Instant.now().toString(),reason,json(task));
    jdbc.update("UPDATE sprint_flow SET version=version+1 WHERE sprint_id=?",sprint);
  }
  public void configure(String sprint,List<Map<String,Object>> tasks,Map<String,Object> input){
    int expected=version(input);var current=read(sprint,tasks);if(expected!=((Number)current.get("version")).intValue())throw new IllegalArgumentException("Akış bilgisi değişti; sayfayı yenileyin.");
    Object limit=input.get("wipLimit");if(limit!=null&&(!(limit instanceof Number n)||n.doubleValue()!=n.intValue()||n.intValue()<1||n.intValue()>1000))throw new IllegalArgumentException("WIP limiti 1–1000 tam sayı veya boş olmalı.");
    begin(sprint,tasks,false);jdbc.update("UPDATE sprint_flow SET wip_limit=?,version=version+1 WHERE sprint_id=?",limit,sprint);
  }
  public void resolveAutomaticBau(String id){
    var old=blocker(id);
    if(!Boolean.TRUE.equals(old.get("blocked")))return;
    String reason="BAU otomatik Done kapanışı.";
    jdbc.update("UPDATE task_blocker SET blocked=FALSE,reason=?,updated_at=?,version=version+1 WHERE task_id=?",reason,Instant.now().toString(),id);
    TaskActivity.record(jdbc,mapper,id,"UNBLOCKED",map("previous",old,"blocked",false,"reason",reason,"automaticBau",true));
  }
  @Transactional
  public Map<String,Object> setBlocker(String id,Map<String,Object> input){
    var ids=jdbc.queryForList("SELECT sprint_id FROM sprint_task WHERE id=?",String.class,id);if(ids.isEmpty())return null;
    String sprint=ids.getFirst();var status=jdbc.queryForObject("SELECT status FROM sprint WHERE id=? FOR UPDATE",String.class,sprint);
    if(!"active".equals(status))throw new IllegalArgumentException("Engel yalnız aktif sprintte değiştirilebilir.");
    var rows=jdbc.queryForList("SELECT * FROM sprint_task WHERE id=? FOR UPDATE",id);if(rows.isEmpty())throw new IllegalArgumentException("Görev artık sprintte değil.");
    var task=rows.getFirst();if(BauPolicy.isBau(task)&&Boolean.TRUE.equals(input.get("blocked")))throw new IllegalArgumentException("BAU otomatik Done kabul edilir; engel bildirilemez.");if(!List.of("todo","doing").contains(task.get("STATUS"))||"LEAVE".equals(task.get("WORK_KIND"))||"LEAVE".equals(task.get("TASK_SUBTYPE")))throw new IllegalArgumentException("Engel yalnız açık, izin dışındaki işlere uygulanır.");
    int expected=version(input);var old=blocker(id);if(expected!=((Number)old.get("version")).intValue())throw new IllegalArgumentException("Engel bilgisi değişti; sayfayı yenileyin.");
    if(!(input.get("blocked") instanceof Boolean b))throw new IllegalArgumentException("Engel durumu gerekli.");String reason=reason(input);
    jdbc.update("MERGE INTO task_blocker(task_id,blocked,reason,updated_at,version) KEY(task_id) VALUES (?,?,?,?,?)",id,b,reason,Instant.now().toString(),expected+1);
    TaskActivity.record(jdbc,mapper,id,b?"BLOCKED":"UNBLOCKED",map("previous",old,"blocked",b,"reason",reason));
    return blocker(id);
  }
}
