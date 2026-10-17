package com.sprintboard;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TaskSubtypeService {
 public static List<Map<String,Object>> defaults(){return List.of(
Map.of("code","FUNCTIONAL_TEST","category","TEST","label","Fonksiyonel Test","active",true,"system_type",true),
Map.of("code","E2E_TEST","category","TEST","label","E2E Test","active",true,"system_type",true),
Map.of("code","REGRESSION_TEST","category","TEST","label","Regresyon Testi","active",true,"system_type",true),
Map.of("code","PERFORMANCE_TEST","category","TEST","label","Performance Test","active",true,"system_type",true),
Map.of("code","GENERAL_TEST","category","TEST","label","Genel Test","active",true,"system_type",true),
Map.of("code","TEST_DEFECT","category","DEFECT","label","Test Defect","active",true,"system_type",true),
Map.of("code","PROD_DEFECT","category","DEFECT","label","Prod Defect","active",true,"system_type",true),
Map.of("code","SUPPORT","category","BAU","label","Support","active",true,"system_type",true),
Map.of("code","MEETING","category","BAU","label","Meeting","active",true,"system_type",true),
Map.of("code","TRAINING","category","BAU","label","Training","active",true,"system_type",true),
Map.of("code","LEAVE","category","BAU","label","Leave","active",true,"system_type",true),
Map.of("code","DEFECT_SUPPORT","category","BAU","label","Defect Support","active",true,"system_type",true),
Map.of("code","OTHER_BAU","category","BAU","label","Diğer BAU","active",true,"system_type",true));}
 private final JdbcTemplate jdbc;
 public TaskSubtypeService(JdbcTemplate jdbc){this.jdbc=jdbc;}
 public List<Map<String,Object>> list(){return jdbc.query("SELECT s.*,(SELECT COUNT(*) FROM backlog_item b WHERE b.task_subtype=s.code) usage_count FROM task_subtype s ORDER BY category,system_type DESC,label,code",(rs,i)->Map.of("code",rs.getString("code"),"category",rs.getString("category"),"label",rs.getString("label"),"active",rs.getBoolean("active"),"systemType",rs.getBoolean("system_type"),"protected",rs.getBoolean("system_type")&&"BAU".equals(rs.getString("category")),"usageCount",rs.getInt("usage_count")));}
 @Transactional public Map<String,Object> create(Map<String,Object> input){
   String category=Objects.toString(input.get("category"),""),label=Objects.toString(input.get("label"),"").trim();
   if(!Set.of("DEV","DESIGN","ANALYZE","TEST","DEFECT","BAU").contains(category))throw new IllegalArgumentException("Geçersiz ana iş türü.");
   if(label.isBlank()||label.length()>80)throw new IllegalArgumentException("Alt tür adı 1–80 karakter olmalı.");
   jdbc.queryForList("SELECT code FROM task_subtype FOR UPDATE");
   if(jdbc.queryForObject("SELECT COUNT(*) FROM task_subtype WHERE category=? AND LOWER(label)=LOWER(?)",Integer.class,category,label)>0)throw new IllegalArgumentException("Bu ana türde aynı adlı alt tür zaten var.");
   String code="CUSTOM_"+UUID.randomUUID().toString().replace("-","").substring(0,24).toUpperCase(Locale.ROOT);
   jdbc.update("INSERT INTO task_subtype(code,category,label) VALUES (?,?,?)",code,category,label);
   audit(code,"subtype-created");return list().stream().filter(r->code.equals(r.get("code"))).findFirst().orElseThrow();
 }
 @Transactional public Map<String,Object> setActive(String code,Map<String,Object> input){
   if(!(input.get("active") instanceof Boolean))throw new IllegalArgumentException("Etkinlik seçimi gerekli.");
   if(input.keySet().stream().anyMatch(k->!k.equals("active")))throw new IllegalArgumentException("Alt türün adı, kodu ve ana türü değiştirilemez; yeni alt tür oluşturun.");
   jdbc.queryForList("SELECT code FROM task_subtype FOR UPDATE");
   var row=list().stream().filter(r->code.equals(r.get("code"))).findFirst().orElse(null);if(row==null)return null;
   boolean active=Boolean.TRUE.equals(input.get("active"));
   if(!active&&Boolean.TRUE.equals(row.get("protected")))throw new IllegalArgumentException("Otomatik BAU ve izin hesaplamalarının sistem alt türü pasifleştirilemez.");
   if(!active&&Set.of("TEST","DEFECT","BAU").contains(row.get("category"))&&jdbc.queryForObject("SELECT COUNT(*) FROM task_subtype WHERE category=? AND active=TRUE AND code<>?",Integer.class,row.get("category"),code)==0)throw new IllegalArgumentException("Bu ana türde en az bir etkin alt tür kalmalı.");
   jdbc.update("UPDATE task_subtype SET active=? WHERE code=?",active,code);audit(code,active?"subtype-enabled":"subtype-disabled");
   return list().stream().filter(r->code.equals(r.get("code"))).findFirst().orElseThrow();
 }
 public void validate(String category,String code,boolean existing){
   if(code.isBlank()){if(Set.of("TEST","DEFECT","BAU").contains(category))throw new IllegalArgumentException(category+" için alt kırılım seçilmelidir.");return;}
   var rows=jdbc.queryForList("SELECT active FROM task_subtype WHERE code=? AND category=?",code,category);
   if(rows.isEmpty())throw new IllegalArgumentException("Alt tür bu ana iş türüne ait değil.");
   if(!existing&&!Boolean.TRUE.equals(rows.getFirst().get("ACTIVE")))throw new IllegalArgumentException("Pasif alt tür yeni seçimde kullanılamaz. Etkin bir alt tür seçin.");
 }
 private void audit(String code,String action){jdbc.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES(CURRENT_TIMESTAMP,'task-subtype',?,?,'{}')",code,action);}
}
