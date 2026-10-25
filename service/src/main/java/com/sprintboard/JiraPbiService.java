package com.sprintboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Read side of flow A: turns one queued backlog item into a Jira PBI.
 *
 * Failures are split on purpose. A missing epic is BLOCKED because only a person can fix it, a
 * rejected payload is FAILED because resending the same body would fail identically, and anything
 * transient stays PENDING with a later attempt time.
 */
@Service
public class JiraPbiService {
 private static final int MAX_ATTEMPTS=8;
 private static final long[] BACKOFF_SECONDS={60,300,900,1800,3600,7200,14400,28800};

 private final JdbcTemplate db; private final JiraConfigStore configs; private final JiraTransport transport; private final ObjectMapper mapper; private final Clock clock;
 public JiraPbiService(JdbcTemplate db,JiraConfigStore configs,JiraTransport transport,ObjectMapper mapper,Clock clock){
  this.db=db;this.configs=configs;this.transport=transport;this.mapper=mapper;this.clock=clock;
 }

 /** One queued item per call so the caller controls the one-request-per-second pacing. */
 public boolean sendNext(){
  var due=db.queryForList("SELECT id,local_id,attempts FROM jira_issue_link WHERE local_kind='backlog' AND state='PENDING' AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY created_at LIMIT 1",now());
  if(due.isEmpty())return false;
  send(String.valueOf(due.getFirst().get("id")),String.valueOf(due.getFirst().get("local_id")),((Number)due.getFirst().get("attempts")).intValue());
  return true;
 }

 void send(String linkId,String backlogId,int attempts){
  var config=configs.load();
  if(!config.enabled()){block(linkId,backlogId,"Jira entegrasyonu kapalı.");return;}
  var item=item(backlogId);
  if(item==null){db.update("DELETE FROM jira_issue_link WHERE id=?",linkId);return;}
  String epic=text(item,"jira_epic_key");
  if(epic.isBlank()){block(linkId,backlogId,"Bağlı roadmap hedefinin Jira epic'i yok. Önce hedefe epic açın veya var olanı bağlayın.");return;}

  try{
   var created=transport.post(config.baseUrl(),configs.token(),"/rest/api/2/issue",payload(config,item,epic));
   String key=created.path("key").asText();
   if(key.isBlank())throw new IllegalStateException("Jira kayıt anahtarı dönmedi.");
   db.update("UPDATE jira_issue_link SET jira_issue_id=?,jira_issue_key=?,state='SENT',last_error='',next_attempt_at=NULL,attempts=attempts+1,updated_at=? WHERE id=?",
     created.path("id").asLong(),key,now(),linkId);
   audit(backlogId,"pbi-created",Map.of("pbiKey",key));
  }catch(JiraTransport.RateLimited waiting){
   defer(linkId,attempts,waiting.seconds,"Jira istek sınırı; otomatik yeniden denenecek.");
  }catch(JiraTransport.Rejected rejected){
   fail(linkId,backlogId,message(rejected));
  }catch(RuntimeException failure){
   if(attempts+1>=MAX_ATTEMPTS){fail(linkId,backlogId,message(failure));return;}
   defer(linkId,attempts,BACKOFF_SECONDS[Math.min(attempts,BACKOFF_SECONDS.length-1)],message(failure));
  }
 }

