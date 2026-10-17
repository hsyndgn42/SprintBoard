package com.sprintboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;

/** Append-only product history. Call inside the same transaction as the task mutation. */
final class TaskActivity {
  private TaskActivity() {}
  static String actor() {
    var auth=SecurityContextHolder.getContext().getAuthentication();
    return auth==null||"anonymousUser".equals(auth.getName())?"system":auth.getName();
  }
  static void record(JdbcTemplate db,ObjectMapper mapper,String task,String kind,Object details) {
    var rows=db.queryForList("SELECT sprint_id,title FROM sprint_task WHERE id=?",task);
    if(rows.isEmpty())return;
    String actor=actor();
    var names=db.queryForList("SELECT m.name FROM app_user u JOIN member m ON m.id=u.member_id WHERE u.username=?",String.class,actor);
    append(db,mapper,rows.getFirst().get("SPRINT_ID").toString(),task,rows.getFirst().get("TITLE").toString(),actor,names.isEmpty()?actor:names.getFirst(),LocalDate.now(ZoneId.of("Europe/Istanbul")),kind,"",details);
  }
  static void append(JdbcTemplate db,ObjectMapper mapper,String sprint,String task,String title,String actor,String name,LocalDate day,String kind,String message,Object details){
    try {
      db.update("INSERT INTO task_activity VALUES (?,?,?,?,?,?,?,?,?,?,?)",UUID.randomUUID().toString(),sprint,task,title,actor,name,day,Instant.now().toString(),kind,message,mapper.writeValueAsString(details));
    } catch(com.fasterxml.jackson.core.JsonProcessingException e){throw new IllegalStateException("Görev günlüğü kaydedilemedi.",e);}
  }
}
