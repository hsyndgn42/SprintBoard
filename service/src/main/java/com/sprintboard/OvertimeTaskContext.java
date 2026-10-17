package com.sprintboard;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
final class OvertimeTaskContext {
 static Map<String,Object> resolve(JdbcTemplate db,String sprint,String task,String member,boolean assignedOnly){
  var result=new LinkedHashMap<String,Object>();for(String f:List.of("taskId","taskTitle","roadmapId","roadmapTitle"))result.put(f,null);
  if(task==null||task.isBlank())return result;
  var rows=db.queryForList("SELECT t.id,t.title,b.roadmap_id,r.title roadmap_title,t.work_kind,t.task_subtype FROM sprint_task t JOIN backlog_item b ON b.id=t.backlog_id LEFT JOIN roadmap_item r ON r.id=b.roadmap_id WHERE t.id=? AND t.sprint_id=?",task,sprint);
  if(rows.size()!=1)throw new IllegalArgumentException("Mesai görevi seçili sprintte bulunamadı; görev seçimini yenileyin.");
  var t=rows.getFirst();if("LEAVE".equals(t.get("WORK_KIND"))||"LEAVE".equals(t.get("TASK_SUBTYPE")))throw new IllegalArgumentException("İzin görevi için mesai kaydedilemez.");
  if(assignedOnly&&db.queryForObject("SELECT COUNT(*) FROM assignment WHERE task_id=? AND member_id=?",Integer.class,task,member)==0)throw new IllegalArgumentException("Mesai talebinde yalnız size atanmış görev seçebilirsiniz.");
  result.put("taskId",task);result.put("taskTitle",t.get("TITLE"));result.put("roadmapId",t.get("ROADMAP_ID"));result.put("roadmapTitle",t.get("ROADMAP_TITLE"));return result;
 }
}