 private ObjectNode payload(JiraConfigStore.Config config,Map<String,Object> item,String epicKey){
  var defaults=new JiraFieldDefaults(mapper,config.fieldDefaults());
  var fields=mapper.createObjectNode();
  fields.set("project",mapper.createObjectNode().put("key",config.projectKey()));
  fields.set("issuetype",mapper.createObjectNode().put("id",defaults.text("pbiIssueTypeId","11500")));
  fields.put("summary",text(item,"title"));
  String criteria=text(item,"criteria");
  fields.put("description",criteria.isBlank()?"SprintBoard backlog kaydından açıldı; kabul kriteri girilmedi.":criteria);
  fields.set("priority",mapper.createObjectNode().put("id",defaults.option("priorityByRoadmapPriority",text(item,"priority"),"3")));
  fields.put(defaults.text("storyPointsFieldId","customfield_10663"),points(defaults,item));
  // Jira reports the epic link as optional but rejects a PBI without it.
  fields.put(defaults.text("epicLinkFieldId","customfield_12873"),epicKey);
  fields.set(defaults.text("pbiTypeFieldId","customfield_17670"),mapper.createObjectNode().put("id",defaults.option("pbiTypeByCategory",text(item,"task_category"),"30023")));
  fields.set(defaults.text("businessValueFieldId","customfield_27228"),mapper.createObjectNode().put("id",defaults.option("businessValueByPriority",text(item,"priority"),"30013")));
  String kpi=defaults.text("kpiIssueKey","");
  if(!kpi.isBlank())fields.putArray(defaults.text("kpiFieldId","customfield_32981")).addObject().put("key",kpi);
  String checklist=defaults.text("checklistOptionId","");
  if(!checklist.isBlank())fields.set(defaults.text("checklistFieldId","customfield_37172"),mapper.createObjectNode().put("id",checklist));
  var extra=defaults.block("pbiExtraFields");
  if(extra!=null)extra.fields().forEachRemaining(entry->fields.set(entry.getKey(),entry.getValue()));
  var body=mapper.createObjectNode();body.set("fields",fields);return body;
 }

 /** Story points are the unit Jira plans in, so an hours-only estimate is mapped through the size. */
 private int points(JiraFieldDefaults defaults,Map<String,Object> item){
  var stored=item.get("story_points");
  if(stored instanceof Number number&&number.intValue()>0)return number.intValue();
  return defaults.number("sizePoints",text(item,"size_code").toUpperCase(Locale.ROOT),1);
 }

 private Map<String,Object> item(String backlogId){
  var rows=db.queryForList("""
    SELECT b.id,b.title,b.criteria,b.story_points,b.size_code,b.task_category,b.priority,r.jira_epic_key
    FROM backlog_item b LEFT JOIN roadmap_item r ON r.id=b.roadmap_id WHERE b.id=?""",backlogId);
  return rows.isEmpty()?null:rows.getFirst();
 }

 private void block(String linkId,String backlogId,String reason){
  db.update("UPDATE jira_issue_link SET state='BLOCKED',last_error=?,next_attempt_at=NULL,updated_at=? WHERE id=?",reason,now(),linkId);
  audit(backlogId,"pbi-blocked",Map.of("reason",reason));
 }
 private void fail(String linkId,String backlogId,String reason){
  db.update("UPDATE jira_issue_link SET state='FAILED',attempts=attempts+1,last_error=?,next_attempt_at=NULL,updated_at=? WHERE id=?",reason,now(),linkId);
  audit(backlogId,"pbi-failed",Map.of("error",reason));
 }
 private void defer(String linkId,int attempts,long seconds,String reason){
  db.update("UPDATE jira_issue_link SET attempts=attempts+1,last_error=?,next_attempt_at=?,updated_at=? WHERE id=?",
    reason,clock.instant().plusSeconds(seconds).toString(),now(),linkId);
 }
 private void audit(String backlogId,String action,Map<String,Object> detail){
  try{
   var details=new LinkedHashMap<String,Object>(detail);details.put("actor","system");
   db.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES(?,?,?,?,?)",Timestamp.from(clock.instant()),"jira",backlogId,action,mapper.writeValueAsString(details));
  }catch(Exception ignored){/* an audit gap must not undo a successful send */}
 }
 private static String message(RuntimeException failure){
  String text=failure.getMessage();
  return text==null||text.isBlank()?"Bilinmeyen hata":text.length()>900?text.substring(0,900):text;
 }
 private static String text(Map<String,Object> row,String key){var value=row.get(key);return value==null?"":String.valueOf(value).trim();}
 private String now(){return clock.instant().toString();}
}
