package com.sprintboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Flow D: one Jira epic per roadmap, either opened on demand or adopted from an existing issue.
 *
 * The link row is written before the call and updated afterwards. Jira has no idempotency key, so
 * the unique constraint on the pending row is what stops a double click from opening two epics.
 */
@Service
public class JiraEpicService {
 private final JdbcTemplate db; private final JiraConfigStore configs; private final JiraTransport transport; private final ObjectMapper mapper; private final Clock clock;
 public JiraEpicService(JdbcTemplate db,JiraConfigStore configs,JiraTransport transport,ObjectMapper mapper,Clock clock){this.db=db;this.configs=configs;this.transport=transport;this.mapper=mapper;this.clock=clock;}

 public Map<String,Object> create(String roadmapId){
  var config=configs.load();
  if(!config.enabled())throw new IllegalArgumentException("Jira entegrasyonu kapalı. Ayarlardan etkinleştirin.");
  if(config.projectKey().isBlank())throw new IllegalArgumentException("Jira proje anahtarı girilmemiş.");
  var roadmap=roadmap(roadmapId);
  if(!text(roadmap,"jira_epic_key").isBlank())throw new IllegalArgumentException("Bu roadmap için zaten epic var: "+text(roadmap,"jira_epic_key"));
  // Jira resolves the TC task to a portfolio epic, so an invented reference is rejected on their side.
  var defaults=new JiraFieldDefaults(mapper,config.fieldDefaults());
  if(text(roadmap,"reference_id").isBlank()&&defaults.text("defaultTcTaskId","").isBlank())
   throw new IllegalArgumentException("Bu roadmap hedefinde referans ID yok. Jira epic'i bir TC task'a bağlanmak zorunda; hedefi düzenleyip referans ID girin.");

  String linkId=reserve(roadmapId);
  try{
   var created=transport.post(config.baseUrl(),configs.token(),"/rest/api/2/issue",payload(config,roadmap));
   String key=created.path("key").asText();
   long issueId=created.path("id").asLong();
   if(key.isBlank())throw new IllegalStateException("Jira epic anahtarı dönmedi.");
   db.update("UPDATE jira_issue_link SET jira_issue_id=?,jira_issue_key=?,state='SENT',last_error='',updated_at=? WHERE id=?",issueId,key,now(),linkId);
   db.update("UPDATE roadmap_item SET jira_epic_key=? WHERE id=?",key,roadmapId);
   audit(roadmapId,"epic-created",Map.of("epicKey",key,"issueId",issueId));
   return Map.of("roadmapId",roadmapId,"jiraEpicKey",key,"jiraIssueId",issueId);
  }catch(RuntimeException failure){
   // Keep the failed row so the error stays visible, but allow another attempt.
   db.update("UPDATE jira_issue_link SET state='FAILED',attempts=attempts+1,last_error=?,updated_at=? WHERE id=?",message(failure),now(),linkId);
   audit(roadmapId,"epic-failed",Map.of("error",message(failure)));
   throw failure;
  }
 }

 private ObjectNode payload(JiraConfigStore.Config config,Map<String,Object> roadmap){
  var defaults=new JiraFieldDefaults(mapper,config.fieldDefaults());
  var fields=mapper.createObjectNode();
  fields.set("project",mapper.createObjectNode().put("key",config.projectKey()));
  fields.set("issuetype",mapper.createObjectNode().put("id",defaults.text("epicIssueTypeId","238")));
  String title=text(roadmap,"title");
  fields.put("summary",title);
  String description=text(roadmap,"description");
  fields.put("description",description.isBlank()?"SprintBoard roadmap kaydından açıldı; açıklama girilmedi.":description);
  fields.set("priority",mapper.createObjectNode().put("id",defaults.option("priorityByRoadmapPriority",text(roadmap,"priority"),"3")));
  // Epic Name is a separate required field from the summary and is capped at 255 characters.
  fields.put(defaults.text("epicNameFieldId","customfield_12874"),title.length()>255?title.substring(0,255):title);
  var extra=defaults.block("epicExtraFields");
  if(extra!=null)extra.fields().forEachRemaining(entry->fields.set(entry.getKey(),entry.getValue()));
  // The project links epics to a portfolio item through the TC task reference the roadmap already carries.
  String tcField=defaults.text("tcTaskFieldId","customfield_10356"),tcTask=text(roadmap,"reference_id");
  if(tcTask.isBlank())tcTask=defaults.text("defaultTcTaskId","");
  if(!tcTask.isBlank())fields.put(tcField,tcTask);
  var body=mapper.createObjectNode();body.set("fields",fields);return body;
 }

