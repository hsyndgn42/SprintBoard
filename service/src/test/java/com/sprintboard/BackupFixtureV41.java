package com.sprintboard;
import com.fasterxml.jackson.databind.node.ObjectNode;
/** Strips what the current schema added, so a fresh export can stand in for an older backup. */
final class BackupFixtureV41 {
 static void removeMatching(ObjectNode backup){
  ((ObjectNode)backup.path("tables")).remove(java.util.List.of("overtime_plan_link","jira_issue_link","jira_defect_inbox"));
  backup.path("tables").path("overtime_entry").forEach(r->((ObjectNode)r).remove("plan_classification"));
  backup.path("tables").path("roadmap_item").forEach(r->((ObjectNode)r).remove("jira_epic_key"));
 }
}
