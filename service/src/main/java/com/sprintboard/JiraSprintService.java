package com.sprintboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Opens the Jira sprint that matches a SprintBoard sprint and keeps its PBIs inside it.
 *
 * Two problems forced this. A PBI created mid-sprint landed in the backlog of the Jira
 * board and someone had to drag it into the sprint by hand, and nothing recorded which
 * Jira sprint a SprintBoard sprint corresponded to, so the drag was guesswork.
 *
 * The work is driven by reconciliation rather than by a one-shot call at start time: the
 * PBI for a task added this morning may not exist yet when the sprint opens, and a sprint
 * may be started while Jira is unreachable. Each tick fixes whatever is still missing.
 */
@Service
public class JiraSprintService {
 private static final int MAX_ATTEMPTS=8;
 private static final long[] BACKOFF_SECONDS={60,300,900,1800,3600,7200,14400,28800};
 /** Jira accepts at most 50 keys per call; a smaller batch keeps one failure cheap. */
 private static final int BATCH=25;

 private final JdbcTemplate db; private final JiraConfigStore configs; private final JiraTransport transport; private final ObjectMapper mapper; private final Clock clock;
 public JiraSprintService(JdbcTemplate db,JiraConfigStore configs,JiraTransport transport,ObjectMapper mapper,Clock clock){
  this.db=db;this.configs=configs;this.transport=transport;this.mapper=mapper;this.clock=clock;
 }

 /** Marks a sprint as wanting a Jira sprint. Safe to call again; a sent sprint keeps its id. */
 public void request(String sprintId){
  if(sprintId==null||sprintId.isBlank())return;
  if(!configs.load().enabled())return;
  db.update("UPDATE sprint SET jira_sprint_state=CASE WHEN jira_sprint_id IS NULL THEN 'PENDING' ELSE 'SENT' END,jira_sprint_error='',jira_sprint_attempts=0,jira_sprint_retry_at=NULL WHERE id=?",sprintId);
 }

 /** Lists the board's open sprints so an operator picks a name instead of hunting for a number. */
 public List<Map<String,Object>> boardSprints(){
  var config=configs.load();
  if(!config.enabled())throw new IllegalArgumentException("Jira entegrasyonu kapalı.");
  String board=config.boardId().trim();
  if(!board.matches("[0-9]{1,18}"))throw new IllegalArgumentException("Jira ayarlarında geçerli bir Board ID yok. Sprintlerin listelenmesi için panoyu girin.");
  var found=transport.get(config.baseUrl(),configs.token(),"/rest/agile/1.0/board/"+board+"/sprint",Map.of("state","active,future","maxResults","50"));
  var out=new ArrayList<Map<String,Object>>();
  for(var sprint:found.path("values")){
   long id=sprint.path("id").asLong();
   if(id<=0)continue;
   out.add(Map.of("id",String.valueOf(id),"name",sprint.path("name").asText(""),"state",sprint.path("state").asText("")));
  }
  // Jira returns the oldest first; the sprint someone is looking for is almost always the newest.
  Collections.reverse(out);
  return out;
 }