 /** Adopts an epic that already exists in Jira, such as a shared BAU epic, instead of opening a new one. */
 public Map<String,Object> link(String roadmapId,String epicKey){
  var config=configs.load();
  if(!config.enabled())throw new IllegalArgumentException("Jira entegrasyonu kapalı. Ayarlardan etkinleştirin.");
  String key=epicKey==null?"":epicKey.trim().toUpperCase(Locale.ROOT);
  if(!key.matches("[A-Z][A-Z0-9_]{1,20}-[0-9]{1,10}"))throw new IllegalArgumentException("Epic anahtarı geçersiz. Örn. VBCRF-356");
  var roadmap=roadmap(roadmapId);
  if(!text(roadmap,"jira_epic_key").isBlank())throw new IllegalArgumentException("Bu roadmap için zaten epic var: "+text(roadmap,"jira_epic_key"));

  var issue=transport.get(config.baseUrl(),configs.token(),"/rest/api/2/issue/"+key,Map.of("fields","issuetype,summary,project"));
  var fields=issue.path("fields");
  String issueType=fields.path("issuetype").path("id").asText(),expected=new JiraFieldDefaults(mapper,config.fieldDefaults()).text("epicIssueTypeId","238");
  if(!expected.equals(issueType))throw new IllegalArgumentException(key+" bir epic değil: "+fields.path("issuetype").path("name").asText("bilinmeyen tür"));
  String project=fields.path("project").path("key").asText();
  if(!config.projectKey().equalsIgnoreCase(project))throw new IllegalArgumentException(key+" başka bir projede: "+project);
  long issueId=issue.path("id").asLong();

  adopt(roadmapId,issueId,key);
  db.update("UPDATE roadmap_item SET jira_epic_key=? WHERE id=?",key,roadmapId);
  audit(roadmapId,"epic-linked",Map.of("epicKey",key,"issueId",issueId));
  return Map.of("roadmapId",roadmapId,"jiraEpicKey",key,"jiraIssueId",issueId,"summary",fields.path("summary").asText(""));
 }

 /** Only drops the local link; the Jira issue itself is left untouched because others may depend on it. */
 public Map<String,Object> unlink(String roadmapId){
  var roadmap=roadmap(roadmapId);
  String key=text(roadmap,"jira_epic_key");
  if(key.isBlank())throw new IllegalArgumentException("Bu roadmap bir epic'e bağlı değil.");
  db.update("UPDATE roadmap_item SET jira_epic_key=NULL WHERE id=?",roadmapId);
  db.update("DELETE FROM jira_issue_link WHERE local_kind='roadmap' AND local_id=?",roadmapId);
  audit(roadmapId,"epic-unlinked",Map.of("epicKey",key));
  return Map.of("roadmapId",roadmapId,"jiraEpicKey","","removedFromJira",false);
 }

 private void adopt(String roadmapId,long issueId,String key){
  var existing=db.queryForList("SELECT id,state FROM jira_issue_link WHERE local_kind='roadmap' AND local_id=?",roadmapId);
  if(existing.isEmpty()){
   db.update("INSERT INTO jira_issue_link(id,local_kind,local_id,jira_issue_id,jira_issue_key,state,created_at,updated_at) VALUES(?,'roadmap',?,?,?,'SENT',?,?)",
     "jiralink-"+UUID.randomUUID(),roadmapId,issueId,key,now(),now());
   return;
  }
  if("PENDING".equals(String.valueOf(existing.getFirst().get("state"))))throw new IllegalArgumentException("Bu roadmap için epic açma isteği sürüyor.");
  db.update("UPDATE jira_issue_link SET jira_issue_id=?,jira_issue_key=?,state='SENT',last_error='',updated_at=? WHERE id=?",
    issueId,key,now(),String.valueOf(existing.getFirst().get("id")));
 }

 private Map<String,Object> roadmap(String roadmapId){
  var rows=db.queryForList("SELECT id,title,description,priority,reference_id,jira_epic_key FROM roadmap_item WHERE id=?",roadmapId);
  if(rows.isEmpty())throw new IllegalArgumentException("Roadmap kaydı bulunamadı.");
  return rows.getFirst();
 }

 /** A pending row claims the roadmap; a previous failure may be retried, a success may not. */
 private String reserve(String roadmapId){
  var existing=db.queryForList("SELECT id,state,jira_issue_key FROM jira_issue_link WHERE local_kind='roadmap' AND local_id=?",roadmapId);
  if(!existing.isEmpty()){
   String state=String.valueOf(existing.getFirst().get("state"));
   if("SENT".equals(state))throw new IllegalArgumentException("Bu roadmap için zaten epic var: "+existing.getFirst().get("jira_issue_key"));
   if("PENDING".equals(state))throw new IllegalArgumentException("Bu roadmap için epic açma isteği sürüyor.");
   String id=String.valueOf(existing.getFirst().get("id"));
   db.update("UPDATE jira_issue_link SET state='PENDING',last_error='',updated_at=? WHERE id=?",now(),id);
   return id;
  }
  String id="jiralink-"+UUID.randomUUID();
  try{db.update("INSERT INTO jira_issue_link(id,local_kind,local_id,state,created_at,updated_at) VALUES(?,'roadmap',?,'PENDING',?,?)",id,roadmapId,now(),now());}
  catch(org.springframework.dao.DuplicateKeyException raced){throw new IllegalArgumentException("Bu roadmap için epic açma isteği sürüyor.");}
  return id;
 }

 private static String message(RuntimeException failure){
  String text=failure.getMessage();
  return text==null||text.isBlank()?"Bilinmeyen hata":text.length()>900?text.substring(0,900):text;
 }
 private static String text(Map<String,Object> row,String key){var value=row.get(key);return value==null?"":String.valueOf(value).trim();}
 private String now(){return clock.instant().toString();}
 private void audit(String roadmapId,String action,Map<String,Object> detail){
  try{
   var details=new LinkedHashMap<String,Object>(detail);details.put("actor",TaskActivity.actor());
   db.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES(?,?,?,?,?)",Timestamp.from(clock.instant()),"jira",roadmapId,action,mapper.writeValueAsString(details));
  }catch(Exception ignored){/* Auditing must never hide the real outcome. */}
 }
}
