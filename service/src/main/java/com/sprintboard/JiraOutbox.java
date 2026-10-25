package com.sprintboard;

import java.time.Clock;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Write side of flow A. Sprint work only claims a row here; the HTTP call happens later in the
 * worker, so a slow or unreachable Jira can never hold up the transaction that plans a sprint.
 *
 * Nothing is queued while the integration is off, otherwise switching it on months later would
 * flood Jira with the entire backlog history.
 */
@Component
public class JiraOutbox {
 private final JdbcTemplate db; private final JiraConfigStore configs; private final Clock clock;
 public JiraOutbox(JdbcTemplate db,JiraConfigStore configs,Clock clock){this.db=db;this.configs=configs;this.clock=clock;}

 public void enqueueBacklog(String backlogId){
  if(backlogId==null||backlogId.isBlank())return;
  if(!configs.load().enabled())return;
  claim(backlogId);
 }

 /** Returns false when a row already exists, which is how a re-add to another sprint stays silent. */
 boolean claim(String backlogId){
  String now=clock.instant().toString();
  try{
   return db.update("INSERT INTO jira_issue_link(id,local_kind,local_id,state,created_at,updated_at,next_attempt_at) VALUES(?,'backlog',?,'PENDING',?,?,?)",
     "jiralink-"+UUID.randomUUID(),backlogId,now,now,now)==1;
  }catch(org.springframework.dao.DuplicateKeyException alreadyQueued){return false;}
 }

 /** Lets an operator push a blocked or failed item again once the cause is fixed. */
 public void retry(String backlogId){
  var rows=db.queryForList("SELECT id,state FROM jira_issue_link WHERE local_kind='backlog' AND local_id=?",backlogId);
  if(rows.isEmpty()){
   if(!configs.load().enabled())throw new IllegalArgumentException("Jira entegrasyonu kapalı. Ayarlardan etkinleştirin.");
   claim(backlogId);
   return;
  }
  String state=String.valueOf(rows.getFirst().get("state"));
  if("SENT".equals(state))throw new IllegalArgumentException("Bu iş için zaten Jira kaydı var.");
  if("PENDING".equals(state))throw new IllegalArgumentException("Bu iş zaten gönderim sırasında.");
  String now=clock.instant().toString();
  db.update("UPDATE jira_issue_link SET state='PENDING',last_error='',next_attempt_at=?,updated_at=? WHERE id=?",now,now,rows.getFirst().get("id"));
 }

 /**
  * Dropping a local item must not delete the Jira issue: other people may already have commented
  * on it. The link row goes so nothing dangles, and the audit trail keeps the key visible.
  */
 public void forgetBacklog(String backlogId){
  db.update("DELETE FROM jira_issue_link WHERE local_kind='backlog' AND local_id=?",backlogId);
 }
}