 /**
  * Binds an existing Jira sprint instead of opening a new one. The sprint is read back from
  * Jira first, because a typo in the id would otherwise push the whole sprint into a stranger's
  * board and nothing would look wrong here.
  */
 public Map<String,Object> link(String sprintId,String jiraSprintId){
  var config=configs.load();
  if(!config.enabled())throw new IllegalArgumentException("Jira entegrasyonu kapalı.");
  String wanted=jiraSprintId==null?"":jiraSprintId.trim();
  if(!wanted.matches("[0-9]{1,18}"))throw new IllegalArgumentException("Jira sprint kimliği yalnız rakamlardan oluşur. Jira sprintini açıp adres satırındaki sayıyı girin.");
  if(db.queryForObject("SELECT COUNT(*) FROM sprint WHERE id=?",Integer.class,sprintId)==0)return null;
  long id=Long.parseLong(wanted);
  var found=transport.get(config.baseUrl(),configs.token(),"/rest/agile/1.0/sprint/"+id,Map.of());
  String name=found.path("name").asText("");
  if(name.isBlank())throw new IllegalArgumentException("Jira'da "+id+" kimlikli bir sprint bulunamadı.");
  String board=config.boardId().trim(),origin=found.path("originBoardId").asText("");
  String warning=!board.isBlank()&&!origin.isBlank()&&!board.equals(origin)
    ?"Bu sprint "+origin+" numaralı panoya ait, ayarlardaki pano ise "+board+". İşler yine de bu sprinte aktarılacak.":"";
  // A different Jira sprint means the earlier placements no longer describe where the work sits.
  db.update("DELETE FROM jira_sprint_issue WHERE sprint_id=? AND ?<>COALESCE((SELECT jira_sprint_id FROM sprint WHERE id=?),-1)",sprintId,id,sprintId);
  db.update("UPDATE sprint SET jira_sprint_id=?,jira_sprint_name=?,jira_sprint_state='SENT',jira_sprint_error=?,jira_sprint_attempts=0,jira_sprint_retry_at=NULL WHERE id=?",id,name,warning,sprintId);
  audit(sprintId,"jira-sprint-linked",Map.of("jiraSprintId",id,"name",name));
  return status(sprintId);
 }

 public Map<String,Object> status(String sprintId){
  var rows=db.queryForList("SELECT jira_sprint_id,jira_sprint_name,jira_sprint_state,jira_sprint_error FROM sprint WHERE id=?",sprintId);
  if(rows.isEmpty())return null;
  var row=rows.getFirst();
  var out=new LinkedHashMap<String,Object>();
  out.put("sprintId",sprintId);
  out.put("enabled",configs.load().enabled());
  out.put("jiraSprintId",row.get("JIRA_SPRINT_ID")==null?"":String.valueOf(row.get("JIRA_SPRINT_ID")));
  out.put("name",Objects.toString(row.get("JIRA_SPRINT_NAME"),""));
  out.put("state",Objects.toString(row.get("JIRA_SPRINT_STATE"),""));
  out.put("error",Objects.toString(row.get("JIRA_SPRINT_ERROR"),""));
  out.put("placed",db.queryForObject("SELECT COUNT(*) FROM jira_sprint_issue WHERE sprint_id=?",Integer.class,sprintId));
  out.put("pending",db.queryForObject(waitingSql()+" AND t.sprint_id=?",Integer.class,sprintId));
  return out;
 }

 private static String waitingSql(){
  return """
    SELECT COUNT(*) FROM sprint_task t
    JOIN jira_issue_link l ON l.local_kind='backlog' AND l.local_id=t.backlog_id AND l.state='SENT'
    WHERE NOT EXISTS (SELECT 1 FROM jira_sprint_issue p WHERE p.sprint_id=t.sprint_id AND p.backlog_id=t.backlog_id)""";
 }

 /** One unit of work per call so the whole application stays inside Jira's request budget. */
 public boolean syncNext(){
  var config=configs.load();
  if(!config.enabled())return false;
  var waiting=db.queryForList("SELECT * FROM sprint WHERE jira_sprint_state IN ('PENDING','SENT') AND status IN ('active','planned') AND (jira_sprint_retry_at IS NULL OR jira_sprint_retry_at<=?) ORDER BY number LIMIT 1",now());
  if(waiting.isEmpty())return false;
  var sprint=waiting.getFirst();
  String id=String.valueOf(sprint.get("ID"));
  try{
   if(sprint.get("JIRA_SPRINT_ID")==null)return open(config,sprint);
   return place(config,id,((Number)sprint.get("JIRA_SPRINT_ID")).longValue());
  }catch(JiraTransport.RateLimited waitingOut){
   defer(id,attempts(sprint),waitingOut.seconds,"Jira istek sınırı; otomatik yeniden denenecek.");return true;
  }catch(JiraTransport.Rejected rejected){
   fail(id,message(rejected));return true;
  }catch(RuntimeException failure){
   if(attempts(sprint)+1>=MAX_ATTEMPTS)fail(id,message(failure));
   else defer(id,attempts(sprint),BACKOFF_SECONDS[Math.min(attempts(sprint),BACKOFF_SECONDS.length-1)],message(failure));
   return true;
  }
 }

