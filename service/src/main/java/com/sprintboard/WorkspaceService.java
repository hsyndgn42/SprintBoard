package com.sprintboard;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.DayOfWeek;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.HashMap;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WorkspaceService {
  private static final String DELIVERY_FILTER = "COALESCE(t.task_category,'OTHER') <> 'BAU' AND t.work_kind <> 'LEAVE' AND COALESCE(t.task_subtype,'') <> 'LEAVE'";
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;
  private final BacklogPlanningService planning;
  private final SprintClosureStore closures;
  private final DefectService defects;
  private final TaskSubtypeService subtypes;
  private final SprintFlowService flow;
  private final WorkScheduleService schedules;
  private final MemberCapacityService memberCapacity;
  private final ParticipationService participation;

  public WorkspaceService(JdbcTemplate jdbc, ObjectMapper mapper, BacklogPlanningService planning, SprintClosureStore closures,DefectService defects,TaskSubtypeService subtypes,SprintFlowService flow) {
    this.jdbc = jdbc;
    this.schedules = new WorkScheduleService(jdbc,mapper);
    this.memberCapacity=new MemberCapacityService(jdbc);
    this.participation=new ParticipationService(jdbc,mapper);
    this.mapper = mapper;
    this.planning = planning;
    this.closures = closures;
    this.defects = defects;
    this.subtypes = subtypes;
    this.flow = flow;
  }

  private static Map<String, Object> map(Object... entries) {
    Map<String, Object> result = new LinkedHashMap<>();
    for (int i = 0; i < entries.length; i += 2) result.put((String) entries[i], entries[i + 1]);
    return result;
  }
  private static String date(ResultSet rs, String column) throws SQLException {
    return rs.getDate(column) == null ? null : rs.getDate(column).toLocalDate().toString();
  }
  private static Double nullableDouble(ResultSet rs, String column) throws SQLException {
    double value = rs.getDouble(column);
    return rs.wasNull() ? null : value;
  }
  private static String text(Map<String, Object> input, String key) {
    Object value = input == null ? null : input.get(key);
    return value == null ? "" : String.valueOf(value).trim();
  }
  private static String id(String prefix) { return prefix + "-" + UUID.randomUUID(); }
  private static int integer(Map<String, Object> map, String key) { return ((Number) map.get(key)).intValue(); }
  private static long countValue(Object value) { return value instanceof Number number ? number.longValue() : 0; }
  private String json(Object value) {
    try { return mapper.writeValueAsString(value); }
    catch (JsonProcessingException error) { throw new IllegalArgumentException("Audit verisi geçersiz.", error); }
  }
  private Map<String,Object> auditDetails(Object details){var m=new LinkedHashMap<String,Object>();if(details instanceof Map<?,?> values)values.forEach((k,v)->m.put(k.toString(),v));m.put("actor",TaskActivity.actor());return m;}
  private void audit(String type, String entityId, String action, Object details) {
    jdbc.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES (?,?,?,?,?)",
        Timestamp.from(Instant.now()), type, entityId, action, json(auditDetails(details)));
    if(type.equals("task"))TaskActivity.record(jdbc,mapper,entityId,action,details);
  }

  public List<Map<String, Object>> sprints() {
    return jdbc.query("""
      SELECT s.*, (SELECT COUNT(*) FROM sprint_task t WHERE t.sprint_id=s.id) task_count,
        (SELECT COUNT(*) FROM sprint_task t WHERE t.sprint_id=s.id AND t.status='done') done_count,
        (SELECT COUNT(*) FROM sprint_task t WHERE t.sprint_id=s.id AND t.status='undone') undone_count,
        (SELECT COUNT(*) FROM sprint_task t WHERE t.sprint_id=s.id AND %1$s) delivery_count,
        (SELECT COUNT(*) FROM sprint_task t WHERE t.sprint_id=s.id AND t.status='done' AND %1$s) delivery_done,
        (SELECT COUNT(*) FROM sprint_task t WHERE t.sprint_id=s.id AND t.status='undone' AND %1$s) delivery_undone
      FROM sprint s ORDER BY s.number DESC
      """.formatted(DELIVERY_FILTER), (rs, row) -> map("id", rs.getString("id"), "number", rs.getInt("number"), "name", rs.getString("name"),
        "goal", rs.getString("goal"), "start", date(rs, "start_date"), "end", date(rs, "end_date"),
        "status", rs.getString("status"), "storyPointsAvailable", rs.getBoolean("story_points_available"),
        "taskCount", rs.getInt("task_count"), "doneCount", rs.getInt("done_count"), "undoneCount", rs.getInt("undone_count"),
        "deliveryTaskCount", rs.getInt("delivery_count"), "deliveryDoneCount", rs.getInt("delivery_done"), "deliveryUndoneCount", rs.getInt("delivery_undone")));
  }
  @SuppressWarnings("unchecked")
  public Map<String, Object> sprint(String id) {
    var frozen=closures.read(id);
    if(frozen!=null){var result=new LinkedHashMap<>((Map<String,Object>)frozen.get("sprint"));result.put("closureFrozen",true);result.put("closedAt",frozen.get("closedAt"));result.put("closureSettings",frozen.get("settings"));defects.enrichReporterNames((List<Map<String,Object>>)result.get("items"));return result;}
    List<Map<String, Object>> rows = sprints().stream().filter(row -> id.equals(row.get("id"))).toList();
    if (rows.isEmpty()) return null;
    Map<String, Object> result = new LinkedHashMap<>(rows.getFirst());
    result.put("editVersion", sprintEditVersion(result));
    List<Map<String, Object>> tasks = jdbc.query("SELECT * FROM sprint_task WHERE sprint_id=? ORDER BY id", (rs, row) -> map(
        "id", rs.getString("id"), "sprintId", rs.getString("sprint_id"), "backlogId", rs.getString("backlog_id"),
        "name", rs.getString("title"), "criteria", rs.getString("criteria"), "type", rs.getString("type"),
        "workKind", rs.getString("work_kind"), "taskCategory", rs.getString("task_category"), "taskSubtype", rs.getString("task_subtype"),
        "status", rs.getString("status"), "statusNote", rs.getString("status_note"),
        "estimatedHours", rs.getDouble("estimated_hours"), "remainingHours", rs.getDouble("remaining_hours"),
        "storyPoints", nullableDouble(rs, "story_points"), "size", rs.getString("size_code"), "externalId", rs.getString("external_id")), id);
    for (Map<String, Object> task : tasks) {
      if ("LEAVE".equals(task.get("workKind")) && String.valueOf(task.get("externalId")).startsWith("BAU-AUTO:")) {
        task.put("assignments", jdbc.query("""
            SELECT l.member_id,m.name,SUM(l.days) leave_days FROM leave_record l JOIN member m ON m.id=l.member_id
            WHERE l.sprint_id=? GROUP BY l.member_id,m.name ORDER BY m.name
            """, (rs, row) -> map("memberId", rs.getString("member_id"), "memberName", rs.getString("name"),
                "estimatedHours", 0, "supportOnly", true, "leaveDays", rs.getDouble("leave_days")), id));
      } else {
        task.put("assignments", jdbc.query("SELECT a.member_id,m.name,a.estimated_hours,a.support_only FROM assignment a LEFT JOIN member m ON m.id=a.member_id WHERE a.task_id=? ORDER BY a.member_id",
            (rs, row) -> map("memberId", rs.getString("member_id"), "memberName", rs.getString("name"), "estimatedHours", rs.getDouble("estimated_hours"), "supportOnly", rs.getBoolean("support_only")), task.get("id")));
      }
    }
    for(var task:tasks)if("LEAVE".equals(task.get("workKind"))){for(var a:(List<Map<String,Object>>)task.get("assignments"))a.put("hoursPerDay",memberCapacity.forSprint(id,(String)a.get("memberId"),schedules.forSprint(id).hoursPerDay()).hoursPerDay());}
    DefectReserve.links(jdbc,id,tasks);
    flow.enrich(tasks);
    result.put("defectReserves",DefectReserve.enrich(tasks));
    defects.enrich(tasks,"backlogId");
    for(var task:tasks)task.put("flowFingerprint",closures.fingerprint(task));
    result.put("flow",flow.read(id,tasks));
    result.put("workSettings",sprintSettings(id));
    result.put("items", tasks);
    return result;
  }
  public Map<String, Object> overview() {
    List<Map<String, Object>> all = sprints();
    List<Map<String, Object>> completed = all.stream().filter(row -> "completed".equals(row.get("status"))).toList();
    int done = completed.stream().mapToInt(row -> integer(row, "deliveryDoneCount")).sum();
    int undone = completed.stream().mapToInt(row -> integer(row, "deliveryUndoneCount")).sum();
    int deliveryTotal = completed.stream().mapToInt(row -> integer(row, "deliveryTaskCount")).sum();
    String activeId = all.stream().filter(row -> "active".equals(row.get("status"))).map(row -> (String) row.get("id")).findFirst().orElse(null);
    List<Map<String, Object>> activeCapacity = activeId == null ? List.of() : capacity(activeId);
    double sprintAvailable = activeCapacity.stream().mapToDouble(row -> ((Number) row.get("availableHours")).doubleValue()).sum();
    double sprintPlanned = activeCapacity.stream().mapToDouble(row -> ((Number) row.get("plannedHours")).doubleValue()).sum();
    LocalDate today = LocalDate.now(java.time.ZoneId.of("Europe/Istanbul"));
    long[] backlogCounts = jdbc.queryForObject("SELECT COUNT(*),COUNT(roadmap_id),COUNT(CASE WHEN state='Ready' THEN 1 END),COUNT(CASE WHEN state='IN_SPRINT' THEN 1 END) FROM backlog_item",
        (rs, row) -> new long[] { rs.getLong(1), rs.getLong(2), rs.getLong(3), rs.getLong(4) });
    Map<String, Object> activeSprint = all.stream().filter(row -> "active".equals(row.get("status"))).findFirst().orElse(null);
    ActiveSprintSignals signals = activeSignals(activeId, activeSprint, today);
    return map("totalSprints", all.size(), "completedSprints", completed.size(), "activeSprints", all.stream().filter(s->"active".equals(s.get("status"))).count(), "plannedSprints", all.stream().filter(s->"planned".equals(s.get("status"))).count(), "deliveredTasks", done, "undoneTasks", undone,
        "deliveryRate", deliveryTotal == 0 ? null : Math.round(100.0 * done / deliveryTotal),
        "activeSprint", activeSprint,
        "recentSprints", completed.stream().limit(5).toList(),
        "roadmapCount", jdbc.queryForObject("SELECT COUNT(*) FROM roadmap_item", Integer.class),
        "backlogCount", backlogCounts[0], "backlogLinkedCount", backlogCounts[1],
        "backlogReadyCount", backlog().stream().filter(item -> Boolean.TRUE.equals(((Map<?,?>)item.get("readiness")).get("ready"))).count(), "backlogInSprintCount", backlogCounts[3],
        "activeMemberCount", team().stream().filter(p->((Number)p.get("active")).intValue()==1).count(),
        "activeSprintCapacityHours", sprintAvailable, "activeSprintPlannedHours", sprintPlanned,
        "todayCapacityHours", calendarCapacity(today, today),
        "monthCapacityHours", calendarCapacity(today.withDayOfMonth(1), today.withDayOfMonth(today.lengthOfMonth())),
        // Additive dashboard signals (D-1). All are counts, all are scoped to
        // the active sprint only, and all reuse the existing delivery/BAU
        // definitions rather than introducing new business rules.
        "activeSprintDaysTotal", signals.daysTotal(),
        "activeSprintDaysRemaining", signals.daysRemaining(),
        "activeSprintBlockedCount", signals.blocked(),
        "activeSprintAddedDuringCount", signals.addedDuring(),
        "activeSprintUnestimatedCount", signals.unestimated(),
        "activeSprintUnassignedCount", signals.unassigned(),
        "activeSprintTypeBreakdown", signals.typeBreakdown());
  }

  /**
   * Attention signals for the dashboard, derived entirely from the existing
   * active-sprint detail. Counts only — never ratios — so the client keeps
   * ownership of every denominator and its zero check.
   */
  private record ActiveSprintSignals(
      Integer daysTotal, Integer daysRemaining, long blocked, long addedDuring,
      long unestimated, long unassigned, List<Map<String, Object>> typeBreakdown) {

    /** The shape returned when no sprint is active: nothing to report on. */
    static ActiveSprintSignals none() {
      return new ActiveSprintSignals(null, null, 0, 0, 0, 0, List.of());
    }
  }

  @SuppressWarnings("unchecked")
  private ActiveSprintSignals activeSignals(String activeId, Map<String, Object> activeSprint, LocalDate today) {
    if (activeId == null || activeSprint == null) return ActiveSprintSignals.none();
    Map<String, Object> detail = sprint(activeId);
    if (detail == null) return ActiveSprintSignals.none();

    // Inclusive day span, so a one-day sprint reads as 1 rather than 0.
    Integer daysTotal = null;
    Integer daysRemaining = null;
    Object start = activeSprint.get("start");
    Object end = activeSprint.get("end");
    if (start != null && end != null) {
      LocalDate from = LocalDate.parse((String) start);
      LocalDate to = LocalDate.parse((String) end);
      daysTotal = (int) (java.time.temporal.ChronoUnit.DAYS.between(from, to) + 1);
      // Never negative: an overrunning sprint has zero days left, not -3.
      daysRemaining = (int) Math.max(0, java.time.temporal.ChronoUnit.DAYS.between(today, to));
    }

    List<Map<String, Object>> items = (List<Map<String, Object>>) detail.getOrDefault("items", List.of());
    // Delivery scope is the inverse of BauPolicy, matching DELIVERY_FILTER
    // and therefore the deliveryTaskCount the dashboard already shows.
    List<Map<String, Object>> delivery = items.stream().filter(task -> !BauPolicy.isBau(task)).toList();

    // The flow read model already excludes BAU from its blocked count.
    long blocked = detail.get("flow") instanceof Map<?, ?> flowMap && flowMap.get("blocked") instanceof Number count
        ? count.longValue() : 0;

    // Scope growth means work the team did not plan for. A task entered after
    // planning is only new load if nothing already absorbed it: automatic BAU
    // is excluded with the rest of delivery, and a defect that its Defect
    // Support reserve fully covers is not growth either. DefectReserve already
    // encodes exactly that as `emergency` (extraPlanHours > 0), so reuse it
    // rather than restating the rule here.
    long addedDuring = delivery.stream()
        .filter(task -> Boolean.TRUE.equals(task.get("addedDuringSprint")))
        .filter(task -> !"DEFECT".equals(task.get("taskCategory"))
            || Boolean.TRUE.equals(task.get("emergency")))
        .count();

    long unestimated = delivery.stream()
        .filter(task -> !(task.get("estimatedHours") instanceof Number hours) || hours.doubleValue() <= 0)
        .count();

    long unassigned = delivery.stream()
        .filter(task -> !(task.get("assignments") instanceof List<?> people) || people.isEmpty())
        .count();

    // Ordered by descending task count so the client can render the
    // distribution without re-sorting; ties fall back to the category name
    // to keep the output deterministic between calls.
    List<Map<String, Object>> breakdown = delivery.stream()
        .collect(java.util.stream.Collectors.groupingBy(
            task -> task.get("taskCategory") == null ? "OTHER" : String.valueOf(task.get("taskCategory")),
            java.util.LinkedHashMap::new,
            java.util.stream.Collectors.toList()))
        .entrySet().stream()
        .map(entry -> map(
            "category", entry.getKey(),
            "taskCount", entry.getValue().size(),
            "doneCount", entry.getValue().stream().filter(task -> "done".equals(task.get("status"))).count()))
        .sorted(java.util.Comparator
            .comparingLong((Map<String, Object> row) -> -((Number) row.get("taskCount")).longValue())
            .thenComparing(row -> String.valueOf(row.get("category"))))
        .toList();

    return new ActiveSprintSignals(daysTotal, daysRemaining, blocked, addedDuring, unestimated, unassigned, breakdown);
  }

  private double calendarCapacity(LocalDate from, LocalDate to) {
    List<Map<String, Object>> calendarDays = calendar();
    List<Map<String, Object>> leaveRecords = leaves();
    double hours = 0;
    for (Map<String, Object> member : team()) {
      if (isSupport(member)) continue;
      String memberId = (String) member.get("id");
      String joined = (String) member.get("joinedOn");
      String left = (String) member.get("leftOn");
      for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
        if (!schedules.at(date).works(date)) continue;
        if (!participation.at(memberId,date)) continue;
        LocalDate day = date;
        if (calendarDays.stream().anyMatch(off -> day.toString().equals(off.get("date"))
            && (off.get("memberId") == null || memberId.equals(off.get("memberId"))))) continue;
        double leaveFraction = 0;
        for (Map<String, Object> leave : leaveRecords) {
          if (!memberId.equals(leave.get("memberId")) || leave.get("start") == null || leave.get("end") == null) continue;
          LocalDate start = LocalDate.parse((String) leave.get("start"));
          LocalDate end = LocalDate.parse((String) leave.get("end"));
          if (day.isBefore(start) || day.isAfter(end)) continue;
          long eligible = start.datesUntil(end.plusDays(1)).filter(d -> schedules.at(d).works(d)).count();
          leaveFraction = Math.max(leaveFraction, Math.min(1, ((Number) leave.get("days")).doubleValue() / Math.max(1, eligible)));
        }
        hours += (1 - leaveFraction) * memberCapacity.at(memberId,day,schedules.at(day).hoursPerDay()).planningHours();
      }
    }
    return hours;
  }

  public Map<String, Object> settings() {
    String mode = jdbc.queryForObject("SELECT setting_value FROM product_setting WHERE setting_key='estimation_mode'", String.class);
    if ("HOURS_ONLY".equals(mode)) mode = "SIZE_AND_HOURS";
    if ("HOURS_AND_POINTS".equals(mode)) mode = "POINTS_AND_HOURS";
    var history=schedules.history();var p=schedules.at(LocalDate.now(java.time.ZoneId.of("Europe/Istanbul")));
    return map("estimationMode", mode, "hoursPerDay", p.hoursPerDay(),"workingDays",p.workingDays(),"teamName",schedules.teamName(),"workSchedules",history,"today",LocalDate.now(java.time.ZoneId.of("Europe/Istanbul")).toString());
  }

  private Map<String,Object> sprintSettings(String id){var result=new LinkedHashMap<>(settings());var p=schedules.forSprint(id);result.put("hoursPerDay",p.hoursPerDay());result.put("workingDays",p.workingDays());result.remove("workSchedules");result.remove("today");return result;}
  @Transactional public Map<String,Object> updateWorkSettings(Map<String,Object> input){schedules.update(input);return settings();}

  public List<Map<String, Object>> bauTemplates() {
    return jdbc.query("SELECT * FROM bau_template ORDER BY sort_order,id", (rs, row) -> map(
        "id", rs.getString("id"), "title", rs.getString("title"), "workKind", rs.getString("work_kind"),
        "mode", rs.getString("mode"), "daysPerMember", rs.getDouble("days_per_member"),
        "active", rs.getBoolean("active"), "sortOrder", rs.getInt("sort_order")));
  }

  @Transactional
  public Map<String, Object> createBauTemplate(Map<String, Object> input) {
    String title = validBauTitle(input);
    ensureUniqueBauTitle(title, null);
    String mode = validBauMode(input);
    double days = validBauDays(input, mode);
    String newId = id("bau");
    int order = jdbc.queryForObject("SELECT COALESCE(MAX(sort_order),0)+10 FROM bau_template", Integer.class);
    jdbc.update("INSERT INTO bau_template(id,title,work_kind,mode,days_per_member,active,sort_order) VALUES (?,?,?,?,?,true,?)",
        newId, title, "BAU", mode, days, order);
    audit("bau-template", newId, "created", map("title", title, "mode", mode, "days", days));
    return bauTemplates().stream().filter(row -> newId.equals(row.get("id"))).findFirst().orElseThrow();
  }

  @Transactional
  public Map<String, Object> updateBauTemplate(String templateId, Map<String, Object> input) {
    Map<String, Object> existing = bauTemplates().stream().filter(row -> templateId.equals(row.get("id"))).findFirst().orElse(null);
    if (existing == null) return null;
    String title = validBauTitle(input);
    ensureUniqueBauTitle(title, templateId);
    String mode = "bau-leave".equals(templateId) ? "LEAVE" : validBauMode(input);
    double days = "LEAVE".equals(mode) ? 0 : validBauDays(input, mode);
    boolean active = Boolean.TRUE.equals(input.get("active"));
    jdbc.update("UPDATE bau_template SET title=?,mode=?,days_per_member=?,active=? WHERE id=?",
        title, mode, days, active, templateId);
    audit("bau-template", templateId, "updated", map("title", title, "mode", mode, "days", days, "active", active));
    return bauTemplates().stream().filter(row -> templateId.equals(row.get("id"))).findFirst().orElseThrow();
  }

  private String validBauTitle(Map<String, Object> input) {
    String title = text(input, "title");
    if (title.isBlank() || title.length() > 120) throw new IllegalArgumentException("BAU adı 1–120 karakter olmalı.");
    return title;
  }
  private void ensureUniqueBauTitle(String title, String exceptId) {
    int count = exceptId == null
        ? jdbc.queryForObject("SELECT COUNT(*) FROM bau_template WHERE LOWER(title)=LOWER(?)", Integer.class, title)
        : jdbc.queryForObject("SELECT COUNT(*) FROM bau_template WHERE LOWER(title)=LOWER(?) AND id<>?", Integer.class, title, exceptId);
    if (count > 0)
      throw new IllegalArgumentException("Bu BAU şablonu zaten var.");
  }
  private String validBauMode(Map<String, Object> input) {
    String mode = text(input, "mode");
    if (!List.of("CORE", "MANUAL").contains(mode)) throw new IllegalArgumentException("BAU atama kuralı geçersiz.");
    return mode;
  }
  private double validBauDays(Map<String, Object> input, String mode) {
    double days = number(input, "daysPerMember");
    if (!Double.isFinite(days) || days < 0 || days > 20 || days * 2 != Math.rint(days * 2)
        || ("CORE".equals(mode) && days == 0) || ("MANUAL".equals(mode) && days != 0))
      throw new IllegalArgumentException("Kişi başı gün 0–20 arasında yarım gün adımlı olmalı; otomatik atamada 0 olamaz.");
    return days;
  }

  @Transactional
  public Map<String, Object> updateSettings(Map<String, Object> input) {
    String mode = text(input, "estimationMode");
    if (!List.of("SIZE_AND_HOURS", "POINTS_AND_HOURS").contains(mode))
      throw new IllegalArgumentException("Tahmin yöntemi geçersiz.");
    jdbc.update("UPDATE product_setting SET setting_value=? WHERE setting_key='estimation_mode'", mode);
    audit("settings", "estimation_mode", "updated", map("mode", mode));
    return settings();
  }
  public List<Map<String, Object>> roadmap() {
    return jdbc.query("""
      SELECT r.*, (SELECT COUNT(*) FROM backlog_item b WHERE b.roadmap_id=r.id) backlog_count,
      (SELECT COUNT(*) FROM backlog_item b JOIN sprint_task t ON t.backlog_id=b.id WHERE b.roadmap_id=r.id AND t.status='done') done_count
      FROM roadmap_item r ORDER BY r.created_at DESC
      """, (rs, row) -> map("id", rs.getString("id"), "title", rs.getString("title"), "description", rs.getString("description"),
        "kind",rs.getString("item_kind"),"referenceId",rs.getString("reference_id"),
        "status", rs.getString("status"), "priority", rs.getString("priority"), "targetDate", date(rs, "target_date"), "backlogCount", rs.getInt("backlog_count"), "doneCount", rs.getInt("done_count")));
  }
  public List<Map<String, Object>> backlog() {
    var result = jdbc.query("""
      SELECT b.*,t.id task_id,t.sprint_id,t.status task_status,s.status sprint_status,s.name sprint_name,r.title roadmap_title,m.name owner_name,m.active owner_active
      FROM backlog_item b LEFT JOIN sprint_task t ON t.backlog_id=b.id
      LEFT JOIN sprint s ON s.id=t.sprint_id
      LEFT JOIN member m ON m.id=b.owner_id
      LEFT JOIN roadmap_item r ON r.id=b.roadmap_id ORDER BY b.created_at DESC,b.id DESC
      """, (rs, row) -> map("id", rs.getString("id"), "roadmapId", rs.getString("roadmap_id"),
        "title", rs.getString("title"), "criteria", rs.getString("criteria"), "workKind", rs.getString("work_kind"),
        "type", rs.getString("type"), "taskCategory", rs.getString("task_category"), "taskSubtype", rs.getString("task_subtype"),
        "state", rs.getString("state"), "estimatedHours", rs.getDouble("estimated_hours"),
        "storyPoints", nullableDouble(rs, "story_points"), "size", rs.getString("size_code"), "externalId", rs.getString("external_id"),
        "repeatOfId", rs.getString("repeat_of_id"), "taskId", rs.getString("task_id"), "sprintId", rs.getString("sprint_id"),
        "sprintStatus",rs.getString("sprint_status"),"sprintName",rs.getString("sprint_name"),"taskStatus", rs.getString("task_status"), "roadmapTitle", rs.getString("roadmap_title"),
        "priority",rs.getString("priority"),"ownerId",rs.getString("owner_id"),"ownerName",rs.getString("owner_name"),"ownerActive",rs.getBoolean("owner_active")));
    defects.enrich(result,"id");
    planning.enrich(result);
    return result;
  }
  public Map<String,Object> readiness(String id) { return backlog().stream().filter(item->id.equals(item.get("id"))).findFirst().orElse(null); }
  public List<Map<String,Object>> team() {
    var rows=legacyTeam();var today=LocalDate.now(java.time.ZoneId.of("Europe/Istanbul"));
    for(var row:rows){var periods=participation.periods(row.get("id").toString());row.put("active",participation.at(row.get("id").toString(),today)?1:0);row.put("participationCount",periods.size());if(!periods.isEmpty()){var latest=periods.getLast();row.put("participationJoinedOn",latest.joinedOn());row.put("participationLeftOn",latest.leftOn());row.put("participationClosed",latest.closed());}}
    var photos=new HashMap<String,String>();jdbc.query("SELECT member_id,image_data FROM member_photo",rs->{photos.put(rs.getString(1),rs.getString(2));});
    for(var row:rows)row.put("photoDataUrl",photos.get(row.get("id").toString()));
    return rows;
  }
  @Transactional public Map<String,Object> saveMemberPhoto(String memberId,Map<String,Object> input){
    if(jdbc.queryForList("SELECT id FROM member WHERE id=? FOR UPDATE",memberId).isEmpty())return null;
    String photo=MemberPhoto.normalize(text(input,"photoDataUrl"));
    if(photo.isEmpty())jdbc.update("DELETE FROM member_photo WHERE member_id=?",memberId);
    else jdbc.update("MERGE INTO member_photo(member_id,image_data) KEY(member_id) VALUES (?,?)",memberId,photo);
    audit("member",memberId,photo.isEmpty()?"photo-removed":"photo-updated",map());
    return map("photoDataUrl",photo.isEmpty()?null:photo);
  }
  public List<Map<String,Object>> reviewTeam(String sprintId){
    var capacity=capacity(sprintId);if(capacity==null)return null;
    var profiles=new HashMap<String,Map<String,Object>>();for(var row:team())profiles.put(row.get("id").toString(),row);
    var result=new ArrayList<Map<String,Object>>();
    for(var row:capacity){
      var profile=profiles.get(row.get("memberId").toString());if(profile==null)continue;
      String role=Objects.toString(row.get("role"),Objects.toString(profile.get("teamRole"),""));
      if(Boolean.TRUE.equals(row.get("supportMember"))&&!role.equalsIgnoreCase("ARCHITECT"))continue;
      result.add(map("id",row.get("memberId"),"name",row.get("memberName"),"title",profile.get("title"),"role",profile.get("role"),"teamRole",role,"engagement",Boolean.TRUE.equals(row.get("supportMember"))?"SUPPORT":"CORE","photoDataUrl",profile.get("photoDataUrl")));
    }
    return result;
  }
  private List<Map<String, Object>> legacyTeam() {
    return jdbc.query("SELECT * FROM member ORDER BY active DESC,name", (rs, row) -> map("id", rs.getString("id"),
        "name", rs.getString("name"), "title", rs.getString("title"), "role", rs.getString("role"),
        "teamRole", rs.getString("team_role"), "engagement", rs.getString("engagement"), "active", rs.getBoolean("active") ? 1 : 0,
        "joinedOn", date(rs, "joined_on"), "leftOn", date(rs, "left_on")));
  }
  private boolean isSupport(Map<String, Object> member) {
    return "support".equalsIgnoreCase(String.valueOf(member.get("engagement")));
  }
  public Map<String, Object> retro(String sprintId) {
    if (sprint(sprintId) == null) return null;
    List<Map<String, Object>> rows = jdbc.query("SELECT * FROM sprint_retro WHERE sprint_id=?", (rs, row) -> map(
        "sprintId", rs.getString("sprint_id"), "workedWell", rs.getString("worked_well"),
        "improve", rs.getString("improve"), "actions", rs.getString("actions")), sprintId);
    return rows.isEmpty() ? map("sprintId", sprintId, "workedWell", "", "improve", "", "actions", "") : rows.getFirst();
  }
  @Transactional
  public Map<String, Object> saveRetro(String sprintId, Map<String, Object> input) {
    if (sprint(sprintId) == null) return null;
    jdbc.update("MERGE INTO sprint_retro(sprint_id,worked_well,improve,actions,updated_at) KEY(sprint_id) VALUES (?,?,?,?,?)",
        sprintId, text(input, "workedWell"), text(input, "improve"), text(input, "actions"), Timestamp.from(Instant.now()));
    audit("sprint", sprintId, "retro-saved", map());
    return retro(sprintId);
  }
  @Transactional
  public Map<String, Object> createMember(Map<String, Object> input) {
    String name = text(input, "name");
    if (name.isBlank() || name.length() > 150) throw new IllegalArgumentException("Üye adı 1–150 karakter olmalı.");
    String engagement = engagement(input);
    String newId = id("member");
    String joinedOn = text(input, "joinedOn");
    jdbc.update("INSERT INTO member VALUES (?,?,?,?,?,?,?,?,?)", newId, name, text(input, "title"),
        text(input, "role"), text(input, "teamRole"), engagement,
        true, joinedOn.isBlank() ? null : java.sql.Date.valueOf(joinedOn), null);
    participation.initialize(newId,joinedOn);
    audit("member", newId, "created", map("name", name));
    return map("id", newId, "name", name, "active", 1);
  }
  private String engagement(Map<String, Object> input) {
    String value = text(input, "engagement");
    if (value.isBlank()) return "CORE";
    if (!List.of("CORE", "SUPPORT").contains(value.toUpperCase(java.util.Locale.ROOT)))
      throw new IllegalArgumentException("Katılım türü çekirdek ekip veya destek olmalı.");
    return value.toUpperCase(java.util.Locale.ROOT);
  }
  @Transactional
  public Map<String, Object> updateMember(String memberId, Map<String, Object> input) {
    if (jdbc.queryForObject("SELECT COUNT(*) FROM member WHERE id=?", Integer.class, memberId) == 0) return null;
    String name = text(input, "name");
    String title = text(input, "title");
    String role = text(input, "role");
    String teamRole = text(input, "teamRole");
    String joinedOn = text(input, "joinedOn");
    if (name.isBlank() || name.length() > 150 || title.length() > 160 || role.length() > 40 || teamRole.length() > 40)
      throw new IllegalArgumentException("Üye bilgilerini ve alan uzunluklarını kontrol edin.");
    String original=jdbc.queryForObject("SELECT joined_on FROM member WHERE id=?",String.class,memberId);
    if(!Objects.equals(original,joinedOn.isBlank()?null:joinedOn))throw new IllegalArgumentException("Katılım tarihini Katılım geçmişi penceresinden düzenleyin.");
    jdbc.update("UPDATE member SET name=?,title=?,role=?,team_role=?,engagement=? WHERE id=?",name,title,role,teamRole,engagement(input),memberId);
    audit("member", memberId, "updated", map("name", name));
    return team().stream().filter(row -> memberId.equals(row.get("id"))).findFirst().orElseThrow();
  }
  @Transactional
  public Map<String, Object> setMemberActive(String memberId, Map<String, Object> input) {
    var current=participation.read(memberId);if(current==null)return null;
    boolean active=Boolean.TRUE.equals(input.get("active"));
    var rows=new ArrayList<>(participation.periods(memberId));var last=rows.getLast();
    var today=LocalDate.now(java.time.ZoneId.of("Europe/Istanbul"));
    if(active){if(!last.closed())throw new IllegalArgumentException("Üyenin açık dönemi zaten var.");rows.add(new ParticipationService.Period(today.toString(),null,false));}
    else {if(last.closed())throw new IllegalArgumentException("Üyenin dönemi zaten kapalı.");rows.set(rows.size()-1,new ParticipationService.Period(last.joinedOn(),today.minusDays(1).toString(),true));}
    participation.save(memberId,map("version",current.get("version"),"periods",rows));
    return map("id",memberId,"active",active);
  }
  @Transactional
  public Map<String, Object> replaceAssignments(String taskId, Map<String, Object> input) {
    List<Map<String, Object>> tasks = jdbc.queryForList("SELECT t.sprint_id,s.status FROM sprint_task t JOIN sprint s ON s.id=t.sprint_id WHERE t.id=? FOR UPDATE", taskId);
    if (tasks.isEmpty()) return null;
    if (!List.of("active", "planned").contains(tasks.getFirst().get("STATUS")))
      throw new IllegalArgumentException("Tamamlanan sprintin atamaları değiştirilemez.");
    if (jdbc.queryForObject("SELECT COUNT(*) FROM sprint_task WHERE id=? AND work_kind='LEAVE' AND external_id LIKE 'BAU-AUTO:%'", Integer.class, taskId) > 0)
      throw new IllegalArgumentException("On Leave atamaları izin kayıtlarından hesaplanır; İzinler sayfasından düzenleyin.");
    var previousAssignments=jdbc.query("SELECT a.member_id,m.name,a.estimated_hours,a.support_only FROM assignment a LEFT JOIN member m ON m.id=a.member_id WHERE a.task_id=?",(rs,i)->map("memberId",rs.getString(1),"memberName",rs.getString(2),"estimatedHours",rs.getDouble(3),"supportOnly",rs.getBoolean(4)),taskId);
    Object raw = input.get("assignments");
    if (!(raw instanceof List<?> entries)) throw new IllegalArgumentException("Atama listesi gerekli.");
    java.util.Set<String> seen = new java.util.HashSet<>();
    List<Map<String, Object>> normalized = new ArrayList<>();
    for (Object entry : entries) {
      if (!(entry instanceof Map<?, ?> item)) throw new IllegalArgumentException("Atama kaydı geçersiz.");
      String memberId = String.valueOf(item.get("memberId"));
      if (!seen.add(memberId)) throw new IllegalArgumentException("Aynı kişi iki kez atanamaz.");
      if (!participation.at(memberId,LocalDate.now(java.time.ZoneId.of("Europe/Istanbul"))) && jdbc.queryForObject("SELECT COUNT(*) FROM assignment WHERE member_id=? AND task_id=?",Integer.class,memberId,taskId)==0)
        throw new IllegalArgumentException("Aktif üye veya mevcut tarihsel atama bulunamadı.");
      double hours = number(map("estimatedHours", item.get("estimatedHours")), "estimatedHours");
      if (hours < 0 || hours > 1000) throw new IllegalArgumentException("Atama saati 0–1000 arasında olmalı.");
      boolean supportOnly = Boolean.TRUE.equals(item.get("supportOnly"));
      if (supportOnly && hours != 0) throw new IllegalArgumentException("X destek atamasında saat 0 olmalı.");
      normalized.add(map("memberId", memberId, "memberName",jdbc.queryForObject("SELECT name FROM member WHERE id=?",String.class,memberId),"estimatedHours", hours, "supportOnly", supportOnly));
    }
    jdbc.update("DELETE FROM assignment WHERE task_id=?", taskId);
    for (Map<String, Object> item : normalized)
      jdbc.update("INSERT INTO assignment(id,task_id,member_id,estimated_hours,support_only) VALUES (?,?,?,?,?)",
          id("assignment"), taskId, item.get("memberId"), item.get("estimatedHours"), item.get("supportOnly"));
    if (jdbc.queryForObject("SELECT COUNT(*) FROM sprint_task WHERE id=? AND external_id LIKE 'BAU-AUTO:%'", Integer.class, taskId) > 0) {
      double totalHours = normalized.stream().mapToDouble(row -> ((Number) row.get("estimatedHours")).doubleValue()).sum();
      jdbc.update("UPDATE sprint_task SET estimated_hours=?,remaining_hours=CASE WHEN status='done' THEN 0 ELSE ? END WHERE id=?",
          totalHours, totalHours, taskId);
      jdbc.update("UPDATE backlog_item SET estimated_hours=? WHERE id=(SELECT backlog_id FROM sprint_task WHERE id=?)", totalHours, taskId);
    }
    audit("task", taskId, "assignments-replaced", map("previousAssignments",previousAssignments,"assignments", normalized));
    return map("taskId", taskId, "assignments", normalized);
  }
  public List<Map<String, Object>> leaves() {
    return jdbc.query("SELECT l.*,m.name member_name,s.name sprint_name FROM leave_record l JOIN member m ON m.id=l.member_id LEFT JOIN sprint s ON s.id=l.sprint_id ORDER BY s.number DESC,m.name",
        (rs, row) -> map("id", rs.getString("id"), "memberId", rs.getString("member_id"), "memberName", rs.getString("member_name"), "sprintName", rs.getString("sprint_name"),
          "days", rs.getDouble("days"), "precision", rs.getString("precision_label"), "status", rs.getString("status"), "sprintId", rs.getString("sprint_id"),
          "leaveType", rs.getString("leave_type"), "entitlementEffect", "OVERTIME".equals(rs.getString("leave_type")) ? rs.getString("overtime_accounting") : "UNSPECIFIED".equals(rs.getString("leave_type")) ? "UNSPECIFIED" : "NONE",
          "overtimeHours",rs.getDouble("overtime_hours"),"overtimeAccounting",rs.getString("overtime_accounting"),
          "start", date(rs, "start_on"), "end", date(rs, "end_on")));
  }
  @Transactional
  public Map<String, Object> createLeave(Map<String, Object> input) {
    return new LeaveLedgerService(jdbc,mapper).save(null,input);
  }
  @Transactional
  public Map<String,Object> updateLeave(String id,Map<String,Object> input){return new LeaveLedgerService(jdbc,mapper).save(id,input);}
  @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
  public List<Map<String,Object>> overtimeBalances(){return new LeaveLedgerService(jdbc,mapper).balances();}
  public List<Map<String, Object>> calendar() {
    return jdbc.query("SELECT n.*,m.name member_name FROM non_working_day n LEFT JOIN member m ON m.id=n.member_id ORDER BY n.day_date DESC,n.title",
        (rs, row) -> map("id", rs.getString("id"), "date", date(rs, "day_date"), "title", rs.getString("title"),
            "memberId", rs.getString("member_id"), "memberName", rs.getString("member_name")));
  }
  @Transactional
  public Map<String, Object> createNonWorkingDay(Map<String, Object> input) {
    String date = text(input, "date");
    String title = text(input, "title");
    String memberId = text(input, "memberId");
    if (date.isBlank() || title.isBlank() || title.length() > 180) throw new IllegalArgumentException("Tarih ve açıklama gerekli.");
    if (!memberId.isBlank() && jdbc.queryForObject("SELECT COUNT(*) FROM member WHERE id=?", Integer.class, memberId) == 0)
      throw new IllegalArgumentException("Üye bulunamadı.");
    String newId = id("dayoff");
    jdbc.update("INSERT INTO non_working_day VALUES (?,?,?,?)", newId, java.sql.Date.valueOf(date), title, memberId.isBlank() ? null : memberId);
    audit("calendar", newId, "created", map("date", date, "memberId", memberId));
    return map("id", newId, "date", date, "title", title);
  }
  @SuppressWarnings("unchecked")
  public List<Map<String, Object>> capacity(String sprintId) {
    var frozen=closures.read(sprintId);
    if(frozen!=null)return (List<Map<String,Object>>)frozen.get("capacity");
    Map<String, Object> sprint = sprint(sprintId);
    if (sprint == null) return null;
    LocalDate start = LocalDate.parse((String) sprint.get("start"));
    LocalDate end = LocalDate.parse((String) sprint.get("end"));
    List<Map<String, Object>> result = new ArrayList<>();
    var workPolicy=schedules.forSprint(sprintId);
    List<Map<String, Object>> calendarDays = calendar();
    List<Map<String, Object>> leaveRecords = leaves();
    Map<String, Double> allocations = new java.util.HashMap<>();
    jdbc.query("SELECT member_id,allocated_days FROM sprint_member_allocation WHERE sprint_id=?", rs -> {
      allocations.put(rs.getString("member_id"), rs.getDouble("allocated_days"));
    }, sprintId);
    for (Map<String, Object> member : legacyTeam()) {
      String memberId=(String)member.get("id");
      List<LocalDate> present=participation.days(sprintId,memberId,start,end,member);
      if(present.isEmpty())continue;
      List<LocalDate> weekdays=present.stream().filter(workPolicy::works).toList();
      java.util.Set<LocalDate> offDays = new java.util.HashSet<>();
      for (Map<String, Object> day : calendarDays) {
        String owner = (String) day.get("memberId");
        LocalDate date = LocalDate.parse((String) day.get("date"));
        if ((owner == null || owner.equals(memberId)) && weekdays.contains(date)) offDays.add(date);
      }
      double undatedLeaveDays = 0;
      Map<LocalDate, Double> datedLeaveFraction = new LinkedHashMap<>();
      for (Map<String, Object> leave : leaveRecords) {
        if (!memberId.equals(leave.get("memberId")) || !sprintId.equals(leave.get("sprintId"))) continue;
        double days = ((Number) leave.get("days")).doubleValue();
        String leaveStart = (String) leave.get("start");
        String leaveEnd = (String) leave.get("end");
        if (leaveStart == null || leaveEnd == null) { undatedLeaveDays += days; continue; }
        List<LocalDate> eligible = weekdays.stream().filter(day -> !day.isBefore(LocalDate.parse(leaveStart))
            && !day.isAfter(LocalDate.parse(leaveEnd)) && !offDays.contains(day)).toList();
        if (eligible.isEmpty()) continue;
        double fraction = Math.min(1, days / eligible.size());
        for (LocalDate day : eligible) datedLeaveFraction.merge(day, fraction, Math::max);
      }
      double leaveDays = undatedLeaveDays + datedLeaveFraction.values().stream().mapToDouble(Double::doubleValue).sum();
      double overtimeHours = jdbc.queryForObject("SELECT COALESCE(SUM(planned_hours),0) FROM overtime_entry WHERE sprint_id=? AND member_id=? AND include_in_capacity=true",
          Double.class, sprintId, memberId);
      double nominalDays = Math.max(0, weekdays.size() - offDays.size());
      double allocatedDays = allocations.containsKey(memberId) ? Math.min(nominalDays, allocations.get(memberId))
          : "completed".equals(sprint.get("status")) || !isSupport(member) ? nominalDays : 0;
      var personalPolicy=memberCapacity.forSprint(sprintId,memberId,workPolicy.hoursPerDay());
      double availableHours = Math.max(0, (allocatedDays - Math.min(allocatedDays, leaveDays)) * personalPolicy.planningHours() + overtimeHours);
      double plannedHours = ((List<Map<String,Object>>)sprint.get("items")).stream().filter(t->!"LEAVE".equals(t.get("workKind"))).flatMap(t->DefectReserve.assignments(t).stream()).filter(a->memberId.equals(a.get("memberId"))).mapToDouble(DefectReserve::planned).sum();
      result.add(map("memberId", memberId, "memberName", member.get("name"), "role", member.get("teamRole"),
          "hoursPerDay",personalPolicy.hoursPerDay(),"focusPercent",personalPolicy.focusPercent(),"workingDays", weekdays.size(), "nonWorkingDays", offDays.size(), "leaveDays", leaveDays,
          "allocatedDays", allocatedDays, "allocationExplicit", allocations.containsKey(memberId), "supportMember", isSupport(member),
          "overtimeHours", overtimeHours, "availableHours", availableHours, "plannedHours", plannedHours, "remainingHours", availableHours - plannedHours));
    }
    return result;
  }
  @Transactional
  public Map<String, Object> setSprintMemberAllocation(String sprintId, String memberId, Map<String, Object> input) {
    if(jdbc.queryForList("SELECT id FROM sprint WHERE id=? FOR UPDATE",sprintId).isEmpty())return null;
    Map<String, Object> sprint = sprint(sprintId);
    if (sprint == null || jdbc.queryForObject("SELECT COUNT(*) FROM member WHERE id=?", Integer.class, memberId) == 0) return null;
    if (!List.of("active", "planned").contains(sprint.get("status")))
      throw new IllegalArgumentException("Tamamlanan sprintin kapasitesi değiştirilemez.");
    double days = number(input, "allocatedDays");
    if (!Double.isFinite(days) || days < 0 || days > 100 || days * 2 != Math.rint(days * 2))
      throw new IllegalArgumentException("Ayrılan gün 0–100 arasında, yarım gün adımlı olmalı.");
    jdbc.update("MERGE INTO sprint_member_allocation(sprint_id,member_id,allocated_days) KEY(sprint_id,member_id) VALUES (?,?,?)",
        sprintId, memberId, days);
    audit("capacity", sprintId + ":" + memberId, "allocation-updated", map("allocatedDays", days));
    return capacity(sprintId).stream().filter(row -> memberId.equals(row.get("memberId"))).findFirst().orElse(null);
  }
  public List<Map<String, Object>> overtime() {
    return jdbc.query("SELECT o.*,m.name member_name,s.name sprint_name,s.number sprint_number FROM overtime_snapshot o JOIN member m ON m.id=o.member_id JOIN sprint s ON s.id=o.sprint_id ORDER BY s.number DESC,m.name",
        (rs, row) -> map("id", rs.getString("id"), "memberId", rs.getString("member_id"), "memberName", rs.getString("member_name"), "sprintName", rs.getString("sprint_name"),
          "sprintNumber", rs.getInt("sprint_number"), "earnedHours", rs.getDouble("earned_hours"),
          "usedCumulativeHours", rs.getDouble("used_cumulative_hours"), "balanceHours", rs.getDouble("balance_hours")));
  }
  public List<Map<String, Object>> overtimeEntries() {
    return jdbc.query("SELECT o.*,m.name member_name,s.name sprint_name,l.plan_id,(SELECT COALESCE(SUM(a.earned_hours),0) FROM overtime_plan_link x JOIN overtime_entry a ON a.id=x.entry_id WHERE x.plan_id=o.id) plan_actual_hours FROM overtime_entry o JOIN member m ON m.id=o.member_id JOIN sprint s ON s.id=o.sprint_id LEFT JOIN overtime_plan_link l ON l.entry_id=o.id ORDER BY o.created_at DESC",
        (rs, row) -> map("id", rs.getString("id"), "memberId", rs.getString("member_id"), "memberName", rs.getString("member_name"),
            "sprintId", rs.getString("sprint_id"), "sprintName", rs.getString("sprint_name"), "earnedHours", rs.getDouble("earned_hours"),
            "usedHours", rs.getDouble("used_hours"), "plannedHours", rs.getDouble("planned_hours"), "planId",rs.getString("plan_id"),"planClassification",rs.getString("plan_classification"),"planActualHours",rs.getDouble("plan_actual_hours"),
            "includeInCapacity", rs.getBoolean("include_in_capacity"), "note", rs.getString("note"), "taskId",rs.getString("task_id"),"taskTitle",rs.getString("task_title"),"roadmapId",rs.getString("roadmap_id"),"roadmapTitle",rs.getString("roadmap_title")));
  }
  @Transactional
  public Map<String, Object> createOvertimeEntry(Map<String, Object> input) {
    String memberId = text(input, "memberId");
    String sprintId = text(input, "sprintId");
    if (jdbc.queryForObject("SELECT COUNT(*) FROM member WHERE id=?", Integer.class, memberId) == 0)
      throw new IllegalArgumentException("Üye bulunamadı.");
    if (sprint(sprintId) == null) throw new IllegalArgumentException("Sprint bulunamadı.");
    jdbc.queryForList("SELECT id FROM sprint WHERE id=? FOR UPDATE",sprintId);
    double earned = number(input, "earnedHours");
    double used = number(input, "usedHours");
    double planned = number(input, "plannedHours");
    if (!Double.isFinite(earned) || !Double.isFinite(used) || !Double.isFinite(planned) || earned < 0 || used < 0 || planned < 0 || earned > 500 || used > 500 || planned > 500)
      throw new IllegalArgumentException("Mesai saatleri 0–500 arasında olmalı.");
    if(used!=0)throw new IllegalArgumentException("Mesai kullanımı İzinler sayfasından mesai hakedişi türüyle girilmeli; ikinci kez kullanım girmeyin.");
    if(earned==0 && planned==0)throw new IllegalArgumentException("Hak edilen veya planlanan mesai saati girin.");
    jdbc.queryForList("SELECT id FROM member WHERE id=? FOR UPDATE",memberId);
    if(Boolean.TRUE.equals(input.get("includeInCapacity")) && closures.read(sprintId)!=null)throw new IllegalArgumentException("Kapanış özeti sabitlenmiş sprintin kapasitesine mesai eklenemez.");
    String note = text(input, "note");
    if (note.length() > 500) throw new IllegalArgumentException("Mesai notu en fazla 500 karakter olmalı.");
    boolean included = Boolean.TRUE.equals(input.get("includeInCapacity"));
    var matchedPlan=OvertimePlanAccounting.validate(jdbc,input,memberId,sprintId,earned,planned,included);
    String newId = id("overtime");
    var context=OvertimeTaskContext.resolve(jdbc,sprintId,text(input,"taskId"),memberId,false);
    jdbc.update("INSERT INTO overtime_entry(id,member_id,sprint_id,earned_hours,used_hours,planned_hours,include_in_capacity,note,created_at,task_id,task_title,roadmap_id,roadmap_title) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", newId, memberId, sprintId, earned, used,
        planned, included, note, Timestamp.from(Instant.now()),context.get("taskId"),context.get("taskTitle"),context.get("roadmapId"),context.get("roadmapTitle"));
    OvertimePlanAccounting.link(jdbc,newId,matchedPlan,earned);
    audit("overtime", newId, "created", map("memberId", memberId, "sprintId", sprintId, "included", included,"taskContext",context,"planId",matchedPlan.get("ID"),"planClassification",matchedPlan.isEmpty()?(earned>0?"UNPLANNED":"LEGACY"):"PLANNED"));
    return map("id", newId, "memberId", memberId, "sprintId", sprintId);
  }
  @Transactional
  public Map<String,Object> changeOvertimePlan(String id,Map<String,Object> input,boolean remove){
    var existing=jdbc.queryForList("SELECT sprint_id FROM overtime_entry WHERE id=?",id);if(existing.isEmpty())return null;
    String sprint=existing.getFirst().get("SPRINT_ID").toString();
    var period=jdbc.queryForMap("SELECT status FROM sprint WHERE id=? FOR UPDATE",sprint);
    if("completed".equals(period.get("STATUS"))||closures.read(sprint)!=null)throw new IllegalArgumentException("Kapalı sprintin mesai planı değiştirilemez.");
    var rows=jdbc.queryForList("SELECT * FROM overtime_entry WHERE id=? FOR UPDATE",id);if(rows.isEmpty())return null;
    var old=rows.getFirst();double previous=((Number)old.get("PLANNED_HOURS")).doubleValue();
    if(previous<=0)throw new IllegalArgumentException("Bu kayıtta düzenlenebilir planlı mesai yok.");
    if(!input.containsKey("expectedHours")||number(input,"expectedHours")!=previous||!Objects.equals(input.get("expectedIncluded"),old.get("INCLUDE_IN_CAPACITY")))
      throw new IllegalArgumentException("Mesai planı değişmiş. Listeyi yenileyip tekrar deneyin.");
    double hours=remove?0:number(input,"plannedHours");
    if(!remove&&(!Double.isFinite(hours)||hours<=0||hours>500))throw new IllegalArgumentException("Planlanan mesai 0’dan büyük, en fazla 500 saat olmalı.");
    if(remove&&!Boolean.TRUE.equals(input.get("confirmed")))throw new IllegalArgumentException("Planlı mesaiyi silmek için onay gerekli.");
    boolean delete=remove&&((Number)old.get("EARNED_HOURS")).doubleValue()==0&&((Number)old.get("USED_HOURS")).doubleValue()==0
      &&jdbc.queryForObject("SELECT COUNT(*) FROM overtime_request WHERE entry_id=?",Integer.class,id)==0
      &&jdbc.queryForObject("SELECT COUNT(*) FROM overtime_plan_link WHERE plan_id=? OR entry_id=?",Integer.class,id,id)==0;
    if(delete)jdbc.update("DELETE FROM overtime_entry WHERE id=?",id);
    else jdbc.update("UPDATE overtime_entry SET planned_hours=?,include_in_capacity=? WHERE id=?",hours,!remove&&Boolean.TRUE.equals(old.get("INCLUDE_IN_CAPACITY")),id);
    audit("overtime",id,remove?"plan-removed":"plan-updated",map("memberId",old.get("MEMBER_ID"),"sprintId",sprint,"previousHours",previous,"plannedHours",hours,"included",old.get("INCLUDE_IN_CAPACITY"),"entryDeleted",delete));
    return map("id",id,"sprintId",sprint,"plannedHours",hours,"entryDeleted",delete);
  }
  public List<Map<String, Object>> reports() {
    return sprints().stream().filter(row -> "completed".equals(row.get("status"))).map(row -> {
      String sprintId = (String) row.get("id");
      Map<String, Object> estimate = jdbc.queryForMap("""
          SELECT COUNT(size_code) sized_tasks,
                 COALESCE(SUM(CASE WHEN size_code='SMALL' THEN 1 ELSE 0 END),0) size_small,
                 COALESCE(SUM(CASE WHEN size_code='MEDIUM' THEN 1 ELSE 0 END),0) size_medium,
                 COALESCE(SUM(CASE WHEN size_code='LARGE' THEN 1 ELSE 0 END),0) size_large,
                 COALESCE(SUM(CASE WHEN size_code='X-LARGE' THEN 1 ELSE 0 END),0) size_xlarge,
                 COUNT(story_points) pointed_tasks,
                 COALESCE(SUM(story_points),0) story_points_total
          FROM sprint_task t WHERE sprint_id=? AND %s
          """.formatted(DELIVERY_FILTER), sprintId);
      int pointed = ((Number) estimate.get("POINTED_TASKS")).intValue();
      return map("id", sprintId, "number", row.get("number"), "name", row.get("name"), "end", row.get("end"),
          "tasks", row.get("deliveryTaskCount"), "done", row.get("deliveryDoneCount"), "undone", row.get("deliveryUndoneCount"),
          "allTasks", row.get("taskCount"),
          "deliveryRate", integer(row, "deliveryTaskCount") == 0 ? null : Math.round(100.0 * integer(row, "deliveryDoneCount") / integer(row, "deliveryTaskCount")),
          "sizedTasks", ((Number) estimate.get("SIZED_TASKS")).intValue(),
          "sizeSmall", ((Number) estimate.get("SIZE_SMALL")).intValue(),
          "sizeMedium", ((Number) estimate.get("SIZE_MEDIUM")).intValue(),
          "sizeLarge", ((Number) estimate.get("SIZE_LARGE")).intValue(),
          "sizeXLarge", ((Number) estimate.get("SIZE_XLARGE")).intValue(),
          "pointedTasks", pointed, "storyPointsTotal", ((Number) estimate.get("STORY_POINTS_TOTAL")).doubleValue(),
          "storyPointsAvailable", pointed > 0);
    }).toList();
  }
  @Transactional(readOnly=true)
  public List<Map<String, Object>> memberReports() {
    var result=new ArrayList<Map<String,Object>>();var members=team();
    for(var summary:sprints()){
      if(!"completed".equals(summary.get("status")))continue;
      String id=summary.get("id").toString();var current=sprint(id);
      Map<String,Double> recordedLeaves=new java.util.HashMap<>();
      jdbc.query("SELECT member_id,SUM(days) days FROM leave_record WHERE sprint_id=? GROUP BY member_id",rs->{recordedLeaves.put(rs.getString("member_id"),rs.getDouble("days"));},id);
      var explicit=new java.util.HashSet<>(jdbc.queryForList("SELECT member_id FROM sprint_member_allocation WHERE sprint_id=?",String.class,id));
      result.addAll(MemberReportBuilder.build(current,capacity(id),members,recordedLeaves,explicit));
    }
    return result;
  }
  @SuppressWarnings("unchecked")
  public List<Map<String, Object>> workTypeReports() {
    var result=new ArrayList<Map<String,Object>>();
    for(var summary:sprints()){
      var groups=new LinkedHashMap<String,Map<String,Object>>();
      for(var t:(List<Map<String,Object>>)sprint(summary.get("id").toString()).get("items")){
        String key=t.get("taskCategory")+":"+t.get("taskSubtype");
        var r=groups.computeIfAbsent(key,k->map("sprintId",summary.get("id"),"sprintNumber",summary.get("number"),"sprintName",summary.get("name"),"sprintStatus",summary.get("status"),"taskCategory",t.get("taskCategory"),"taskSubtype",t.get("taskSubtype"),"taskCount",0,"effortHours",0d,"done",0,"undone",0));
        r.put("taskCount",integer(r,"taskCount")+1);
        r.put("effortHours",DefectReserve.number(r,"effortHours")+("LEAVE".equals(t.get("workKind"))?0:((Number)t.getOrDefault("planningHours",t.get("estimatedHours"))).doubleValue()));
        String status=BauPolicy.isBau(t)?"done":t.get("status").toString();if(List.of("done","undone").contains(status))r.put(status,integer(r,status)+1);
      }result.addAll(groups.values());
    }return result;
  }
  @SuppressWarnings("unchecked")
  public List<Map<String,Object>> defectReserveReports(){
    var result=new ArrayList<Map<String,Object>>();
    for(var summary:sprints())for(var reserve:(List<Map<String,Object>>)sprint(summary.get("id").toString()).getOrDefault("defectReserves",List.of())){
      var r=new LinkedHashMap<>(reserve);r.put("sprintId",summary.get("id"));r.put("sprintName",summary.get("name"));result.add(r);
    }return result;
  }
  @Transactional public Map<String,Object> linkDefectReserve(String taskId,Map<String,Object> input){
    var ids=jdbc.queryForList("SELECT sprint_id FROM sprint_task WHERE id=?",String.class,taskId);if(ids.isEmpty())return null;
    String sprintId=ids.getFirst();jdbc.queryForList("SELECT id FROM sprint WHERE id=? FOR UPDATE",sprintId);
    if(closures.read(sprintId)!=null||!List.of("active","planned").contains(sprint(sprintId).get("status")))throw new IllegalArgumentException("Yalnız açık sprintte rezerv bağlantısı değiştirilebilir.");
    DefectReserve.set(jdbc,taskId,text(input,"reserveTaskId"));
    audit("task",taskId,"reserve-linked",map("reserveTaskId",text(input,"reserveTaskId")));
    return map("taskId",taskId,"reserveTaskId",text(input,"reserveTaskId"));
  }
  public Map<String, Object> exportData() {
return map("exportedAt", Instant.now().toString(), "schemaVersion", 19,
        "sprints", sprints().stream().map(row -> sprint((String) row.get("id"))).toList(), "roadmap", roadmap(), "backlog", backlog(),
        "members", team(), "leaves", leaves(), "overtime", overtime(), "overtimeEntries", overtimeEntries(), "calendar", calendar(),
        "bauTemplates", bauTemplates(),
        "sprintMemberAllocations", jdbc.query("SELECT sprint_id,member_id,allocated_days FROM sprint_member_allocation",
            (rs, row) -> map("sprintId", rs.getString("sprint_id"), "memberId", rs.getString("member_id"), "allocatedDays", rs.getDouble("allocated_days"))),
        "retros", jdbc.query("SELECT sprint_id,worked_well,improve,actions FROM sprint_retro",
            (rs, row) -> map("sprintId", rs.getString("sprint_id"), "workedWell", rs.getString("worked_well"),
                "improve", rs.getString("improve"), "actions", rs.getString("actions"))));
  }

  @Transactional
  public Map<String, Object> createRoadmap(Map<String, Object> input) {
    String title = text(input, "title");
    if (title.isBlank() || title.length() > 180) throw new IllegalArgumentException("Roadmap başlığı 1–180 karakter olmalı.");
    String newId = id("roadmap");
    String date = text(input, "targetDate");
    var identity=roadmapIdentity(input);
    String status=roadmapChoice(input,"status","planned"),priority=roadmapChoice(input,"priority","UNSET");
    jdbc.update("INSERT INTO roadmap_item(id,title,description,status,target_date,created_at,item_kind,reference_id,priority) VALUES (?,?,?,?,?,?,?,?,?)", newId, title, text(input, "description"), status,
        date.isBlank() ? null : java.sql.Date.valueOf(date), Timestamp.from(Instant.now()),identity.get("kind"),identity.get("referenceId").isBlank()?null:identity.get("referenceId"),priority);
    audit("roadmap", newId, "created", map("title", title,"status",status,"priority",priority));
    return map("id", newId, "title", title);
  }
  private Map<String,String> roadmapIdentity(Map<String,Object> input){
    String kind=text(input,"kind");if(kind.isBlank())kind="UNSPECIFIED";
    if(!Set.of("PROJECT","FEATURE_SET","GENERAL","UNSPECIFIED").contains(kind))throw new IllegalArgumentException("Geçersiz Roadmap türü.");
    String reference=text(input,"referenceId");
    if(reference.length()>100||reference.chars().anyMatch(Character::isISOControl))throw new IllegalArgumentException("Referans ID en fazla 100 karakter olmalı ve kontrol karakteri içermemeli.");
    return Map.of("kind",kind,"referenceId",reference);
  }
  private String roadmapChoice(Map<String,Object> input,String field,String fallback){
    String value=input.containsKey(field)?text(input,field):fallback;
    Set<String> allowed=field.equals("status")?Set.of("planned","active","on_hold","completed"):Set.of("UNSET","LOW","NORMAL","HIGH","CRITICAL");
    if(!allowed.contains(value))throw new IllegalArgumentException(field.equals("status")?"Geçersiz Roadmap durumu.":"Geçersiz Roadmap önceliği.");
    return value;
  }
  @Transactional
  public Map<String,Object> updateRoadmap(String id,Map<String,Object> input){
    var current=jdbc.queryForList("SELECT status,priority FROM roadmap_item WHERE id=? FOR UPDATE",id);
    if(current.isEmpty())return null;
    String title=text(input,"title"),date=text(input,"targetDate");
    if(title.isBlank()||title.length()>180)throw new IllegalArgumentException("Roadmap başlığı 1–180 karakter olmalı.");
    var identity=roadmapIdentity(input);
    if(!"GENERAL".equals(identity.get("kind")) && jdbc.queryForObject("SELECT COUNT(*) FROM product_setting WHERE setting_key='bau_roadmap_id' AND setting_value=?",Integer.class,id)>0)
      throw new IllegalArgumentException("Otomatik BAU işlerinin bağlı olduğu Roadmap Genel türünde kalmalıdır.");
    String status=roadmapChoice(input,"status",current.getFirst().get("STATUS").toString()),priority=roadmapChoice(input,"priority",current.getFirst().get("PRIORITY").toString());
    jdbc.update("UPDATE roadmap_item SET title=?,description=?,target_date=?,item_kind=?,reference_id=?,status=?,priority=? WHERE id=?",title,text(input,"description"),date.isBlank()?null:java.sql.Date.valueOf(date),identity.get("kind"),identity.get("referenceId").isBlank()?null:identity.get("referenceId"),status,priority,id);
    audit("roadmap",id,"updated",map("title",title,"kind",identity.get("kind"),"referenceId",identity.get("referenceId"),"previousStatus",current.getFirst().get("STATUS"),"status",status,"previousPriority",current.getFirst().get("PRIORITY"),"priority",priority));
    return roadmap().stream().filter(row->id.equals(row.get("id"))).findFirst().orElseThrow();
  }
  @Transactional(readOnly=true)
  @SuppressWarnings("unchecked")
  public List<Map<String,Object>> roadmapReports(){
    // Current roadmap links; frozen task/assignment values where a closure exists.
    Map<String,Map<String,Object>> tasks=new HashMap<>();
    for(var s:sprints())for(var t:(List<Map<String,Object>>)sprint(s.get("id").toString()).get("items"))tasks.put(t.get("backlogId").toString(),t);
    List<Map<String,Object>> result=new ArrayList<>();var backlog=backlog();
    Map<String,Double> overtime=new HashMap<>();
    jdbc.query("SELECT roadmap_id,SUM(earned_hours) hours FROM overtime_entry WHERE roadmap_id IS NOT NULL GROUP BY roadmap_id",rs->{overtime.put(rs.getString("roadmap_id"),rs.getDouble("hours"));});
    for(var target:roadmap()){
      int taskCount=0,done=0,undone=0,open=0,pool=0,unassigned=0,support=0;
      double assigned=0,doneHours=0,undoneHours=0,openHours=0,poolHours=0;
      for(var b:backlog)if(target.get("id").equals(b.get("roadmapId"))){
        var t=tasks.get(b.get("id"));
        if(t==null){pool++;if(!"LEAVE".equals(b.get("workKind"))&&!"LEAVE".equals(b.get("taskSubtype")))poolHours+=((Number)b.get("estimatedHours")).doubleValue();continue;}
        taskCount++;String status=t.get("status").toString();
        if(status.equals("done"))done++;else if(status.equals("undone"))undone++;else open++;
        if("LEAVE".equals(t.get("workKind"))||"LEAVE".equals(t.get("taskSubtype")))continue;
        var assignments=(List<Map<String,Object>>)t.get("assignments");double hours=0;
        if(assignments.isEmpty())unassigned++;
        for(var a:assignments){if(Boolean.TRUE.equals(a.get("supportOnly")))support++;else hours+=DefectReserve.planned(a);}
        assigned+=hours;if(status.equals("done"))doneHours+=hours;else if(status.equals("undone"))undoneHours+=hours;else openHours+=hours;
      }
      var row=new LinkedHashMap<>(target);row.put("overtimeHours",overtime.getOrDefault(target.get("id").toString(),0d));row.putAll(map("taskCount",taskCount,"done",done,"undone",undone,"open",open,"poolCount",pool,
        "assignedHours",assigned,"doneHours",doneHours,"undoneHours",undoneHours,"openHours",openHours,"poolEstimatedHours",poolHours,"unassignedTaskCount",unassigned,"supportAssignmentCount",support));result.add(row);
    }return result;
  }
  @Transactional
  public Map<String, Object> createBacklog(Map<String, Object> input) {
    String title = text(input, "title");
    if (title.isBlank() || title.length() > 300) throw new IllegalArgumentException("Backlog başlığı 1–300 karakter olmalı.");
    String roadmapId = text(input, "roadmapId");
    if (!roadmapId.isBlank() && jdbc.queryForObject("SELECT COUNT(*) FROM roadmap_item WHERE id=?", Integer.class, roadmapId) == 0)
      throw new IllegalArgumentException("Roadmap kaydı bulunamadı.");
    String mode = String.valueOf(settings().get("estimationMode"));
    String size = nullableSize(input);
    Double storyPoints = nullableNumber(input, "storyPoints");
    if ("SIZE_AND_HOURS".equals(mode) && size == null)
      throw new IllegalArgumentException("Size + efor yönteminde Size seçilmelidir.");
    if ("POINTS_AND_HOURS".equals(mode) && (storyPoints == null || storyPoints <= 0))
      throw new IllegalArgumentException("Story Point + efor yönteminde pozitif Story Point girilmelidir.");
    Map<String, String> taxonomy = taxonomy(input);
    String newId = id("backlog");
    jdbc.update("INSERT INTO backlog_item(id,roadmap_id,title,criteria,work_kind,type,state,estimated_hours,story_points,external_id,repeat_of_id,created_at,size_code,task_category,task_subtype) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", newId, roadmapId.isBlank() ? null : roadmapId,
        title, text(input, "criteria"), taxonomy.get("workKind"), taxonomy.get("legacyType"),
        "Ready", Math.max(0, number(input, "estimatedHours")), "POINTS_AND_HOURS".equals(mode) ? storyPoints : null, "", null, Timestamp.from(Instant.now()),
        "SIZE_AND_HOURS".equals(mode) ? size : null, taxonomy.get("category"), taxonomy.get("subtype").isBlank() ? null : taxonomy.get("subtype"));
    planning.save(newId,input);
    saveDefectInput(newId,input,taxonomy.get("category"));
    audit("backlog", newId, "created", map("roadmapId", roadmapId, "estimationMode", mode, "taskCategory", taxonomy.get("category"), "taskSubtype", taxonomy.get("subtype")));
    return map("id", newId, "title", title);
  }
  @Transactional
  public Map<String, Object> editBacklog(String id, Map<String,Object> input) {
    var rows=jdbc.queryForList("SELECT * FROM backlog_item WHERE id=? FOR UPDATE",id);
    if(rows.isEmpty()) return null;
    if(!"Ready".equals(rows.getFirst().get("STATE")) || jdbc.queryForObject("SELECT COUNT(*) FROM sprint_task WHERE backlog_id=?",Integer.class,id)>0)
      throw new IllegalArgumentException("Yalnız henüz sprinte alınmamış hazır işler bu ekrandan düzenlenebilir.");
    String title=text(input,"title"),criteria=text(input,"criteria"),roadmapId=text(input,"roadmapId");
    if(title.isBlank()||title.length()>300) throw new IllegalArgumentException("Backlog başlığı 1–300 karakter olmalı.");
    if(criteria.length()>10000) throw new IllegalArgumentException("Kabul kriterleri en fazla 10.000 karakter olabilir.");
    if(!roadmapId.isBlank()&&jdbc.queryForObject("SELECT COUNT(*) FROM roadmap_item WHERE id=?",Integer.class,roadmapId)==0) throw new IllegalArgumentException("Roadmap kaydı bulunamadı.");
    double hours=number(input,"estimatedHours");
    if(!Double.isFinite(hours)||hours<0)throw new IllegalArgumentException("Efor geçerli ve negatif olmayan bir saat değeri olmalı.");
    String size=nullableSize(input),mode=String.valueOf(settings().get("estimationMode"));
    Double points=nullableNumber(input,"storyPoints");
    if(points!=null&&(!Double.isFinite(points)||points<0))throw new IllegalArgumentException("Story Point geçersiz.");
    if("SIZE_AND_HOURS".equals(mode)&&size==null)throw new IllegalArgumentException("Size seçilmelidir.");
    if("POINTS_AND_HOURS".equals(mode)&&(points==null||points<=0))throw new IllegalArgumentException("Pozitif Story Point girilmelidir.");
    var taxonomy=taxonomy(input,rows.getFirst().get("TASK_CATEGORY"),rows.getFirst().get("TASK_SUBTYPE"));
    jdbc.update("UPDATE backlog_item SET title=?,criteria=?,roadmap_id=?,estimated_hours=?,size_code=?,story_points=?,task_category=?,task_subtype=?,work_kind=?,type=? WHERE id=?",
        title,criteria,roadmapId.isBlank()?null:roadmapId,hours,size,points,taxonomy.get("category"),taxonomy.get("subtype").isBlank()?null:taxonomy.get("subtype"),taxonomy.get("workKind"),taxonomy.get("legacyType"),id);
    planning.save(id,input);
    saveDefectInput(id,input,taxonomy.get("category"));
    audit("backlog",id,"edited",map("title",title));
    return map("id",id,"title",title);
  }
  @Transactional
  public Map<String, Object> linkBacklog(String id, Map<String, Object> input) {
    String roadmapId = text(input, "roadmapId");
    if (!roadmapId.isBlank() && jdbc.queryForObject("SELECT COUNT(*) FROM roadmap_item WHERE id=?", Integer.class, roadmapId) == 0)
      throw new IllegalArgumentException("Roadmap kaydı bulunamadı.");
    if (jdbc.update("UPDATE backlog_item SET roadmap_id=? WHERE id=?", roadmapId.isBlank() ? null : roadmapId, id) == 0) return null;
    audit("backlog", id, "roadmap-linked", map("roadmapId", roadmapId));
    return map("id", id, "roadmapId", roadmapId.isBlank() ? null : roadmapId);
  }
  @Transactional
  public Map<String, Object> repeatBacklog(String id) {
    List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM backlog_item WHERE id=?", id);
    if (rows.isEmpty()) return null;
    Map<String, Object> row = rows.getFirst();
    String nextId = id("backlog");
    jdbc.update("INSERT INTO backlog_item(id,roadmap_id,title,criteria,work_kind,type,state,estimated_hours,story_points,external_id,repeat_of_id,created_at,size_code,task_category,task_subtype) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", nextId, row.get("ROADMAP_ID"), row.get("TITLE"),
        row.get("CRITERIA"), row.get("WORK_KIND"), row.get("TYPE"), "Ready", row.get("ESTIMATED_HOURS"),
        row.get("STORY_POINTS"), row.get("EXTERNAL_ID"), id, Timestamp.from(Instant.now()), row.get("SIZE_CODE"), row.get("TASK_CATEGORY"), row.get("TASK_SUBTYPE"));
    jdbc.update("UPDATE backlog_item SET priority=?,owner_id=? WHERE id=?",row.get("PRIORITY"),row.get("OWNER_ID"),nextId);
    jdbc.update("INSERT INTO backlog_dependency(backlog_id,depends_on_id) SELECT ?,depends_on_id FROM backlog_dependency WHERE backlog_id=?",nextId,id);
    if("DEFECT".equals(row.get("TASK_CATEGORY")))defects.copy(id,nextId);
    audit("backlog", nextId, "repeated", map("repeatOfId", id));
    return map("id", nextId, "repeatOfId", id);
  }
  @Transactional
  public Map<String, Object> createSprint(Map<String, Object> input) {
    String name = text(input, "name");
    String start = text(input, "start");
    String end = text(input, "end");
    validateSprintDetails(input);
    // Serialize sprint numbering and first-time BAU target binding within the same transaction.
    jdbc.queryForObject("SELECT setting_value FROM product_setting WHERE setting_key='estimation_mode' FOR UPDATE",String.class);
    int number = jdbc.queryForObject("SELECT COALESCE(MAX(number),0)+1 FROM sprint", Integer.class);
    String newId = id("sprint");
    jdbc.update("INSERT INTO sprint VALUES (?,?,?,?,?,?,?,?)", newId, number, name, text(input, "goal"),
        java.sql.Date.valueOf(start), java.sql.Date.valueOf(end), "planned", false);
    schedules.capture(newId,LocalDate.parse(start));
    memberCapacity.capture(newId,LocalDate.parse(start),schedules.forSprint(newId).hoursPerDay());
    participation.capture(newId,LocalDate.parse(start),LocalDate.parse(end));
    addDefaultBauTasks(newId, name, LocalDate.parse(start), LocalDate.parse(end), false, true);
    audit("sprint", newId, "created", map("number", number));
    return map("id", newId, "number", number, "name", name, "status", "planned");
  }

  private void validateSprintDetails(Map<String,Object> input) {
    if(text(input,"name").isBlank() || text(input,"name").length()>160 || text(input,"goal").length()>10000)
      throw new IllegalArgumentException("Sprint adı 1–160, hedef en fazla 10000 karakter olmalı. Hedef boş bırakılabilir.");
    try {
      var start=LocalDate.parse(text(input,"start"));var end=LocalDate.parse(text(input,"end"));
      if(start.getYear()<1900 || end.getYear()>2200 || end.isBefore(start) || java.time.temporal.ChronoUnit.DAYS.between(start,end)>366) throw new IllegalArgumentException();
    } catch(Exception e) { throw new IllegalArgumentException("Geçerli başlangıç/bitiş tarihleri girin; bitiş başlangıçtan önce olamaz ve dönem en fazla 366 gün olabilir."); }
  }
  private String sprintEditVersion(Map<String,Object> sprint) {
    return closures.fingerprint(map("name",sprint.get("name"),"goal",sprint.get("goal"),"start",sprint.get("start"),"end",sprint.get("end"),"status",sprint.get("status")));
  }
  @Transactional(isolation=org.springframework.transaction.annotation.Isolation.SERIALIZABLE)
  public Map<String,Object> updateSprint(String id,Map<String,Object> input) {
    if(jdbc.queryForList("SELECT id FROM sprint WHERE id=? FOR UPDATE",id).isEmpty())return null;
    var before=sprint(id);
    if(!Set.of("planned","active").contains(before.get("status")) || closures.read(id)!=null)
      throw new IllegalArgumentException("Yalnız planlanan veya aktif sprint düzenlenebilir; kapanış kaydı korunur.");
    if(!Objects.equals(before.get("editVersion"),input.get("editVersion")))
      throw new IllegalArgumentException("Sprint başka bir işlemde değişti. Sayfayı yenileyip düzenlemeyi yeniden açın.");
    validateSprintDetails(input);
    var start=LocalDate.parse(text(input,"start"));var end=LocalDate.parse(text(input,"end"));
    boolean datesChanged=!start.toString().equals(before.get("start")) || !end.toString().equals(before.get("end"));
    if(datesChanged) {
      // Never silently move or discard dated leave, overtime requests or authored work notes.
      for(String table:List.of("leave_record","leave_request")) {
        String status=table.equals("leave_request")?" AND status<>'REJECTED'":"";
        if(jdbc.queryForObject("SELECT COUNT(*) FROM "+table+" WHERE sprint_id=?"+status+" AND (start_on<? OR end_on>?)",Integer.class,id,java.sql.Date.valueOf(start),java.sql.Date.valueOf(end))>0)
          throw new IllegalArgumentException("Yeni tarih aralığı izin kaydını veya bekleyen izin talebini dışarıda bırakıyor. Önce ilgili kaydı kontrol edin.");
      }
      if(jdbc.queryForObject("SELECT COUNT(*) FROM overtime_request WHERE sprint_id=? AND status<>'REJECTED' AND (work_date<? OR work_date>?)",Integer.class,id,java.sql.Date.valueOf(start),java.sql.Date.valueOf(end))>0)
        throw new IllegalArgumentException("Yeni tarih aralığı mesai kaydını veya bekleyen mesai talebini dışarıda bırakıyor.");
      if(jdbc.queryForObject("SELECT COUNT(*) FROM task_activity WHERE sprint_id=? AND kind='WORK_NOTE' AND (entry_date<? OR entry_date>?)",Integer.class,id,java.sql.Date.valueOf(start),java.sql.Date.valueOf(end))>0)
        throw new IllegalArgumentException("Yeni tarih aralığı günlük çalışma notlarını dışarıda bırakıyor.");
      participation.resize(id,LocalDate.parse(before.get("start").toString()),LocalDate.parse(before.get("end").toString()),start,end);
    }
    jdbc.update("UPDATE sprint SET name=?,goal=?,start_date=?,end_date=? WHERE id=?",text(input,"name"),text(input,"goal"),java.sql.Date.valueOf(start),java.sql.Date.valueOf(end),id);
    // Keep task identity, estimates, assignments and captured work/hour policies intact.
    audit("sprint",id,"details-updated",map("before",map("name",before.get("name"),"goal",before.get("goal"),"start",before.get("start"),"end",before.get("end")),"after",map("name",text(input,"name"),"goal",text(input,"goal"),"start",start.toString(),"end",end.toString())));
    return sprint(id);
  }

  /** One-time, additive backfill; the setting marker prevents deleted historical tasks from reappearing on restart. */
  @Transactional
  public int backfillHistoricalBau() {
    if (jdbc.queryForObject("SELECT COUNT(*) FROM product_setting WHERE setting_key='historical_bau_v2'", Integer.class) > 0) return 0;
    // This legacy member was described as an architect providing X support, not a core-team effort allocation.
    jdbc.update("UPDATE member SET engagement='SUPPORT' WHERE id='legacy-member-sakir' AND engagement='CORE' AND team_role='ARCHITECT'");
    int created = 0;
    for (Map<String, Object> row : jdbc.queryForList("SELECT id,name,start_date,end_date,status FROM sprint WHERE id LIKE 'legacy-sprint-%' AND number BETWEEN 1 AND 14 ORDER BY number")) {
      String sprintId = (String) row.get("ID");
      created += addDefaultBauTasks(sprintId, (String) row.get("NAME"),
          ((java.sql.Date) row.get("START_DATE")).toLocalDate(), ((java.sql.Date) row.get("END_DATE")).toLocalDate(),
          "completed".equals(row.get("STATUS")), false);
    }
    // Sprint 13's PDF explicitly says "All 1" for Meeting and Support, unlike the 2-day default.
    for (String kind : List.of("MEETING", "SUPPORT")) {
      List<String> taskIds = jdbc.query("SELECT id FROM sprint_task WHERE sprint_id='legacy-sprint-13' AND external_id IN (?,?)",
          (rs, row) -> rs.getString(1), "BAU-AUTO:" + kind, "BAU-AUTO:bau-" + kind.toLowerCase(java.util.Locale.ROOT));
      for (String taskId : taskIds) {
        jdbc.update("UPDATE assignment SET estimated_hours=8 WHERE task_id=? AND estimated_hours=16", taskId);
        double hours = jdbc.queryForObject("SELECT COALESCE(SUM(estimated_hours),0) FROM assignment WHERE task_id=?", Double.class, taskId);
        jdbc.update("UPDATE sprint_task SET estimated_hours=? WHERE id=?", hours, taskId);
        jdbc.update("UPDATE backlog_item SET estimated_hours=? WHERE id=(SELECT backlog_id FROM sprint_task WHERE id=?)", hours, taskId);
      }
    }
    jdbc.update("INSERT INTO product_setting(setting_key,setting_value) VALUES ('historical_bau_v2','applied')");
    audit("workspace", "historical-bau-v2", "bau-backfilled", map("tasksCreated", created));
    return created;
  }

  /** Called only for new sprints, while createSprint holds the settings row lock. */
  private String defaultBauRoadmap() {
    var binding=jdbc.queryForList("SELECT setting_value FROM product_setting WHERE setting_key='bau_roadmap_id'",String.class);
    if(!binding.isEmpty()){
      String target=binding.getFirst();
      if(jdbc.queryForObject("SELECT COUNT(*) FROM roadmap_item WHERE id=? AND item_kind='GENERAL'",Integer.class,target)!=1)
        throw new IllegalArgumentException("Otomatik BAU Roadmap bağlantısı geçersiz. Genel türündeki BAU hedefini veya yedeği kontrol edin.");
      return target;
    }
    var candidates=jdbc.queryForList("SELECT id FROM roadmap_item WHERE item_kind='GENERAL' AND UPPER(TRIM(title))='BAU' ORDER BY id",String.class);
    if(candidates.size()>1)throw new IllegalArgumentException("Birden fazla BAU adlı Genel Roadmap var. Otomatik bağlantı için yalnız birini BAU adıyla bırakın.");
    String target=candidates.isEmpty()?createRoadmap(map("title","BAU","kind","GENERAL","description","Proje ve feature set kapsamından ayrı ekip operasyonları: Support, Meeting, Training ve Leave.")).get("id").toString():candidates.getFirst();
    jdbc.update("INSERT INTO product_setting(setting_key,setting_value) VALUES ('bau_roadmap_id',?)",target);
    audit("roadmap",target,"bau-default-linked",map("source","new-sprint"));
    return target;
  }

  private int addDefaultBauTasks(String sprintId, String sprintName, LocalDate start, LocalDate end, boolean completed, boolean autoLink) {
    List<String> members = jdbc.query("""
        SELECT id FROM member WHERE engagement='CORE' AND team_role<>'ARCHITECT'
          AND (? OR active=true) AND (joined_on IS NULL OR joined_on<=?) AND (left_on IS NULL OR left_on>=?)
        ORDER BY id
        """, (rs, row) -> rs.getString("id"), completed, java.sql.Date.valueOf(end), java.sql.Date.valueOf(start));
    if(autoLink) members=legacyTeam().stream().filter(m->"CORE".equalsIgnoreCase(m.get("engagement").toString())&&!"ARCHITECT".equals(m.get("teamRole"))&&!participation.days(sprintId,m.get("id").toString(),start,end,m).isEmpty()).map(m->m.get("id").toString()).toList();
    int created = 0;
    String bauRoadmapId = null;
    for (Map<String, Object> template : bauTemplates()) {
      if (!Boolean.TRUE.equals(template.get("active"))) continue;
      String templateId = (String) template.get("id");
      if("bau-defect-support".equals(templateId)&&!autoLink)continue;
      String kind = (String) template.get("workKind");
      String mode = (String) template.get("mode");
      String title = sprintName + " · " + template.get("title");
      String marker = "BAU-AUTO:" + templateId;
      String legacyMarker = "BAU-AUTO:" + kind;
      if (jdbc.queryForObject("SELECT COUNT(*) FROM sprint_task WHERE sprint_id=? AND (title=? OR external_id=? OR external_id=?)",
          Integer.class, sprintId, title, marker, legacyMarker) > 0) continue;
      if(autoLink && bauRoadmapId==null)bauRoadmapId=defaultBauRoadmap();
      String backlogId = id("backlog-bau");
      String taskId = id("task-bau");
      String note = completed ? "Kullanıcı beyanına göre geçmiş sprinte eklenen standart BAU planı; kaynakta birebir görev sonucu doğrulanmadı."
          : "Yeni sprint için varsayılan BAU planı; planlama sırasında efor ve atamalar düzenlenebilir.";
      if ("LEAVE".equals(mode)) note = "İzinler sayfasındaki sprint izinlerinden türetilir. Görev eforu 0 saattir; izin yalnız kişi kapasitesinden düşülür.";
      if ("MANUAL".equals(mode)) note = "Varsayılan BAU başlığıdır; kişi ve efor ihtiyaç varsa sprint planında ayrıca atanır. Geçmişte sonuç kaynakla doğrulanmalıdır.";
      double days = ((Number) template.get("daysPerMember")).doubleValue();
      double hours = "CORE".equals(mode) ? members.stream().mapToDouble(m->days*memberCapacity.forSprint(sprintId,m,schedules.forSprint(sprintId).hoursPerDay()).hoursPerDay()).sum() : 0;
      String bauSubtype = List.of("SUPPORT", "MEETING", "TRAINING", "LEAVE", "DEFECT_SUPPORT").contains(kind) ? kind : "OTHER_BAU";
      jdbc.update("INSERT INTO backlog_item(id,roadmap_id,title,criteria,work_kind,type,state,estimated_hours,story_points,external_id,repeat_of_id,created_at,size_code,task_category,task_subtype) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          backlogId, bauRoadmapId, title, note, kind, "BAU", completed ? "Done" : "IN_SPRINT", hours, null,
          marker, null, Timestamp.from(Instant.now()), "SMALL", "BAU", bauSubtype);
      jdbc.update("INSERT INTO sprint_task(id,sprint_id,backlog_id,title,criteria,type,work_kind,status,estimated_hours,remaining_hours,story_points,external_id,status_note,size_code,task_category,task_subtype) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          taskId, sprintId, backlogId, title, note, "BAU", kind, completed ? "done" : "todo", hours,
          completed ? 0 : hours, null, marker, completed ? note : "", "SMALL", "BAU", bauSubtype);
      if ("CORE".equals(mode)) for (String memberId : members)
        jdbc.update("INSERT INTO assignment(id,task_id,member_id,estimated_hours,support_only) VALUES (?,?,?,?,false)",
            taskId + "-" + memberId, taskId, memberId, days * memberCapacity.forSprint(sprintId,memberId,schedules.forSprint(sprintId).hoursPerDay()).hoursPerDay());
      if (completed && "TRAINING".equals(kind) && "legacy-sprint-10".equals(sprintId)) {
        for (String memberId : members)
          jdbc.update("INSERT INTO assignment(id,task_id,member_id,estimated_hours,support_only) VALUES (?,?,?,?,false)",
              taskId + "-" + memberId, taskId, memberId, 8.0);
        double trainingHours = members.size() * 8.0;
        jdbc.update("UPDATE sprint_task SET estimated_hours=? WHERE id=?", trainingHours, taskId);
        jdbc.update("UPDATE backlog_item SET estimated_hours=? WHERE id=?", trainingHours, backlogId);
      }
      if ("TRAINING".equals(kind) && "legacy-sprint-14".equals(sprintId))
        jdbc.update("INSERT INTO assignment(id,task_id,member_id,estimated_hours,support_only) SELECT ?,?,?,0,true WHERE EXISTS (SELECT 1 FROM member WHERE id=?)",
            taskId + "-legacy-member-yasin", taskId, "legacy-member-yasin", "legacy-member-yasin");
      created++;
    }
    return created;
  }
  @Transactional
  public Map<String, Object> startSprint(String id) {
    if(jdbc.queryForList("SELECT id FROM sprint WHERE id=? FOR UPDATE",id).isEmpty())return null;
    Map<String, Object> row = sprint(id);
    if (row == null) return null;
    if (!"planned".equals(row.get("status"))) throw new IllegalArgumentException("Yalnız planlanan sprint başlatılabilir.");
    if (sprints().stream().anyMatch(item -> "active".equals(item.get("status")))) throw new IllegalArgumentException("Önce aktif sprinti tamamlayın.");
    jdbc.update("UPDATE sprint SET status='active' WHERE id=?", id);
    flow.begin(id,(List<Map<String,Object>>)row.get("items"),true);
    audit("sprint", id, "started", map());
    return map("id", id, "status", "active");
  }
  @Transactional
  public Map<String,Object> createSprintTask(String sprintId,Map<String,Object> input){
    var states=jdbc.queryForList("SELECT status FROM sprint WHERE id=? FOR UPDATE",String.class,sprintId);
    if(states.isEmpty())return null;
    if(!List.of("active","planned").contains(states.getFirst()))throw new IllegalArgumentException("Kapanmış sprinte iş eklenemez.");
    if(!Boolean.TRUE.equals(input.get("readinessAcknowledged")))throw new IllegalArgumentException("Yeni işin kapsamını ve atamalarını onaylayın.");
    double hours=number(input,"estimatedHours");if(!Double.isFinite(hours)||hours<0||hours>10000)throw new IllegalArgumentException("Geçerli efor girin.");
    if(text(input,"criteria").length()>10000)throw new IllegalArgumentException("Kabul kriterleri en fazla 10.000 karakter.");
    if("LEAVE".equals(input.get("taskSubtype")))throw new IllegalArgumentException("İzinleri İzinler sayfasından girin.");
    var backlog=createBacklog(input);String backlogId=backlog.get("id").toString();
    var add=new LinkedHashMap<String,Object>(input);add.put("backlogId",backlogId);
    add.put("readinessFingerprint",((Map<?,?>)readiness(backlogId).get("readiness")).get("fingerprint"));
    return addTask(sprintId,add);
  }
  @Transactional
  public Map<String, Object> addTask(String sprintId, Map<String, Object> input) {
    if(jdbc.queryForList("SELECT id FROM sprint WHERE id=? FOR UPDATE",sprintId).isEmpty())return null;
    Map<String, Object> sprint = sprint(sprintId);
    if (sprint == null) return null;
    if (!List.of("active", "planned").contains(sprint.get("status"))) throw new IllegalArgumentException("Tamamlanan sprinte iş eklenemez.");
    String scopeReason="active".equals(sprint.get("status"))?SprintFlowService.reason(input):"";
    if(input.containsKey("emergency")&&!(input.get("emergency") instanceof Boolean))throw new IllegalArgumentException("Acil iş seçimi geçersiz.");
    boolean emergency=Boolean.TRUE.equals(input.get("emergency"));
    if(emergency&&!"active".equals(sprint.get("status")))throw new IllegalArgumentException("Acil iş yalnız aktif sprinte eklenebilir.");
    String backlogId = text(input, "backlogId");
    List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM backlog_item WHERE id=? FOR UPDATE", backlogId);
    if (rows.isEmpty()) throw new IllegalArgumentException("Backlog işi bulunamadı.");
    if (jdbc.queryForObject("SELECT COUNT(*) FROM sprint_task WHERE backlog_id=?", Integer.class, backlogId) > 0)
      throw new IllegalArgumentException("Bu backlog işi zaten bir sprint görevine bağlı.");
    Map<String, Object> row = rows.getFirst();
    var checked=readiness(backlogId);
    @SuppressWarnings("unchecked") var check=(Map<String,Object>)checked.get("readiness");
    if(!Boolean.TRUE.equals(check.get("eligible")))throw new IllegalArgumentException("Yalnız havuzdaki işler sprinte eklenebilir.");
    if(!Boolean.TRUE.equals(check.get("ready")) && (!Boolean.TRUE.equals(input.get("readinessAcknowledged")) || !check.get("fingerprint").equals(input.get("readinessFingerprint"))))
      throw new IllegalArgumentException("Hazırlık kontrolü uyarıları var veya bilgiler değişti. İşin hazırlık kontrolünü açıp yeniden onaylayın.");
    String newId = id("task");
    if("active".equals(sprint.get("status")))flow.begin(sprintId,(List<Map<String,Object>>)sprint.get("items"),false);
    jdbc.update("INSERT INTO sprint_task(id,sprint_id,backlog_id,title,criteria,type,work_kind,status,estimated_hours,remaining_hours,story_points,external_id,size_code,task_category,task_subtype) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", newId, sprintId, backlogId, row.get("TITLE"),
        row.get("CRITERIA"), row.get("TYPE"), row.get("WORK_KIND"), "todo", row.get("ESTIMATED_HOURS"),
        row.get("ESTIMATED_HOURS"), row.get("STORY_POINTS"), row.get("EXTERNAL_ID"), row.get("SIZE_CODE"), row.get("TASK_CATEGORY"), row.get("TASK_SUBTYPE"));
    jdbc.update("UPDATE backlog_item SET state='IN_SPRINT' WHERE id=?", backlogId);
    if (row.get("STORY_POINTS") != null) jdbc.update("UPDATE sprint SET story_points_available=true WHERE id=?", sprintId);
    if(input.containsKey("assignments"))replaceAssignments(newId,input);
    if(!text(input,"reserveTaskId").isBlank())DefectReserve.set(jdbc,newId,text(input,"reserveTaskId"));
    if("active".equals(sprint.get("status"))){
      var current=(List<Map<String,Object>>)sprint(sprintId).get("items");var added=current.stream().filter(t->newId.equals(t.get("id"))).findFirst().orElseThrow();
      added.put("emergency",emergency);added.put("addedDuringSprint",true);added.put("scopeOrder",Integer.MAX_VALUE);DefectReserve.enrich(current);
      flow.record(sprintId,"ADDED",scopeReason,added);
    }
    audit("task", newId, "added-to-sprint", map("sprintId", sprintId, "backlogId", backlogId,"readinessWarnings",check.get("warnings"),"warningsAcknowledged",Boolean.TRUE.equals(input.get("readinessAcknowledged"))));
    return map("id", newId, "sprintId", sprintId, "backlogId", backlogId, "status", "todo");
  }
  @Transactional
  public Map<String,Object> renameTask(String id,Map<String,Object> input){
    var ids=jdbc.queryForList("SELECT sprint_id FROM sprint_task WHERE id=?",String.class,id);
    if(ids.isEmpty())return null;
    jdbc.queryForList("SELECT id FROM sprint WHERE id=? FOR UPDATE",ids.getFirst());
    var rows=jdbc.queryForList("SELECT t.*,s.status sprint_status FROM sprint_task t JOIN sprint s ON s.id=t.sprint_id WHERE t.id=? FOR UPDATE",id);
    if(rows.isEmpty())return null;var row=rows.getFirst();
    if(!Set.of("active","planned").contains(row.get("SPRINT_STATUS"))||closures.read(ids.getFirst())!=null)throw new IllegalArgumentException("Tamamlanan sprintin görev adı değiştirilemez.");
    String title=text(input,"title");
    if(title.isBlank()||title.length()>300)throw new IllegalArgumentException("Görev adı 1–300 karakter olmalı.");
    if(!Objects.equals(input.get("expectedTitle"),row.get("TITLE")))throw new IllegalArgumentException("Görev adı başka bir işlemde değişti. Sayfayı yenileyip tekrar deneyin.");
    if(title.equals(row.get("TITLE")))return map("id",id,"name",title);
    jdbc.update("UPDATE sprint_task SET title=? WHERE id=?",title,id);
    jdbc.update("UPDATE backlog_item SET title=? WHERE id=?",title,row.get("BACKLOG_ID"));
    audit("task",id,"title-changed",map("from",row.get("TITLE"),"to",title,"backlogId",row.get("BACKLOG_ID")));
    return map("id",id,"name",title);
  }
  @Transactional
  public Map<String,Object> deleteBacklog(String id,Map<String,Object> input){
    var rows=jdbc.queryForList("SELECT * FROM backlog_item WHERE id=? FOR UPDATE",id);
    if(rows.isEmpty())return null;var row=rows.getFirst();
    if(!Boolean.TRUE.equals(input.get("confirmed")))throw new IllegalArgumentException("Silme işlemini onaylayın.");
    if(!Objects.equals(input.get("expectedTitle"),row.get("TITLE")))throw new IllegalArgumentException("İş değişti. Listeyi yenileyip tekrar deneyin.");
    if(!"Ready".equals(row.get("STATE"))||jdbc.queryForObject("SELECT COUNT(*) FROM sprint_task WHERE backlog_id=?",Integer.class,id)>0)throw new IllegalArgumentException("Yalnız backlog havuzundaki işler silinebilir. Sprintteki işi önce backlog'a geri gönderin.");
    if(jdbc.queryForObject("SELECT COUNT(*) FROM backlog_item WHERE repeat_of_id=?",Integer.class,id)>0)throw new IllegalArgumentException("Bu işin devam/tekrar kayıtları var; geçmiş bağlantısını korumak için silinemez.");
    if(jdbc.queryForObject("SELECT COUNT(*) FROM backlog_dependency WHERE depends_on_id=?",Integer.class,id)>0)throw new IllegalArgumentException("Başka işler bu işe bağımlı. Önce ilgili bağımlılıkları kaldırın.");
    if(jdbc.queryForObject("SELECT COUNT(*) FROM defect_detail WHERE related_id=?",Integer.class,id)>0)throw new IllegalArgumentException("Bu işe bağlı defect kaydı var. Önce ilgili iş bağlantısını kaldırın.");
    if(jdbc.queryForObject("SELECT COUNT(*) FROM retro_action WHERE backlog_id=?",Integer.class,id)>0)throw new IllegalArgumentException("Bu iş retro aksiyonuna bağlı; aksiyon geçmişini korumak için silinemez.");
    var snapshot=backlog().stream().filter(b->id.equals(b.get("id"))).findFirst().orElseThrow();
    audit("backlog",id,"deleted",map("item",snapshot));
    jdbc.update("DELETE FROM backlog_dependency WHERE backlog_id=?",id);
    jdbc.update("DELETE FROM defect_detail WHERE backlog_id=?",id);
    jdbc.update("DELETE FROM backlog_item WHERE id=?",id);
    return map("id",id,"deleted",true);
  }
  @Transactional
  public Map<String, Object> updateTask(String id, Map<String, Object> input) {
    var sprintIds=jdbc.queryForList("SELECT sprint_id FROM sprint_task WHERE id=?",String.class,id);
    if(sprintIds.isEmpty())return null;
    jdbc.queryForList("SELECT id FROM sprint WHERE id=? FOR UPDATE",sprintIds.getFirst());
    List<Map<String, Object>> rows = jdbc.queryForList("SELECT t.*,s.status sprint_status FROM sprint_task t JOIN sprint s ON s.id=t.sprint_id WHERE t.id=? FOR UPDATE", id);
    if (rows.isEmpty()) return null;
    Map<String, Object> row = rows.getFirst();
    if (closures.read(row.get("SPRINT_ID").toString())!=null) throw new IllegalArgumentException("Kapanış kaydı sabitlenmiş sprint görevleri değiştirilemez.");
    if(input.containsKey("status")&&(BauPolicy.isBau(row)||"BAU".equals(input.get("taskCategory"))))
      throw new IllegalArgumentException("BAU işleri otomatik Done kabul edilir; manuel durum değiştirilemez.");
    if (input.containsKey("taskCategory")) {
      if(jdbc.queryForObject("SELECT COUNT(*) FROM defect_reserve_link WHERE task_id=? OR reserve_task_id=?",Integer.class,id,id)>0 && (!Objects.equals(row.get("TASK_CATEGORY"),input.get("taskCategory"))||!Objects.equals(row.get("TASK_SUBTYPE"),input.get("taskSubtype"))))throw new IllegalArgumentException("İş tipini değiştirmeden önce rezerv bağlantılarını kaldırın.");
      if(!java.util.Objects.equals(row.get("TASK_CATEGORY"),input.get("taskCategory"))||!java.util.Objects.equals(row.get("TASK_SUBTYPE"),input.get("taskSubtype")))defects.resetVerification(row.get("BACKLOG_ID").toString());
      Map<String, String> taxonomy = taxonomy(input,row.get("TASK_CATEGORY"),row.get("TASK_SUBTYPE"));
      if("BAU".equals(taxonomy.get("category"))&&Boolean.TRUE.equals(flow.blocker(id).get("blocked")))throw new IllegalArgumentException("Engelli işi BAU'ya çevirmeden önce engeli kaldırın.");
      String subtype = taxonomy.get("subtype").isBlank() ? null : taxonomy.get("subtype");
      jdbc.update("UPDATE sprint_task SET task_category=?,task_subtype=?,work_kind=?,type=? WHERE id=?",
          taxonomy.get("category"), subtype, taxonomy.get("workKind"), taxonomy.get("legacyType"), id);
      jdbc.update("UPDATE backlog_item SET task_category=?,task_subtype=?,work_kind=?,type=? WHERE id=?",
          taxonomy.get("category"), subtype, taxonomy.get("workKind"), taxonomy.get("legacyType"), row.get("BACKLOG_ID"));
      audit("task", id, "taxonomy-changed", map("taskCategory", taxonomy.get("category"), "taskSubtype", taxonomy.get("subtype")));
      if (!input.containsKey("status")) return map("id", id, "taskCategory", taxonomy.get("category"), "taskSubtype", subtype);
    }
    String next = text(input, "status");
    if (!List.of("todo", "doing", "done", "undone").contains(next)) throw new IllegalArgumentException("Geçersiz görev durumu.");
    String note = text(input, "note");
    if(note.length()>2000)throw new IllegalArgumentException("Açıklama en fazla 2000 karakter.");
    if ("undone".equals(next) && note.isBlank()) throw new IllegalArgumentException("Undone için gerekçe gerekli.");
    if (!"active".equals(row.get("SPRINT_STATUS"))) throw new IllegalArgumentException("Yalnız aktif sprint görevleri güncellenebilir.");
    if(List.of("done","undone").contains(next)&&Boolean.TRUE.equals(flow.blocker(id).get("blocked")))throw new IllegalArgumentException("Önce engeli gerekçesiyle kaldırın; sonra görev sonucunu değiştirin. Sprint kapanışı engelli işi Undone olarak koruyabilir.");
    jdbc.update("UPDATE sprint_task SET status=?,remaining_hours=?,status_note=? WHERE id=?", next,
        "done".equals(next) ? 0 : row.get("REMAINING_HOURS"), note, id);
    jdbc.update("UPDATE backlog_item SET state=? WHERE id=?", "done".equals(next) ? "Done" : "IN_SPRINT", row.get("BACKLOG_ID"));
    audit("task", id, "status-changed", map("from", row.get("STATUS"), "to", next, "note", note));
    return map("id", id, "status", next);
  }
  @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.SERIALIZABLE)
  public Map<String,Object> closurePreview(String id) {
    var current=sprint(id);if(current==null)return null;
    if(!"active".equals(current.get("status")))throw new IllegalArgumentException("Yalnız aktif sprint kapanışa hazırlanabilir.");
    var capacity=capacity(id);
    var source=map("sprint",current,"capacity",capacity,"settings",sprintSettings(id),
        "backlog",backlog().stream().filter(row->id.equals(row.get("sprintId"))).toList());
    @SuppressWarnings("unchecked") var tasks=(List<Map<String,Object>>)current.get("items");
    var decisions=new ArrayList<Map<String,Object>>();
    for(var task:tasks){
      boolean bau=BauPolicy.isBau(task),done=bau||"done".equals(task.get("status")),automatic=String.valueOf(task.get("externalId")).startsWith("BAU-AUTO:");
      decisions.add(map("id",task.get("id"),"name",task.get("name"),"status",task.get("status"),"outcome",done?"done":"undone",
          "bau",bau,"automaticBau",automatic,"defaultCarry",!done&&!automatic,"estimatedHours",task.get("estimatedHours"),"blocked",!bau&&Boolean.TRUE.equals(((Map<?,?>)task.get("blocker")).get("blocked")),"blockReason",((Map<?,?>)task.get("blocker")).get("reason"),
          "note",text(task,"statusNote").isBlank()&&!done?"Sprint kapanışında tamamlanmadı.":task.get("statusNote")));
    }
    return map("sprintId",id,"name",current.get("name"),"fingerprint",closures.fingerprint(source),"tasks",decisions,
        "done",decisions.stream().filter(t->"done".equals(t.get("outcome"))).count(),
        "undone",decisions.stream().filter(t->"undone".equals(t.get("outcome"))).count(),
        "deliveryCount",current.get("deliveryTaskCount"),"deliveryDone",current.get("deliveryDoneCount"),
        "capacity",capacity,"settings",sprintSettings(id),"source",source);
  }
  @Transactional
  public Map<String,Object> configureFlow(String id,Map<String,Object> input){
    if(jdbc.queryForList("SELECT id FROM sprint WHERE id=? FOR UPDATE",id).isEmpty())return null;
    var current=sprint(id);if(!"active".equals(current.get("status")))throw new IllegalArgumentException("Akış ayarı yalnız aktif sprintte değiştirilebilir.");
    flow.configure(id,(List<Map<String,Object>>)current.get("items"),input);return sprint(id);
  }
  @Transactional
  public Map<String,Object> removeTask(String id,Map<String,Object> input){
    var ids=jdbc.queryForList("SELECT sprint_id FROM sprint_task WHERE id=?",String.class,id);if(ids.isEmpty())return null;
    String sprintId=ids.getFirst();jdbc.queryForList("SELECT id FROM sprint WHERE id=? FOR UPDATE",sprintId);
    if(jdbc.queryForList("SELECT id FROM sprint_task WHERE id=? FOR UPDATE",id).isEmpty())throw new IllegalArgumentException("Görev artık sprintte değil.");
    var current=sprint(sprintId);if(!List.of("active","planned").contains(current.get("status")))throw new IllegalArgumentException("Kapanmış sprintten iş çıkarılamaz.");
    var tasks=(List<Map<String,Object>>)current.get("items");var task=tasks.stream().filter(t->id.equals(t.get("id"))).findFirst().orElseThrow(()->new IllegalArgumentException("Görev artık sprintte değil."));
    if(!Boolean.TRUE.equals(input.get("confirmed"))||!Objects.equals(task.get("flowFingerprint"),input.get("fingerprint")))throw new IllegalArgumentException("Görev değişti veya onay eksik; güncel kaydı yeniden inceleyin.");
    if("done".equals(task.get("status"))||String.valueOf(task.get("externalId")).startsWith("BAU-AUTO:"))throw new IllegalArgumentException("Done ve otomatik BAU işleri çıkarılamaz. Done tekrarını Backlog’dan, BAU planını Planlama’dan yönetin.");
    if(jdbc.queryForObject("SELECT COUNT(*) FROM defect_reserve_link WHERE reserve_task_id=?",Integer.class,id)>0)throw new IllegalArgumentException("Rezervi kaldırmadan önce bağlı defectlerin efor kaynağını değiştirin.");
    String reason=SprintFlowService.reason(input);
    String replacementId=text(input,"replacementTaskId");
    if(!replacementId.isBlank()){
      var replacement=tasks.stream().filter(t->replacementId.equals(t.get("id"))&&Boolean.TRUE.equals(t.get("emergency"))&&!id.equals(t.get("id"))).findFirst().orElseThrow(()->new IllegalArgumentException("Bağlantı aynı sprintteki acil bir iş olmalıdır."));
      task.put("replacementTaskId",replacementId);task.put("replacementTaskName",replacement.get("name"));
    }
    // Planned sprint edits are not scope changes. Active removals retain the full task/assignment record.
    if("active".equals(current.get("status"))){flow.begin(sprintId,tasks,false);flow.record(sprintId,"REMOVED",reason,task);}
    TaskActivity.record(jdbc,mapper,id,"removed-from-sprint",map("reason",reason,"replacementTaskId",replacementId));
    jdbc.update("DELETE FROM task_blocker WHERE task_id=?",id);
    jdbc.update("DELETE FROM assignment WHERE task_id=?",id);
    jdbc.update("DELETE FROM sprint_task WHERE id=?",id);
    jdbc.update("UPDATE backlog_item SET state='Ready' WHERE id=?",task.get("backlogId"));
    audit("task",id,"removed-from-sprint",map("sprintId",sprintId,"reason",reason,"task",task));
    return map("id",id,"backlogId",task.get("backlogId"));
  }
  @Transactional(isolation=org.springframework.transaction.annotation.Isolation.SERIALIZABLE)
  public Map<String,Object> completeSprint(String id,Map<String,Object> input) {
    if(jdbc.queryForList("SELECT id FROM sprint WHERE id=? FOR UPDATE",id).isEmpty())return null;
    var preview=closurePreview(id);
    if(!Boolean.TRUE.equals(input.get("confirmed"))||!preview.get("fingerprint").equals(input.get("fingerprint")))
      throw new IllegalArgumentException("Kapanış bilgileri değişti veya onay eksik. Önizlemeyi yenileyip tekrar onaylayın.");
    if(!(input.get("carryTaskIds") instanceof List<?> selected))throw new IllegalArgumentException("Taşınacak işler listesi gerekli.");
    var carry=new java.util.HashSet<String>();
    @SuppressWarnings("unchecked") var decisions=(List<Map<String,Object>>)preview.get("tasks");
    for(var value:selected){
      if(!(value instanceof String taskId)||!carry.add(taskId))throw new IllegalArgumentException("Geçersiz veya tekrarlanan taşıma seçimi.");
      var task=decisions.stream().filter(t->taskId.equals(t.get("id"))).findFirst().orElseThrow(()->new IllegalArgumentException("Seçilen görev bu sprintte değil."));
      if(Boolean.TRUE.equals(task.get("bau")))throw new IllegalArgumentException("BAU otomatik Done kapanır; taşıma seçimine dahil edilemez.");
    }
    @SuppressWarnings("unchecked") var source=(Map<String,Object>)preview.get("source");
    List<Map<String,Object>> tasks=jdbc.queryForList("SELECT * FROM sprint_task WHERE sprint_id=? ORDER BY id",id);
    var carried=new ArrayList<Map<String,Object>>();
    for(var task:tasks){
      String taskId=task.get("ID").toString(),backlogId=task.get("BACKLOG_ID").toString();
      boolean bau=BauPolicy.isBau(task),done=bau||"done".equals(task.get("STATUS"));
      if(bau)flow.resolveAutomaticBau(taskId);
      jdbc.update("UPDATE sprint_task SET status=?,remaining_hours=0,status_note=CASE WHEN status_note='' AND ?='undone' THEN 'Sprint kapanışında tamamlanmadı.' ELSE status_note END WHERE id=?",
          done?"done":"undone",done?"done":"undone",taskId);
      TaskActivity.record(jdbc,mapper,taskId,"sprint-closed",map("from",task.get("STATUS"),"to",done?"done":"undone","automaticBau",bau));
      jdbc.update("UPDATE backlog_item SET state=? WHERE id=?",done?"Done":"Undone",backlogId);
      if(carry.contains(taskId))carried.add(map("taskId",taskId,"backlogId",repeatBacklog(backlogId).get("id"),"reason",done?"repeat":"carryover"));
    }
    jdbc.update("UPDATE sprint SET status='completed' WHERE id=?",id);
    var authentication=org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
    var frozen=map("version",1,"closedAt",Instant.now().toString(),"closedBy",authentication==null?"system":authentication.getName(),
        "sprint",sprint(id),"capacity",source.get("capacity"),"settings",source.get("settings"),
        "before",source,"carried",carried,"fingerprint",preview.get("fingerprint"));
    closures.write(id,frozen);
    audit("sprint",id,"completed",map("taskCount",tasks.size(),"carryoverCount",carried.size(),"fingerprint",preview.get("fingerprint")));
    return map("id",id,"status","completed","taskCount",tasks.size(),"carryoverCount",carried.size(),"closedAt",frozen.get("closedAt"));
  }
  @SuppressWarnings("unchecked")
  private void saveDefectInput(String id,Map<String,Object> input,String category){
    if("DEFECT".equals(category)&&input.containsKey("defect")){
      if(!(input.get("defect") instanceof Map<?,?>))throw new IllegalArgumentException("Defect bilgileri geçersiz.");
      defects.save(id,(Map<String,Object>)input.get("defect"));
    }
  }
  public List<Map<String,Object>> defectReports(){
    return backlog().stream().filter(b->"DEFECT".equals(b.get("taskCategory"))).toList();
  }
  /** Sprint snapshots, not the current backlog state; no titles, reporters or notes. */
  @SuppressWarnings("unchecked")
  public List<Map<String,Object>> defectTrend(){
    var result=new ArrayList<Map<String,Object>>();
    for(var summary:sprints()){
      var groups=new LinkedHashMap<List<String>,Map<String,Object>>();
      for(var task:(List<Map<String,Object>>)sprint(summary.get("id").toString()).get("items")){
        if(!"DEFECT".equals(task.get("taskCategory")))continue;
        var detail=task.get("defect") instanceof Map<?,?> d?d:Map.of();
        String subtype=Objects.toString(task.get("taskSubtype"),""),severity=Objects.toString(detail.get("severity"),""),environment=Objects.toString(detail.get("environment"),""),status=Objects.toString(task.get("status"),"");
        var row=groups.computeIfAbsent(List.of(subtype,severity,environment,status),k->map("sprintId",summary.get("id"),"subtype",subtype,"severity",severity,"environment",environment,"status",status,"count",0));
        row.put("count",((Number)row.get("count")).intValue()+1);
      }
      result.addAll(groups.values());
    }
    return result;
  }
  private Map<String,String> taxonomy(Map<String,Object> input){return taxonomy(input,null,null);}
  private Map<String, String> taxonomy(Map<String, Object> input,Object oldCategory,Object oldSubtype) {
    String category = text(input, "taskCategory").toUpperCase(java.util.Locale.ROOT);
    String legacyKind = text(input, "workKind").toUpperCase(java.util.Locale.ROOT);
    boolean explicit = !category.isBlank();
    if (category.isBlank()) category = switch (legacyKind) {
      case "DEVELOPMENT" -> "DEV"; case "DESIGN" -> "DESIGN"; case "ANALYSIS" -> "ANALYZE";
      case "TEST" -> "TEST"; case "DEFECT" -> "DEFECT";
      case "SUPPORT", "MEETING", "TRAINING", "LEAVE" -> "BAU"; default -> "OTHER";
    };
    if (!List.of("DEV", "DESIGN", "ANALYZE", "TEST", "DEFECT", "BAU", "OTHER").contains(category))
      throw new IllegalArgumentException("İş tipi DEV, DESIGN, ANALYZE, TEST, DEFECT veya BAU olmalı.");
    String subtype = text(input, "taskSubtype").toUpperCase(java.util.Locale.ROOT);
    if (subtype.isBlank()) {
      subtype = switch (category) {
        case "TEST" -> explicit ? "" : "GENERAL_TEST";
        case "BAU" -> List.of("SUPPORT", "MEETING", "TRAINING", "LEAVE").contains(legacyKind) ? legacyKind : "OTHER_BAU";
        default -> "";
      };
    }
    subtypes.validate(category,subtype,category.equals(oldCategory)&&subtype.equals(oldSubtype));
    return Map.of("category", category, "subtype", subtype, "workKind", legacyWorkKind(category, subtype),
        "legacyType", "BAU".equals(category) ? "BAU" : "FEATURE");
  }
  private String legacyWorkKind(String category, String subtype) {
    return switch (category) {
      case "DEV" -> "DEVELOPMENT"; case "DESIGN" -> "DESIGN"; case "ANALYZE" -> "ANALYSIS";
      case "TEST" -> "TEST"; case "DEFECT" -> "DEFECT";
      case "BAU" -> List.of("SUPPORT","MEETING","TRAINING","LEAVE").contains(subtype) ? subtype : "BAU";
      default -> "OTHER";
    };
  }
  private static double number(Map<String, Object> input, String key) {
    Object value = input.get(key);
    if (value == null || String.valueOf(value).isBlank()) return 0;
    try { return Double.parseDouble(String.valueOf(value)); }
    catch (NumberFormatException error) { throw new IllegalArgumentException("Sayı geçersiz: " + key); }
  }
  private static Double nullableNumber(Map<String, Object> input, String key) {
    return input.get(key) == null || String.valueOf(input.get(key)).isBlank() ? null : number(input, key);
  }
  private static String nullableSize(Map<String, Object> input) {
    if (input.get("size") == null) return null;
    String value = String.valueOf(input.getOrDefault("size", "")).trim().toUpperCase(java.util.Locale.ROOT).replace("XLARGE", "X-LARGE");
    if (value.isBlank()) return null;
    if (!List.of("SMALL", "MEDIUM", "LARGE", "X-LARGE").contains(value))
      throw new IllegalArgumentException("Size Small, Medium, Large veya X-Large olmalı.");
    return value;
  }
}
