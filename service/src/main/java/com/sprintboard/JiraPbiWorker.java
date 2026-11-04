package com.sprintboard;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Drains the backlog outbox and keeps the Jira sprint in step. One item per tick keeps the whole
 * application inside Jira's one-request-per-second budget without needing a lock, and a stuck item
 * can never starve the rest because a failure always moves the row out of PENDING or pushes its
 * next attempt forward.
 */
@Component
public class JiraPbiWorker {
 private final JiraPbiService pbi; private final JiraSprintService sprints; private final boolean enabled;
 public JiraPbiWorker(JiraPbiService pbi,JiraSprintService sprints,@Value("${sprintboard.jira.worker-enabled:true}") boolean enabled){this.pbi=pbi;this.sprints=sprints;this.enabled=enabled;}

 @Scheduled(fixedDelay=2000,initialDelay=20000) public void scheduled(){if(enabled)tick();}

 synchronized void tick(){
  // PBIs come first: a sprint cannot be filled with issues that do not exist yet.
  try{if(pbi.sendNext())return;}
  catch(RuntimeException unexpected){return;/* the row keeps its own error state; the next tick retries */}
  try{sprints.syncNext();}
  catch(RuntimeException unexpected){/* the sprint row keeps its own error state */}
 }
}