 /**
  * Creating the sprint and activating it are separate steps because a board that already
  * has a running sprint refuses the second one. A future sprint still accepts issues, so a
  * refused activation is recorded as a note and never throws the created id away.
  */
 private boolean open(JiraConfigStore.Config config,Map<String,Object> sprint){
  String id=String.valueOf(sprint.get("ID")),board=config.boardId().trim();
  if(board.isBlank()){block(id,"Jira ayarlarında Board ID girilmemiş. Sprintin açılacağı panoyu girin.");return true;}
  if(!board.matches("[0-9]{1,18}")){block(id,"Board ID yalnız rakamlardan oluşmalı: "+board);return true;}
  String name=Objects.toString(sprint.get("NAME"),"").trim();
  if(name.isBlank()){block(id,"Sprint adı boş; Jira sprinti adsız açılamaz.");return true;}

  var body=mapper.createObjectNode();
  body.put("name",name);
  body.put("originBoardId",Long.parseLong(board));
  String goal=Objects.toString(sprint.get("GOAL"),"").trim();
  if(!goal.isBlank())body.put("goal",goal.length()>250?goal.substring(0,250):goal);
  String start=moment(sprint.get("START_DATE"),false),end=moment(sprint.get("END_DATE"),true);
  if(start!=null)body.put("startDate",start);
  if(end!=null)body.put("endDate",end);

  var created=transport.post(config.baseUrl(),configs.token(),"/rest/agile/1.0/sprint",body);
  long jiraId=created.path("id").asLong();
  if(jiraId<=0)throw new IllegalStateException("Jira sprint kimliği dönmedi.");
  db.update("UPDATE sprint SET jira_sprint_id=?,jira_sprint_name=?,jira_sprint_state='SENT',jira_sprint_error='',jira_sprint_attempts=0,jira_sprint_retry_at=NULL WHERE id=?",
    jiraId,created.path("name").asText(name),id);
  audit(id,"jira-sprint-created",Map.of("jiraSprintId",jiraId,"name",created.path("name").asText(name)));

  if("active".equals(sprint.get("STATUS"))&&start!=null&&end!=null){
   try{
    var change=mapper.createObjectNode();change.put("state","active");change.put("startDate",start);change.put("endDate",end);
    transport.post(config.baseUrl(),configs.token(),"/rest/agile/1.0/sprint/"+jiraId,change);
    audit(id,"jira-sprint-activated",Map.of("jiraSprintId",jiraId));
   }catch(RuntimeException refused){
    note(id,"Jira sprinti açıldı ama başlatılamadı: "+message(refused)+" Panodaki önceki sprinti kapatıp Jira'dan başlatabilirsiniz; işler yine bu sprinte aktarılır.");
    audit(id,"jira-sprint-activation-failed",Map.of("jiraSprintId",jiraId,"error",message(refused)));
   }
  }
  return true;
 }

