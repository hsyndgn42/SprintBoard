package com.sprintboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.security.MessageDigest;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class BacklogPlanningService {
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;
  public BacklogPlanningService(JdbcTemplate jdbc,ObjectMapper mapper) { this.jdbc=jdbc; this.mapper=mapper; }

  public void save(String id,Map<String,Object> input) {
    var stored=jdbc.queryForMap("SELECT priority,owner_id FROM backlog_item WHERE id=?",id);
    String priority=!input.containsKey("priority")?stored.get("PRIORITY").toString():input.get("priority")==null?"UNSET":input.get("priority").toString();
    if(!Set.of("UNSET","URGENT","HIGH","NORMAL","LOW").contains(priority))throw new IllegalArgumentException("Geçersiz öncelik.");
    Object ownerValue=input.containsKey("ownerId")?input.get("ownerId"):stored.get("OWNER_ID");
    String owner=ownerValue==null?"":ownerValue.toString();
    if(!owner.isBlank()&&jdbc.queryForObject("SELECT COUNT(*) FROM member WHERE id=?",Integer.class,owner)==0)throw new IllegalArgumentException("Sorumlu kişi bulunamadı.");
    Object raw=input.containsKey("dependencyIds")?input.get("dependencyIds"):jdbc.queryForList("SELECT depends_on_id FROM backlog_dependency WHERE backlog_id=?",String.class,id);
    if(!(raw instanceof List<?> list)||list.size()>100)throw new IllegalArgumentException("Bağımlılıklar en fazla 100 iş içerebilir.");
    Set<String> ids=new LinkedHashSet<>();
    for(Object value:(List<?>)raw) { if(!(value instanceof String text)||text.isBlank())throw new IllegalArgumentException("Geçersiz bağımlılık."); ids.add(text); }
    for(String dependency:ids) {
      if(id.equals(dependency))throw new IllegalArgumentException("Bir iş kendisine bağımlı olamaz.");
      if(jdbc.queryForObject("SELECT COUNT(*) FROM backlog_item WHERE id=?",Integer.class,dependency)==0)throw new IllegalArgumentException("Bağımlı olunan iş bulunamadı.");
    }
    Map<String,List<String>> graph=new HashMap<>();
    jdbc.query("SELECT backlog_id,depends_on_id FROM backlog_dependency",rs->{graph.computeIfAbsent(rs.getString(1),key->new ArrayList<>()).add(rs.getString(2));});
    graph.put(id,new ArrayList<>(ids));
    validateGraph(graph);
    jdbc.update("UPDATE backlog_item SET priority=?,owner_id=? WHERE id=?",priority,owner.isBlank()?null:owner,id);
    jdbc.update("DELETE FROM backlog_dependency WHERE backlog_id=?",id);
    for(String dependency:ids)jdbc.update("INSERT INTO backlog_dependency VALUES (?,?)",id,dependency);
  }
  public static void validateGraph(Map<String,List<String>> graph) {
    // Iterative topological check avoids stack overflows on long dependency chains.
    Map<String,Integer> incoming=new HashMap<>();
    graph.forEach((from,targets)->{incoming.putIfAbsent(from,0);for(String target:targets)incoming.merge(target,1,Integer::sum);});
    Deque<String> queue=new ArrayDeque<>(); incoming.forEach((id,count)->{if(count==0)queue.add(id);});
    int visited=0;
    while(!queue.isEmpty()){String id=queue.remove();visited++;for(String target:graph.getOrDefault(id,List.of()))if(incoming.merge(target,-1,Integer::sum)==0)queue.add(target);}
    if(visited!=incoming.size())throw new IllegalArgumentException("Döngüsel bağımlılık oluşturulamaz (A → B → A).");
  }
  private Map<String,List<Map<String,Object>>> dependencies() {
    Map<String,List<Map<String,Object>>> result=new HashMap<>();
    jdbc.query("SELECT d.backlog_id,b.id,b.title,b.state,t.status FROM backlog_dependency d JOIN backlog_item b ON b.id=d.depends_on_id LEFT JOIN sprint_task t ON t.backlog_id=b.id ORDER BY d.backlog_id,b.id",rs->{
      Map<String,Object> row=new LinkedHashMap<>();row.put("id",rs.getString("id"));row.put("title",rs.getString("title"));
      String status=rs.getString("status");row.put("status",status==null?rs.getString("state"):status);row.put("done","done".equals(status)||status==null&&"Done".equals(rs.getString("state")));
      result.computeIfAbsent(rs.getString("backlog_id"),key->new ArrayList<>()).add(row);
    });return result;
  }
  public void enrich(List<Map<String,Object>> items) {
    var dependencies=dependencies();
    String mode=jdbc.queryForObject("SELECT setting_value FROM product_setting WHERE setting_key='estimation_mode'",String.class);
    for(var item:items){var deps=dependencies.getOrDefault(item.get("id"),List.of());item.put("dependencies",deps);item.put("readiness",inspect(item,deps,mode));}
  }
  private Map<String,Object> inspect(Map<String,Object> item,List<Map<String,Object>> dependencies,String mode) {
    List<String> warnings=new ArrayList<>();
    if("UNSET".equals(item.get("priority")))warnings.add("Öncelik belirlenmemiş.");
    // Legacy owner fields remain backup-compatible, but are not part of backlog readiness.
    if(String.valueOf(item.getOrDefault("criteria","")).isBlank())warnings.add("Kabul kriterleri girilmemiş.");
    if("SIZE_AND_HOURS".equals(mode)&&item.get("size")==null)warnings.add("Ekip standardına göre Size eksik.");
    if("POINTS_AND_HOURS".equals(mode)&&(!(item.get("storyPoints") instanceof Number n)||n.doubleValue()<=0))warnings.add("Ekip standardına göre Story Point eksik.");
    if(!"BAU".equals(item.get("taskCategory"))&&item.get("estimatedHours") instanceof Number n&&n.doubleValue()<=0)warnings.add("Planlanan efor 0 saat; yalnız X destek olup olmadığını kontrol edin.");
    for(var dependency:dependencies)if(!Boolean.TRUE.equals(dependency.get("done")))warnings.add("Tamamlanmamış bağımlılık: "+dependency.get("title"));
    boolean eligible=item.get("taskId")==null&&"Ready".equals(item.get("state"));
    Map<String,Object> result=new LinkedHashMap<>();result.put("eligible",eligible);result.put("ready",eligible&&warnings.isEmpty());result.put("warnings",warnings);
    try {
      var factors=new LinkedHashMap<>(item);factors.remove("readiness");factors.put("estimationMode",mode);factors.put("dependencies",dependencies);
      result.put("fingerprint",HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsBytes(factors))));
    }catch(Exception e){throw new IllegalStateException("Hazırlık özeti üretilemedi.",e);}
    return result;
  }
}
