package com.sprintboard;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.sql.Types;
import java.time.Instant;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/** Versioned data-only backup. Identifiers are server-owned, never supplied as SQL by a file. */
@Service
public class BackupService {
  private static final List<String> TABLES = List.of("task_subtype", "roadmap_item", "member", "member_photo", "sprint", "backlog_item", "sprint_task",
      "assignment", "leave_record", "overtime_snapshot", "sprint_retro", "non_working_day", "overtime_entry",
      "product_setting", "sprint_member_allocation", "bau_template", "backlog_dependency", "sprint_closure", "defect_detail", "retro_action", "sprint_review_note", "sprint_flow", "task_blocker", "sprint_scope_event", "member_capacity_policy", "sprint_member_policy", "member_participation", "sprint_member_presence", "task_activity", "overtime_request", "leave_request", "defect_reserve_link", "overtime_plan_link");
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;
  private final Path directory;
  private record Column(String name, int type) {}

  public BackupService(JdbcTemplate jdbc, ObjectMapper mapper, @Value("${sprintboard.backup-directory:./backups}") String directory) {
    this.jdbc = jdbc; this.mapper = mapper; this.directory = Path.of(directory).toAbsolutePath().normalize();
  }
  private List<Column> columns(JdbcTemplate db, String table) {
    return db.query("SELECT * FROM " + table + " WHERE 1=0", rs -> {
      var metadata = rs.getMetaData(); var columns = new ArrayList<Column>();
      for (int i=1; i<=metadata.getColumnCount(); i++) columns.add(new Column(metadata.getColumnName(i).toLowerCase(Locale.ROOT), metadata.getColumnType(i)));
      return columns;
    });
  }
  private Map<String, Object> tableData() {
    var tables = new LinkedHashMap<String, Object>();
    for (String table : TABLES) {
      var columns = columns(jdbc, table);
      // All supported tables start with their primary identifier; composite keys need a second sort key.
      String order = (table.equals("sprint_member_allocation") || table.equals("sprint_member_policy") || table.equals("sprint_member_presence")) ? "sprint_id,member_id" : table.equals("backlog_dependency")?"backlog_id,depends_on_id":columns.getFirst().name();
      tables.put(table, jdbc.query("SELECT * FROM " + table + " ORDER BY " + order, (rs, index) -> {
        Map<String, Object> row = new LinkedHashMap<>();
        for (Column column : columns) {
          Object value = switch (column.type()) {
            case Types.CLOB, Types.VARCHAR, Types.DATE, Types.TIMESTAMP, Types.TIMESTAMP_WITH_TIMEZONE -> rs.getString(column.name());
            default -> rs.getObject(column.name());
          };
          row.put(column.name(), value);
        }
        return row;
      }));
    }
    return tables;
  }
  @Transactional(readOnly = true, isolation = Isolation.SERIALIZABLE)
  public Map<String, Object> exportData() {
    return Map.of("format", "sprintboard-data-backup", "formatVersion", 1, "schemaVersion", 40,
        "exportedAt", Instant.now().toString(), "tables", tableData(),
        "excludes", List.of("Giriş hesapları ve parolalar", "Mevcut yerel denetim günlüğü", "Slack bağlantı ayarları, tokenlar ve onay kuyruğu (yerel entegrasyon kayıtları)"));
  }
  private String fingerprint(Object data) {
    try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsBytes(data))); }
    catch (Exception e) { throw new IllegalStateException("Yedek özeti hesaplanamadı.", e); }
  }
  private JsonNode validate(JsonNode document) {
    JsonNode backup = document.has("restore") ? document.get("restore") : document;
    if (!backup.path("format").asText().equals("sprintboard-data-backup") || backup.path("formatVersion").asInt() != 1 || !Set.of(11,12,13,14,15,16,19,22,23,24,25,26,27,28,29,30,31,32,33,34,36,37,39,40).contains(backup.path("schemaVersion").asInt()))
      throw new IllegalArgumentException("Bu dosya desteklenen tam yedek biçiminde değil. Ayarlar’dan yeni JSON yedeği alın; eski dışa aktarımlar otomatik geri yüklenmez.");
    if (backup.toString().getBytes(StandardCharsets.UTF_8).length > 20_000_000) throw new IllegalArgumentException("Yedek en fazla 20 MB olabilir.");
    if(backup.path("schemaVersion").asInt()==11) {
      var upgraded=(com.fasterxml.jackson.databind.node.ObjectNode)backup.deepCopy();
      if(!upgraded.path("tables").isObject()||!upgraded.path("tables").path("backlog_item").isArray()||upgraded.path("tables").has("backlog_dependency"))throw new IllegalArgumentException("V11 yedek yapısı geçersiz.");
      for(JsonNode item:upgraded.path("tables").get("backlog_item")){
        if(!item.isObject()||item.has("priority")||item.has("owner_id"))throw new IllegalArgumentException("V11 backlog alanları uyumsuz.");
        ((com.fasterxml.jackson.databind.node.ObjectNode)item).put("priority","UNSET");((com.fasterxml.jackson.databind.node.ObjectNode)item).putNull("owner_id");
      }
      ((com.fasterxml.jackson.databind.node.ObjectNode)upgraded.get("tables")).putArray("backlog_dependency");upgraded.put("schemaVersion",12);backup=upgraded;
    }
    if(backup.path("schemaVersion").asInt()==12){
      var upgraded=(com.fasterxml.jackson.databind.node.ObjectNode)backup.deepCopy();
      if(!upgraded.path("tables").isObject()||upgraded.path("tables").has("sprint_closure"))throw new IllegalArgumentException("V12 yedek yapısı geçersiz.");
      ((com.fasterxml.jackson.databind.node.ObjectNode)upgraded.get("tables")).putArray("sprint_closure");upgraded.put("schemaVersion",13);backup=upgraded;
    }
    if(backup.path("schemaVersion").asInt()==13){
      var upgraded=(com.fasterxml.jackson.databind.node.ObjectNode)backup.deepCopy();
      if(!upgraded.path("tables").isObject()||upgraded.path("tables").has("defect_detail"))throw new IllegalArgumentException("V13 yedek yapısı geçersiz.");
      ((com.fasterxml.jackson.databind.node.ObjectNode)upgraded.get("tables")).putArray("defect_detail");upgraded.put("schemaVersion",14);backup=upgraded;
    }
    if(backup.path("schemaVersion").asInt()==14){
      var upgraded=(com.fasterxml.jackson.databind.node.ObjectNode)backup.deepCopy();
      if(!upgraded.path("tables").isObject()||upgraded.path("tables").has("task_subtype"))throw new IllegalArgumentException("V14 yedek yapısı geçersiz.");
      ((com.fasterxml.jackson.databind.node.ObjectNode)upgraded.get("tables")).set("task_subtype",mapper.valueToTree(TaskSubtypeService.defaults()));
      upgraded.put("schemaVersion",15);backup=upgraded;
    }
    if(backup.path("schemaVersion").asInt()==15){
      var upgraded=(com.fasterxml.jackson.databind.node.ObjectNode)backup.deepCopy();
      if(!upgraded.path("tables").isObject()||upgraded.path("tables").has("retro_action"))throw new IllegalArgumentException("V15 yedek yapısı geçersiz.");
      ((com.fasterxml.jackson.databind.node.ObjectNode)upgraded.get("tables")).putArray("retro_action");upgraded.put("schemaVersion",16);backup=upgraded;
    }
    if(backup.path("schemaVersion").asInt()==16){
      var upgraded=(com.fasterxml.jackson.databind.node.ObjectNode)backup.deepCopy();
      if(!upgraded.path("tables").path("leave_record").isArray())throw new IllegalArgumentException("V16 izin yedek yapısı geçersiz.");
      for(var row:upgraded.path("tables").path("leave_record")){
        if(!row.isObject()||row.has("leave_type"))throw new IllegalArgumentException("V16 izin alanları geçersiz.");
        ((com.fasterxml.jackson.databind.node.ObjectNode)row).put("leave_type","UNSPECIFIED");
      }
      upgraded.put("schemaVersion",19);backup=upgraded;
    }
    if(backup.path("schemaVersion").asInt()==19){
      var upgraded=(com.fasterxml.jackson.databind.node.ObjectNode)backup.deepCopy();
      if(!upgraded.path("tables").isObject()||upgraded.path("tables").has("sprint_review_note"))throw new IllegalArgumentException("V19 Review yedek yapısı geçersiz.");
      ((com.fasterxml.jackson.databind.node.ObjectNode)upgraded.get("tables")).putArray("sprint_review_note");upgraded.put("schemaVersion",22);backup=upgraded;
    }
    if(backup.path("schemaVersion").asInt()==22){
      var upgraded=(com.fasterxml.jackson.databind.node.ObjectNode)backup.deepCopy();
      if(!upgraded.path("tables").isObject())throw new IllegalArgumentException("V22 veri bölümleri geçersiz.");
      for(String table:List.of("sprint_flow","task_blocker","sprint_scope_event")){
        if(upgraded.path("tables").has(table))throw new IllegalArgumentException("V22 akış alanları geçersiz.");
        ((com.fasterxml.jackson.databind.node.ObjectNode)upgraded.get("tables")).putArray(table);
      }
      upgraded.put("schemaVersion",23);backup=upgraded;
    }
    if(backup.path("schemaVersion").asInt()==23){
      var upgraded=(com.fasterxml.jackson.databind.node.ObjectNode)backup.deepCopy();
      if(!upgraded.path("tables").path("roadmap_item").isArray())throw new IllegalArgumentException("V23 Roadmap alanları geçersiz.");
      for(var row:upgraded.path("tables").path("roadmap_item")){
        if(!row.isObject()||row.has("item_kind")||row.has("reference_id"))throw new IllegalArgumentException("V23 Roadmap alanları uyumsuz.");
        ((com.fasterxml.jackson.databind.node.ObjectNode)row).put("item_kind","UNSPECIFIED").putNull("reference_id");
      }
      upgraded.put("schemaVersion",24);backup=upgraded;
    }
    if(backup.path("schemaVersion").asInt()==24){
      var upgraded=(com.fasterxml.jackson.databind.node.ObjectNode)backup.deepCopy();upgraded.put("schemaVersion",25);backup=upgraded;
    }
    if(backup.path("schemaVersion").asInt()==25){
      var upgraded=(com.fasterxml.jackson.databind.node.ObjectNode)backup.deepCopy();
      for(var row:upgraded.path("tables").path("roadmap_item")){
        if(!row.isObject()||row.has("priority"))throw new IllegalArgumentException("V25 Roadmap öncelik alanı geçersiz.");
        ((com.fasterxml.jackson.databind.node.ObjectNode)row).put("priority","UNSET");
      }
      upgraded.put("schemaVersion",26);backup=upgraded;
    }
    if(backup.path("schemaVersion").asInt()==26){
      var upgraded=(com.fasterxml.jackson.databind.node.ObjectNode)backup.deepCopy();
      for(String table:List.of("member_capacity_policy","sprint_member_policy")){if(upgraded.path("tables").has(table))throw new IllegalArgumentException("V26 kişi kapasite alanları uyumsuz.");((com.fasterxml.jackson.databind.node.ObjectNode)upgraded.get("tables")).putArray(table);}
      upgraded.put("schemaVersion",27);backup=upgraded;
    }
    if(backup.path("schemaVersion").asInt()==27){
      var upgraded=backup.deepCopy();var t=(com.fasterxml.jackson.databind.node.ObjectNode)upgraded.path("tables");
      if(t.has("member_participation")||t.has("sprint_member_presence"))throw new IllegalArgumentException("V27 katılım alanları uyumsuz.");
      var periods=t.putArray("member_participation");t.putArray("sprint_member_presence");
      for(var member:t.path("member")){var p=periods.addObject();p.put("id","participation-"+member.path("id").asText());p.set("member_id",member.path("id"));p.set("joined_on",member.path("joined_on"));p.set("left_on",member.path("left_on"));p.put("closed",!member.path("active").asBoolean()||!member.path("left_on").isNull());}
      ((com.fasterxml.jackson.databind.node.ObjectNode)upgraded).put("schemaVersion",28);backup=upgraded;
    }
    if(backup.path("schemaVersion").asInt()==28){
      var upgraded=(com.fasterxml.jackson.databind.node.ObjectNode)backup.deepCopy();
      for(var row:upgraded.path("tables").path("leave_record")){
        if(!row.isObject()||row.has("overtime_hours")||row.has("overtime_accounting"))throw new IllegalArgumentException("V28 izin alanları geçersiz.");
        ((com.fasterxml.jackson.databind.node.ObjectNode)row).put("overtime_hours",0d).put("overtime_accounting","NONE");
      }
      upgraded.put("schemaVersion",29);backup=upgraded;
    }
    if(backup.path("schemaVersion").asInt()==29){
      var upgraded=(com.fasterxml.jackson.databind.node.ObjectNode)backup.deepCopy();
      if(upgraded.path("tables").has("member_photo"))throw new IllegalArgumentException("V29 fotoğraf alanı geçersiz.");
      ((com.fasterxml.jackson.databind.node.ObjectNode)upgraded.path("tables")).putArray("member_photo");
      upgraded.put("schemaVersion",30);backup=upgraded;
    }
    if(backup.path("schemaVersion").asInt()==30){
      var upgraded=(com.fasterxml.jackson.databind.node.ObjectNode)backup.deepCopy();
      var data=(com.fasterxml.jackson.databind.node.ObjectNode)upgraded.path("tables");
      for(String table:List.of("task_activity","overtime_request")){
        if(data.has(table))throw new IllegalArgumentException("V30 işbirliği alanları geçersiz.");
        data.putArray(table);
      }
      upgraded.put("schemaVersion",31);backup=upgraded;
    }
    if(backup.path("schemaVersion").asInt()==31){
      var upgraded=(com.fasterxml.jackson.databind.node.ObjectNode)backup.deepCopy();
      var data=(com.fasterxml.jackson.databind.node.ObjectNode)upgraded.path("tables");
      if(data.has("leave_request"))throw new IllegalArgumentException("V31 izin talebi alanı geçersiz.");
      data.putArray("leave_request");upgraded.put("schemaVersion",32);backup=upgraded;
    }
    if(backup.path("schemaVersion").asInt()==32){
      var upgraded=(com.fasterxml.jackson.databind.node.ObjectNode)backup.deepCopy();
      var data=(com.fasterxml.jackson.databind.node.ObjectNode)upgraded.path("tables");
      if(data.has("defect_reserve_link"))throw new IllegalArgumentException("V32 rezerv alanı uyumsuz.");
      data.putArray("defect_reserve_link");
      boolean subtype=false;for(var row:data.path("task_subtype"))if("DEFECT_SUPPORT".equals(row.path("code").asText()))subtype=true;
      if(!subtype)((com.fasterxml.jackson.databind.node.ArrayNode)data.path("task_subtype")).addObject().put("code","DEFECT_SUPPORT").put("category","BAU").put("label","Defect Support").put("active",true).put("system_type",true);
      upgraded.put("schemaVersion",33);backup=upgraded;
    }
    if(backup.path("schemaVersion").asInt()<=34){
      var upgraded=(com.fasterxml.jackson.databind.node.ObjectNode)backup.deepCopy();
      for(var row:upgraded.path("tables").path("defect_detail"))for(String field:List.of("reporter_id","reporter_team_id","source_url"))if(!row.has(field))((com.fasterxml.jackson.databind.node.ObjectNode)row).putNull(field);
      upgraded.put("schemaVersion",36);backup=upgraded;
    }
    if(backup.path("schemaVersion").asInt()==36){
      var upgraded=(com.fasterxml.jackson.databind.node.ObjectNode)backup.deepCopy();
      for(var row:upgraded.path("tables").path("defect_detail"))if(!row.has("reporter_name"))((com.fasterxml.jackson.databind.node.ObjectNode)row).putNull("reporter_name");
      upgraded.put("schemaVersion",37);backup=upgraded;
    }
    if(backup.path("schemaVersion").asInt()==37){
      var upgraded=(com.fasterxml.jackson.databind.node.ObjectNode)backup.deepCopy();
      for(String table:List.of("overtime_entry","overtime_request"))for(var row:upgraded.path("tables").path(table))
        for(String field:table.equals("overtime_entry")?List.of("task_id","task_title","roadmap_id","roadmap_title"):List.of("task_id","task_title")){
          if(row.has(field))throw new IllegalArgumentException("V37 mesai bağlamı uyumsuz.");
          ((com.fasterxml.jackson.databind.node.ObjectNode)row).putNull(field);
        }
      upgraded.put("schemaVersion",39);backup=upgraded;
    }
    if(backup.path("schemaVersion").asInt()==39){
      var upgraded=(com.fasterxml.jackson.databind.node.ObjectNode)backup.deepCopy();
      if(upgraded.path("tables").has("overtime_plan_link"))throw new IllegalArgumentException("V39 mesai eşleştirme bölümü uyumsuz.");
      for(var row:upgraded.path("tables").path("overtime_entry")){
        if(row.has("plan_classification"))throw new IllegalArgumentException("V39 mesai sınıflandırması uyumsuz.");
        ((com.fasterxml.jackson.databind.node.ObjectNode)row).put("plan_classification","LEGACY");
      }
      ((com.fasterxml.jackson.databind.node.ObjectNode)upgraded.path("tables")).putArray("overtime_plan_link");
      upgraded.put("schemaVersion",40);backup=upgraded;
    }
    JsonNode tables = backup.path("tables");
    Set<String> names = new HashSet<>(); tables.fieldNames().forEachRemaining(names::add);
    if (!tables.isObject() || !names.equals(new HashSet<>(TABLES))) throw new IllegalArgumentException("Yedekte eksik veya tanınmayan veri bölümü var.");
    int total = 0;
    for (String table : TABLES) {
      if (!tables.get(table).isArray()) throw new IllegalArgumentException("Geçersiz veri bölümü: " + table);
      total += tables.get(table).size();
      Set<String> expected = new HashSet<>(columns(jdbc, table).stream().map(Column::name).toList());
      for (JsonNode row : tables.get(table)) {
        Set<String> actual = new HashSet<>(); row.fieldNames().forEachRemaining(actual::add);
        if (!row.isObject() || !actual.equals(expected)) throw new IllegalArgumentException("Yedek alanları eksik veya uyumsuz: " + table);
        for (JsonNode value : row) if (!value.isValueNode()) throw new IllegalArgumentException("Yedek hücresi geçersiz: " + table);
      }
    }
    if (total > 100_000) throw new IllegalArgumentException("Yedek en fazla 100.000 kayıt içerebilir.");
    validateBusinessValues(tables);
    // Trial insertion verifies foreign keys, unique keys, column lengths, types and constraints before touching real data.
    var ds = new DriverManagerDataSource("jdbc:h2:mem:backup-check-" + UUID.randomUUID(), "sa", "");
    try (var keepAlive = ds.getConnection()) {
      Flyway.configure().dataSource(ds).locations("classpath:db/migration").load().migrate();
      replaceTables(new JdbcTemplate(ds), tables);
    } catch (Exception e) { throw new IllegalArgumentException("Yedek doğrulanamadı: kayıt ilişkisi, alan biçimi veya tekillik kuralı hatalı.", e); }
    return backup;
  }
  private void validateFlow(JsonNode tables){
    try{
      for(var blocker:tables.path("task_blocker")){
        if(!blocker.path("blocked").isBoolean()||!blocker.path("version").isIntegralNumber()||blocker.path("version").asLong()<1||blocker.path("version").asLong()>Integer.MAX_VALUE||blocker.path("reason").asText().isBlank())throw new IllegalArgumentException();
        Instant.parse(blocker.path("updated_at").asText());
      }
      for(var flow:tables.path("sprint_flow")){
        String sprint=flow.path("sprint_id").asText();Instant.parse(flow.path("tracked_at").asText());
        var limit=flow.path("wip_limit");if(!limit.isNull()&&(!limit.isIntegralNumber()||limit.asLong()<1||limit.asLong()>1000))throw new IllegalArgumentException();
        if(!flow.path("version").isIntegralNumber()||flow.path("version").asLong()<0||flow.path("version").asLong()>Integer.MAX_VALUE)throw new IllegalArgumentException();
        var baseline=mapper.readTree(flow.path("baseline_json").asText());if(!baseline.isArray())throw new IllegalArgumentException();
        Set<String> current=new HashSet<>();for(var task:baseline){if(!sprint.equals(task.path("sprintId").asText())||task.path("id").asText().isBlank()||!current.add(task.path("id").asText()))throw new IllegalArgumentException();}
        var events=new ArrayList<JsonNode>();for(var event:tables.path("sprint_scope_event"))if(sprint.equals(event.path("sprint_id").asText()))events.add(event);
        events.sort(Comparator.comparingInt(e->e.path("sequence_no").asInt()));int sequence=0;
        for(var event:events){
          if(!event.path("sequence_no").isIntegralNumber()||event.path("sequence_no").asInt()!=++sequence||event.path("reason").asText().isBlank())throw new IllegalArgumentException();
          Instant.parse(event.path("occurred_at").asText());var task=mapper.readTree(event.path("task_json").asText());String id=task.path("id").asText();
          if(id.isBlank()||!sprint.equals(task.path("sprintId").asText())||task.path("name").asText().isBlank()||!task.path("assignments").isArray())throw new IllegalArgumentException();
          if(task.has("emergency")&&!task.path("emergency").isBoolean())throw new IllegalArgumentException();
          if(task.has("addedDuringSprint")&&!task.path("addedDuringSprint").isBoolean())throw new IllegalArgumentException();
          if(task.has("replacementTaskId")&&(!task.path("replacementTaskId").isTextual()||!task.path("replacementTaskName").isTextual()))throw new IllegalArgumentException();
          if("ADDED".equals(event.path("action").asText())){if(!current.add(id))throw new IllegalArgumentException();}else if("REMOVED".equals(event.path("action").asText())){if(!current.remove(id))throw new IllegalArgumentException();}else throw new IllegalArgumentException();
        }
        Set<String> actual=new HashSet<>();for(var task:tables.path("sprint_task"))if(sprint.equals(task.path("sprint_id").asText()))actual.add(task.path("id").asText());
        if(!current.equals(actual)||flow.path("version").asInt()<sequence)throw new IllegalArgumentException();
      }
    }catch(Exception e){throw new IllegalArgumentException("Yedekteki akış/kapsam geçmişi geçersiz veya mevcut görevlerle tutarsız.",e);}
  }
  private void validateBusinessValues(JsonNode tables) {
    for(var setting:tables.path("product_setting"))if("bau_roadmap_id".equals(setting.path("setting_key").asText())){
      String target=setting.path("setting_value").asText();boolean valid=false;
      for(var r:tables.path("roadmap_item"))if(target.equals(r.path("id").asText())&&"GENERAL".equals(r.path("item_kind").asText()))valid=true;
      if(!valid)throw new IllegalArgumentException("Otomatik BAU Roadmap bağlantısı Genel türünde geçerli bir hedefe bağlı olmalıdır.");
    }
    for(var row:tables.path("roadmap_item")){
      if(!Set.of("planned","active","on_hold","completed").contains(row.path("status").asText()))throw new IllegalArgumentException("Roadmap durumu geçersiz.");
      if(!Set.of("UNSET","LOW","NORMAL","HIGH","CRITICAL").contains(row.path("priority").asText()))throw new IllegalArgumentException("Roadmap önceliği geçersiz.");
      if(!Set.of("PROJECT","FEATURE_SET","GENERAL","UNSPECIFIED").contains(row.path("item_kind").asText()))throw new IllegalArgumentException("Roadmap türü geçersiz.");
      var reference=row.path("reference_id");
      if(!reference.isNull()&&(!reference.isTextual()||reference.asText().length()>100||reference.asText().chars().anyMatch(Character::isISOControl)))throw new IllegalArgumentException("Roadmap referans ID geçersiz.");
    }
    CollaborationBackup.validate(tables,mapper);
    validateFlow(tables);
    for(JsonNode note:tables.get("sprint_review_note")){
      if(!note.path("version").isIntegralNumber()||note.path("version").asLong()<1||note.path("version").asLong()>Integer.MAX_VALUE||!note.path("updated_by").isTextual()||note.path("updated_by").asText().isBlank())throw new IllegalArgumentException("Review not sürümü/kayıt sahibi geçersiz.");
      for(String field:List.of("demo_notes","stakeholder_feedback","decisions","next_steps"))if(!note.path(field).isTextual()||note.path(field).asText().length()>10000)throw new IllegalArgumentException("Review not metni geçersiz.");
      try{java.time.OffsetDateTime.parse(note.path("updated_at").asText().replace(" ","T"));}catch(Exception e){throw new IllegalArgumentException("Review not tarihi geçersiz.",e);}
    }
    for(JsonNode action:tables.get("retro_action")){
      if(action.path("title").asText().isBlank()||!action.path("version").isIntegralNumber()||action.path("version").asLong()<0)throw new IllegalArgumentException("Retro aksiyonu geçersiz.");
      try{
        if(!action.path("due_date").isNull()){var date=java.time.LocalDate.parse(action.path("due_date").asText());if(date.getYear()<1900||date.getYear()>9999)throw new IllegalArgumentException();}
        java.time.OffsetDateTime.parse(action.path("created_at").asText().replace(" ","T"));
        java.time.OffsetDateTime.parse(action.path("updated_at").asText().replace(" ","T"));
      }catch(Exception e){throw new IllegalArgumentException("Retro aksiyon tarihleri geçersiz.",e);}
    }
    var catalog=tables.get("task_subtype");
    Map<String,JsonNode> catalogByCode=new HashMap<>();Set<String> labels=new HashSet<>();
    for(JsonNode row:catalog){
      String code=row.path("code").asText(),category=row.path("category").asText(),label=row.path("label").asText();
      if(code.isBlank()||label.isBlank()||!row.path("active").isBoolean()||!row.path("system_type").isBoolean()||!labels.add(category+"|"+label.toLowerCase(Locale.ROOT))||catalogByCode.put(code,row)!=null)
        throw new IllegalArgumentException("Alt tür kataloğu geçersiz.");
      if(!row.path("system_type").asBoolean()&&!code.matches("CUSTOM_[A-F0-9]{24}"))throw new IllegalArgumentException("Özel alt tür kodu geçersiz.");
    }
    var defaults=TaskSubtypeService.defaults();Set<String> systemCodes=new HashSet<>();
    for(var standard:defaults){
      String code=standard.get("code").toString();systemCodes.add(code);var row=catalogByCode.get(code);
      if(row==null||!row.path("system_type").asBoolean()||!row.path("category").asText().equals(standard.get("category"))||!row.path("label").asText().equals(standard.get("label"))||("BAU".equals(standard.get("category"))&&!row.path("active").asBoolean()))
        throw new IllegalArgumentException("Sistem alt türü eksik veya değiştirilmiş.");
    }
    for(JsonNode row:catalog)if(row.path("system_type").asBoolean()&&!systemCodes.contains(row.path("code").asText()))throw new IllegalArgumentException("Tanınmayan sistem alt türü.");
    for(String category:List.of("TEST","DEFECT","BAU"))if(catalogByCode.values().stream().noneMatch(r->category.equals(r.path("category").asText())&&r.path("active").asBoolean()))throw new IllegalArgumentException("Etkin alt tür eksik.");
    Map<String,List<String>> graph=new HashMap<>();
    for(JsonNode edge:tables.get("backlog_dependency"))graph.computeIfAbsent(edge.path("backlog_id").asText(),key->new ArrayList<>()).add(edge.path("depends_on_id").asText());
    BacklogPlanningService.validateGraph(graph);
    for(JsonNode row:tables.get("sprint_closure")){
      try{
        var payload=mapper.readTree(row.path("payload_json").asText());
        String id=row.path("sprint_id").asText();
        Instant.parse(row.path("closed_at").asText());
        if(payload.path("version").asInt()!=1||!payload.path("closedAt").asText().equals(row.path("closed_at").asText())||
            !id.equals(payload.path("sprint").path("id").asText())||!"completed".equals(payload.path("sprint").path("status").asText())||
            !payload.path("sprint").path("items").isArray()||!payload.path("capacity").isArray()||
            !Set.of("SIZE_AND_HOURS","POINTS_AND_HOURS").contains(payload.path("settings").path("estimationMode").asText())||
            !payload.path("before").isObject()||!payload.path("carried").isArray())
          throw new IllegalArgumentException("Kapanış kaydı biçimi geçersiz.");
        boolean completed=false;for(JsonNode sprint:tables.get("sprint"))if(id.equals(sprint.path("id").asText()))completed="completed".equals(sprint.path("status").asText());
        if(!completed)throw new IllegalArgumentException("Kapanış kaydı tamamlanmış sprint gerektirir.");
      }catch(Exception e){throw new IllegalArgumentException("Yedekteki kapanış kaydı geçersiz.",e);}
    }
    long active = 0;
    for (JsonNode sprint : tables.get("sprint")) {
      if (!Set.of("active","planned","completed").contains(sprint.path("status").asText())) throw new IllegalArgumentException("Geçersiz sprint durumu.");
      if (sprint.path("status").asText().equals("active")) active++;
    }
    if (active > 1) throw new IllegalArgumentException("Yedekte birden fazla aktif sprint var.");
    for (JsonNode task : tables.get("sprint_task")) if (!Set.of("todo","doing","done","undone").contains(task.path("status").asText())) throw new IllegalArgumentException("Geçersiz görev durumu.");
    boolean modePresent = false;
    for (JsonNode setting : tables.get("product_setting")) if (setting.path("setting_key").asText().equals("estimation_mode")) {
      modePresent = Set.of("SIZE_AND_HOURS","POINTS_AND_HOURS").contains(setting.path("setting_value").asText());
    }
    if (!modePresent) throw new IllegalArgumentException("Tahmin yöntemi ayarı eksik veya geçersiz.");
    WorkScheduleService.validateBackup(tables,mapper);
    MemberCapacityService.validateBackup(tables);
    DefectReserve.validateBackup(tables);
    LeaveLedgerService.validateBackup(tables);
    MemberPhoto.validateBackup(tables);
    ParticipationService.validateBackup(tables,mapper);
    for (String table : TABLES) for (JsonNode row : tables.get(table)) {
      var fields = row.fields();
      while (fields.hasNext()) {
        var field = fields.next();
        if (field.getValue().isNumber() && !Double.isFinite(field.getValue().doubleValue())) throw new IllegalArgumentException("Sonlu olmayan sayısal değer.");
        if (Set.of("estimated_hours","remaining_hours","days","allocated_days","days_per_member","earned_hours","used_hours","planned_hours").contains(field.getKey())
            && (!field.getValue().isNumber() || field.getValue().doubleValue() < 0)) throw new IllegalArgumentException("Negatif veya geçersiz efor/gün değeri: " + table);
      }
    }
  }
  private void replaceTables(JdbcTemplate db, JsonNode tables) {
    for (String table : TABLES.reversed()) db.update("DELETE FROM " + table);
    for (String table : TABLES) {
      var columns = columns(db, table);
      String sql = "INSERT INTO " + table + " (" + String.join(",", columns.stream().map(Column::name).toList()) + ") VALUES (" + String.join(",", Collections.nCopies(columns.size(), "?")) + ")";
      for (JsonNode row : tables.get(table)) db.update(sql, ps -> {
        for (int i=0; i<columns.size(); i++) {
          Column column = columns.get(i); JsonNode value = row.get(column.name());
          if (value.isNull() || table.equals("backlog_item") && column.name().equals("repeat_of_id")) ps.setNull(i+1, column.type());
          else if (value.isBoolean()) ps.setBoolean(i+1, value.booleanValue());
          else ps.setObject(i+1, value.isNumber() ? value.numberValue() : value.textValue(), column.type());
        }
      });
    }
    for (JsonNode row : tables.get("backlog_item")) if (!row.get("repeat_of_id").isNull()) db.update("UPDATE backlog_item SET repeat_of_id=? WHERE id=?", row.get("repeat_of_id").asText(), row.get("id").asText());
  }
  @Transactional(readOnly = true, isolation = Isolation.SERIALIZABLE)
  public Map<String, Object> preview(JsonNode document) {
    JsonNode backup = validate(document);
    var counts = new LinkedHashMap<String, Object>();
    var current = mapper.valueToTree(tableData());
    for (String table : TABLES) counts.put(table, Map.of("current", current.get(table).size(), "incoming", backup.path("tables").get(table).size()));
    return Map.of("counts", counts, "currentFingerprint", fingerprint(current), "backupFingerprint", fingerprint(backup), "exportedAt", backup.path("exportedAt").asText());
  }
  @Transactional(isolation = Isolation.SERIALIZABLE)
  public Map<String, Object> restore(JsonNode request) {
    if (!request.path("confirmation").asText().equals("GERİ YÜKLE")) throw new IllegalArgumentException("Geri yüklemek için GERİ YÜKLE onayı gereklidir.");
    JsonNode backup = validate(request.path("backup"));
    if (!fingerprint(backup).equals(request.path("backupFingerprint").asText())) throw new IllegalArgumentException("Seçili dosya değişti. Önizlemeyi yeniden oluşturun.");
    var current = tableData();
    if (!fingerprint(current).equals(request.path("currentFingerprint").asText())) throw new IllegalArgumentException("Mevcut veri önizlemeden sonra değişti. Önizlemeyi yenileyin.");
    Path safetyFile = directory.resolve("before-restore-" + UUID.randomUUID() + ".json");
    try {
      Files.createDirectories(directory);
      var safety = Map.of("format","sprintboard-data-backup","formatVersion",1,"schemaVersion",40,"exportedAt",Instant.now().toString(),"tables",current);
      Files.write(safetyFile, mapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(safety), StandardOpenOption.CREATE_NEW);
    } catch (Exception e) { throw new IllegalStateException("Güvenlik yedeği yazılamadı. Geri yükleme yapılmadı.", e); }
    replaceTables(jdbc, backup.get("tables"));
    // Product restore must not accidentally grant member permissions through reused identifiers.
    jdbc.update("UPDATE app_user SET member_id=NULL,session_version=session_version+1 WHERE member_id IS NOT NULL");
    // An intentionally empty restored workspace must not be repopulated from historical seed on restart.
    jdbc.update("MERGE INTO product_setting(setting_key,setting_value) KEY(setting_key) VALUES ('restore_completed','true')");
    jdbc.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES (CURRENT_TIMESTAMP,'workspace','restore','restored',?)",
        "{\"safetyBackup\":\"" + safetyFile.getFileName() + "\"}");
    return Map.of("restored",true,"safetyBackup",safetyFile.getFileName().toString());
  }
}
