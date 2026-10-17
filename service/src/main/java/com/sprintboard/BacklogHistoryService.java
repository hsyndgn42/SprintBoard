package com.sprintboard;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Read-only lineage from explicit repeat links, scope snapshots and durable task activity. */
@Service
public class BacklogHistoryService {
  private final JdbcTemplate db;private final ObjectMapper mapper;private final WorkspaceService workspace;
  public BacklogHistoryService(JdbcTemplate db,ObjectMapper mapper,WorkspaceService workspace){this.db=db;this.mapper=mapper;this.workspace=workspace;}
  private static Map<String,Object> map(Object... pairs){var r=new LinkedHashMap<String,Object>();for(int i=0;i<pairs.length;i+=2)r.put((String)pairs[i],pairs[i+1]);return r;}
  private JsonNode json(Object value){try{return mapper.readTree(value.toString());}catch(Exception e){throw new IllegalStateException("İş geçmişi okunamadı.",e);}}
  @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
  @SuppressWarnings("unchecked")
  public Map<String,Object> read(String id){
    var all=db.queryForList("SELECT id,title,state,repeat_of_id,created_at FROM backlog_item ORDER BY created_at,id");
    var byId=new LinkedHashMap<String,Map<String,Object>>();for(var r:all)byId.put(r.get("ID").toString(),r);
    if(!byId.containsKey(id))return null;
    var children=new HashMap<String,List<String>>();
    for(var r:all)if(r.get("REPEAT_OF_ID")!=null)children.computeIfAbsent(r.get("REPEAT_OF_ID").toString(),k->new ArrayList<>()).add(r.get("ID").toString());
    var family=new LinkedHashSet<String>();var queue=new ArrayDeque<String>();queue.add(id);
    while(!queue.isEmpty()){
      String next=queue.removeFirst();if(!byId.containsKey(next)||!family.add(next))continue;
      Object parent=byId.get(next).get("REPEAT_OF_ID");if(parent!=null)queue.add(parent.toString());
      queue.addAll(children.getOrDefault(next,List.of()));
    }
    var attempts=new LinkedHashMap<String,Map<String,Object>>();
    for(var row:db.queryForList("SELECT id,backlog_id,sprint_id FROM sprint_task")){
      if(family.contains(row.get("BACKLOG_ID")))attempts.put(row.get("ID").toString(),map("taskId",row.get("ID"),"backlogId",row.get("BACKLOG_ID"),"sprintId",row.get("SPRINT_ID"),"removed",false));
    }
    // Removed tasks no longer exist in sprint_task; use durable identity, never title matching.
    for(var row:db.query("SELECT sprint_id,action,task_json FROM sprint_scope_event ORDER BY occurred_at,sequence_no",(rs,n)->map("sprint",rs.getString(1),"action",rs.getString(2),"task",rs.getString(3)))){
      var t=json(row.get("task"));if(!family.contains(t.path("backlogId").asText()))continue;
      String taskId=t.path("id").asText();var a=attempts.computeIfAbsent(taskId,k->map("taskId",k,"backlogId",t.path("backlogId").asText(),"sprintId",row.get("sprint"),"removed",false));
      if("REMOVED".equals(row.get("action"))){a.put("removed",true);a.put("statusNote",t.path("statusNote").asText());}
    }
    var activities=db.query("SELECT * FROM task_activity ORDER BY occurred_at,id",(rs,n)->map("id",rs.getString("id"),"taskId",rs.getString("task_id"),"sprintId",rs.getString("sprint_id"),"date",rs.getString("entry_date"),"at",rs.getString("occurred_at"),"actor",rs.getString("member_name"),"kind",rs.getString("kind"),"message",rs.getString("message"),"detail",rs.getString("detail_json")));
    for(var event:activities){
      var detail=json(event.get("detail"));
      if("added-to-sprint".equals(event.get("kind"))&&family.contains(detail.path("backlogId").asText())){
        String taskId=event.get("taskId").toString();
        attempts.computeIfAbsent(taskId,k->map("taskId",k,"backlogId",detail.path("backlogId").asText(),"sprintId",event.get("sprintId"),"removed",false));
      }
    }
    for(var event:activities){
      var attempt=attempts.get(event.get("taskId"));if(attempt==null)continue;
      if("removed-from-sprint".equals(event.get("kind")))attempt.put("removed",true);
      var d=json(event.remove("detail"));event.put("from",d.path("from").asText());event.put("to",d.path("to").asText());event.put("note",d.path("note").asText(d.path("reason").asText()));
      ((List<Map<String,Object>>)attempt.computeIfAbsent("events",k->new ArrayList<>())).add(event);
    }
    var sprints=new HashMap<String,Map<String,Object>>();
    for(var a:attempts.values()){
      String sprintId=a.get("sprintId").toString();var s=sprints.computeIfAbsent(sprintId,workspace::sprint);
      if(s==null)continue;
      a.putAll(map("sprintName",s.get("name"),"sprintNumber",s.get("number"),"start",s.get("start"),"end",s.get("end"),"frozen",Boolean.TRUE.equals(s.get("closureFrozen"))));
      var task=((List<Map<String,Object>>)s.get("items")).stream().filter(t->a.get("taskId").equals(t.get("id"))).findFirst();
      a.put("status",Boolean.TRUE.equals(a.get("removed"))?"removed":task.map(t->BauPolicy.isBau(t)?"done":t.get("status")).orElse("unknown"));
      if(task.isPresent()){a.put("statusNote",task.get().get("statusNote"));a.put("hours",task.get().get("estimatedHours"));}
      a.putIfAbsent("events",List.of());a.putIfAbsent("statusNote","");
    }
    var records=new ArrayList<Map<String,Object>>();
    for(var r:all)if(family.contains(r.get("ID"))){
      var visits=attempts.values().stream().filter(a->r.get("ID").equals(a.get("backlogId")))
          .sorted(Comparator.comparingInt(a->((Number)a.getOrDefault("sprintNumber",0)).intValue())).toList();
      records.add(map("id",r.get("ID"),"title",r.get("TITLE"),"state",r.get("STATE"),"repeatOfId",r.get("REPEAT_OF_ID"),"missingParent",r.get("REPEAT_OF_ID")!=null&&!byId.containsKey(r.get("REPEAT_OF_ID")),"attempts",visits));
    }
    return map("itemId",id,"records",records);
  }
}