 /** Moves the PBIs that belong to this sprint but are not in it yet. */
 private boolean place(JiraConfigStore.Config config,String sprintId,long jiraSprintId){
  var keys=db.queryForList("""
    SELECT t.backlog_id,l.jira_issue_key FROM sprint_task t
    JOIN jira_issue_link l ON l.local_kind='backlog' AND l.local_id=t.backlog_id AND l.state='SENT'
    WHERE t.sprint_id=? AND l.jira_issue_key IS NOT NULL AND l.jira_issue_key<>''
      AND NOT EXISTS (SELECT 1 FROM jira_sprint_issue p WHERE p.sprint_id=t.sprint_id AND p.backlog_id=t.backlog_id)
    ORDER BY t.id LIMIT """+" "+BATCH,sprintId);
  if(keys.isEmpty()){
   // Nothing is waiting right now, so stop polling this sprint until a PBI shows up.
   db.update("UPDATE sprint SET jira_sprint_retry_at=? WHERE id=?",clock.instant().plusSeconds(60).toString(),sprintId);
   return false;
  }
  var body=mapper.createObjectNode();var array=body.putArray("issues");
  for(var row:keys)array.add(Objects.toString(row.get("JIRA_ISSUE_KEY"),""));
  transport.post(config.baseUrl(),configs.token(),"/rest/agile/1.0/sprint/"+jiraSprintId+"/issue",body);
  for(var row:keys)
   db.update("MERGE INTO jira_sprint_issue(sprint_id,backlog_id,jira_issue_key,placed_at) KEY(sprint_id,backlog_id) VALUES(?,?,?,?)",
     sprintId,row.get("BACKLOG_ID"),row.get("JIRA_ISSUE_KEY"),now());
  db.update("UPDATE sprint SET jira_sprint_error='',jira_sprint_attempts=0,jira_sprint_retry_at=NULL WHERE id=?",sprintId);
  audit(sprintId,"jira-sprint-issues-placed",Map.of("jiraSprintId",jiraSprintId,"count",keys.size()));
  return true;
 }

 /** Jira wants a timestamp, so a start date opens the day and an end date closes it. */
 private String moment(Object date,boolean endOfDay){
  if(date==null)return null;
  LocalDate day=date instanceof java.sql.Date sql?sql.toLocalDate():date instanceof LocalDate local?local:LocalDate.parse(String.valueOf(date));
  var zone=ZoneId.systemDefault();
  var at=endOfDay?day.atTime(18,0):day.atTime(9,0);
  return at.atZone(zone).toOffsetDateTime().toString();
 }

 private static int attempts(Map<String,Object> sprint){return sprint.get("JIRA_SPRINT_ATTEMPTS") instanceof Number n?n.intValue():0;}
 private void block(String id,String reason){
  db.update("UPDATE sprint SET jira_sprint_state='BLOCKED',jira_sprint_error=?,jira_sprint_retry_at=NULL WHERE id=?",reason,id);
  audit(id,"jira-sprint-blocked",Map.of("reason",reason));
 }
 private void fail(String id,String reason){
  db.update("UPDATE sprint SET jira_sprint_state='FAILED',jira_sprint_attempts=jira_sprint_attempts+1,jira_sprint_error=?,jira_sprint_retry_at=NULL WHERE id=?",reason,id);
  audit(id,"jira-sprint-failed",Map.of("error",reason));
 }
 private void defer(String id,int attempts,long seconds,String reason){
  db.update("UPDATE sprint SET jira_sprint_attempts=jira_sprint_attempts+1,jira_sprint_error=?,jira_sprint_retry_at=? WHERE id=?",
    reason,clock.instant().plusSeconds(seconds).toString(),id);
 }
 private void note(String id,String text){db.update("UPDATE sprint SET jira_sprint_error=? WHERE id=?",text.length()>900?text.substring(0,900):text,id);}
 private void audit(String sprintId,String action,Map<String,Object> detail){
  try{
   var details=new LinkedHashMap<String,Object>(detail);details.put("actor","system");
   db.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES(?,?,?,?,?)",Timestamp.from(clock.instant()),"jira",sprintId,action,mapper.writeValueAsString(details));
  }catch(Exception ignored){/* an audit gap must not undo a successful send */}
 }
 private static String message(RuntimeException failure){
  String text=failure.getMessage();
  return text==null||text.isBlank()?"Bilinmeyen hata":text.length()>900?text.substring(0,900):text;
 }
 private String now(){return clock.instant().toString();}
}
