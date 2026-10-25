package com.sprintboard;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Drains the backlog outbox. One item per tick keeps the whole application inside Jira's
 * one-request-per-second budget without needing a lock, and a stuck item can never starve the rest
 * because a failure always moves the row out of PENDING or pushes its next attempt forward.
 */
@Component
public class JiraPbiWorker {
 private final JiraPbiService pbi; private final boolean enabled;
 public JiraPbiWorker(JiraPbiService pbi,@Value("${sprintboard.jira.worker-enabled:true}") boolean enabled){this.pbi=pbi;this.enabled=enabled;}

 @Scheduled(fixedDelay=2000,initialDelay=20000) public void scheduled(){if(enabled)tick();}

 synchronized void tick(){
  try{pbi.sendNext();}
  catch(RuntimeException unexpected){/* the row keeps its own error state; the next tick retries */}
 }
}
