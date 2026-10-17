package com.sprintboard;
import com.fasterxml.jackson.databind.node.ObjectNode;
final class BackupFixtureV40 {
 static void removeMatching(ObjectNode backup){
  ((ObjectNode)backup.path("tables")).remove("overtime_plan_link");
  backup.path("tables").path("overtime_entry").forEach(r->((ObjectNode)r).remove("plan_classification"));
 }
}
