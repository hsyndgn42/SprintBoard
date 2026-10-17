package com.sprintboard;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@org.springframework.context.annotation.Profile("historical-tests")
@org.springframework.core.annotation.Order(-1)
public class HistoricalTestDataLoader implements ApplicationRunner {
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;
  private final WorkspaceService workspace;

  public HistoricalTestDataLoader(JdbcTemplate jdbc, ObjectMapper mapper, WorkspaceService workspace) {
    this.jdbc = jdbc;
    this.mapper = mapper;
    this.workspace = workspace;
  }

  @Override
  @Transactional
  public void run(ApplicationArguments args) throws Exception {
    if (jdbc.queryForObject("SELECT COUNT(*) FROM product_setting WHERE setting_key='restore_completed' AND setting_value='true'", Integer.class) > 0) return;
    if (jdbc.queryForObject("SELECT COUNT(*) FROM sprint", Integer.class) > 0) {
      workspace.backfillHistoricalBau();
      return;
    }
    ClassPathResource resource = new ClassPathResource("seed/sprintboard.json");
    if (!resource.exists()) throw new IllegalStateException("İlk kurulum verisi eksik: seed/sprintboard.json");
    JsonNode root;
    try (InputStream in = resource.getInputStream()) { root = mapper.readTree(in); }
    if (root.path("sprints").size() < 14 || root.path("backlog").size() < 306) {
      throw new IllegalStateException("Sprint 1–14 başlangıç verisi eksik.");
    }

    Map<String, String> memberByName = new HashMap<>();
    Map<Integer, String> sprintByNumber = new HashMap<>();
    for (JsonNode member : root.path("members")) {
      String id = text(member, "id", "");
      memberByName.put(text(member, "name", ""), id);
      jdbc.update("INSERT INTO member VALUES (?,?,?,?,?,?,?,?,?)", id, text(member, "name", ""), text(member, "title", ""),
          text(member, "role", "Member"), text(member, "teamRole", "OTHER"), text(member, "engagement", "CORE"),
          member.path("active").asInt(1) != 0, date(member, "joinedOn"), date(member, "leftOn"));
    }
    jdbc.update("INSERT INTO member_participation SELECT 'participation-' || id,id,joined_on,left_on,CASE WHEN active=false OR left_on IS NOT NULL THEN true ELSE false END FROM member");
    for (JsonNode day : root.path("calendar")) {
      jdbc.update("INSERT INTO non_working_day(id,day_date,title,member_id) VALUES (?,?,?,?)",
          text(day,"id",""), date(day,"date"), text(day,"title",""), nullable(day,"memberId"));
    }
    for (JsonNode roadmap : root.path("roadmap")) {
      jdbc.update("INSERT INTO roadmap_item(id,title,description,status,target_date,created_at) VALUES (?,?,?,?,?,?)", text(roadmap, "id", ""), text(roadmap, "title", ""),
          text(roadmap, "description", ""), text(roadmap, "status", "planned"), date(roadmap, "targetDate"), Timestamp.from(Instant.now()));
    }
    for (JsonNode sprint : root.path("sprints")) {
      sprintByNumber.put(sprint.path("number").asInt(), text(sprint, "id", ""));
      jdbc.update("INSERT INTO sprint VALUES (?,?,?,?,?,?,?,?)", text(sprint, "id", ""), sprint.path("number").asInt(),
          text(sprint, "name", ""), text(sprint, "goal", ""), date(sprint, "start"), date(sprint, "end"),
          text(sprint, "status", "completed"), sprint.path("storyPointsAvailable").asBoolean(false));
    }
    for (JsonNode item : root.path("backlog")) {
      jdbc.update("INSERT INTO backlog_item(id,roadmap_id,title,criteria,work_kind,type,state,estimated_hours,story_points,external_id,repeat_of_id,created_at,size_code,task_category,task_subtype) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", text(item, "id", ""), nullable(item, "roadmapId"),
          text(item, "title", ""), text(item, "criteria", ""), text(item, "workKind", ""), text(item, "type", "FEATURE"),
          text(item, "state", "Ready"), number(item, "estimatedHours"), nullableNumber(item, "storyPoints"),
          text(item, "externalId", ""), nullable(item, "repeatOfId"), Timestamp.from(Instant.now()), nullable(item, "size"), taskCategory(item), taskSubtype(item));
    }
    for (JsonNode sprint : root.path("sprints")) {
      for (JsonNode task : sprint.path("items")) {
        jdbc.update("INSERT INTO sprint_task(id,sprint_id,backlog_id,title,criteria,type,work_kind,status,estimated_hours,remaining_hours,story_points,external_id,size_code,task_category,task_subtype) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", text(task, "id", ""), text(sprint, "id", ""),
            text(task, "backlogId", ""), text(task, "name", ""), text(task, "criteria", ""), text(task, "type", "FEATURE"),
            text(task, "workKind", ""), text(task, "status", "todo"), number(task, "estimatedHours"), number(task, "remainingHours"),
            nullableNumber(task, "storyPoints"), text(task, "externalId", ""), nullable(task, "size"), taskCategory(task), taskSubtype(task));
        for (JsonNode assignment : task.path("assignments")) {
          String id = text(task, "id", "") + "-" + text(assignment, "memberId", "");
          jdbc.update("INSERT INTO assignment(id,task_id,member_id,estimated_hours) VALUES (?,?,?,?)",
              id, text(task, "id", ""), nullable(assignment, "memberId"), number(assignment, "estimatedHours"));
        }
      }
    }
    for (JsonNode leave : root.path("leaves")) {
      String memberId = memberByName.get(text(leave, "memberName", ""));
      if (memberId == null) continue;
      jdbc.update("INSERT INTO leave_record(id,member_id,sprint_id,days,precision_label,status,leave_type) VALUES (?,?,?,?,?,?,?)", text(leave, "id", ""), memberId,
          nullable(leave, "sprintId"), number(leave, "days"), text(leave, "precision", "sprint"), text(leave, "status", "used"), text(leave,"leaveType","UNSPECIFIED"));
    }
    for (JsonNode overtime : root.path("overtime")) {
      String memberId = memberByName.get(text(overtime, "memberName", ""));
      String sprintId = sprintByNumber.get(overtime.path("sprintNumber").asInt());
      if (memberId == null || sprintId == null) continue;
      jdbc.update("INSERT INTO overtime_snapshot VALUES (?,?,?,?,?,?)", text(overtime, "id", ""), memberId, sprintId,
          number(overtime, "earnedHours"), number(overtime, "usedCumulativeHours"), number(overtime, "balanceHours"));
    }
    jdbc.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES (?,?,?,?,?)",
        Timestamp.from(Instant.now()), "workspace", "default", "initial-seed", "{\"source\":\"Sprint 1–14\"}");
    workspace.backfillHistoricalBau();
  }

  private static String text(JsonNode node, String key, String fallback) {
    JsonNode value = node.path(key);
    return value.isMissingNode() || value.isNull() ? fallback : value.asText(fallback);
  }
  private static String nullable(JsonNode node, String key) {
    String value = text(node, key, "");
    return value.isBlank() ? null : value;
  }
  private static Double number(JsonNode node, String key) { return node.path(key).asDouble(0); }
  private static Double nullableNumber(JsonNode node, String key) {
    JsonNode value = node.path(key);
    return value.isMissingNode() || value.isNull() ? null : value.asDouble();
  }
  private static Date date(JsonNode node, String key) {
    String value = text(node, key, "");
    return value.isBlank() ? null : Date.valueOf(LocalDate.parse(value));
  }
  private static String taskCategory(JsonNode node) {
    String explicit = text(node, "taskCategory", "").toUpperCase(java.util.Locale.ROOT);
    if (!explicit.isBlank()) return explicit;
    String kind = text(node, "workKind", "").toUpperCase(java.util.Locale.ROOT);
    if ("BAU".equalsIgnoreCase(text(node, "type", "")) || java.util.List.of("SUPPORT", "MEETING", "TRAINING", "LEAVE").contains(kind)) return "BAU";
    return switch (kind) { case "DEVELOPMENT" -> "DEV"; case "DESIGN" -> "DESIGN"; case "ANALYSIS" -> "ANALYZE"; case "TEST" -> "TEST"; default -> "OTHER"; };
  }
  private static String taskSubtype(JsonNode node) {
    String explicit = text(node, "taskSubtype", "").toUpperCase(java.util.Locale.ROOT);
    if (!explicit.isBlank()) return explicit;
    String category = taskCategory(node);
    String kind = text(node, "workKind", "").toUpperCase(java.util.Locale.ROOT);
    if ("BAU".equals(category)) return switch (kind) { case "SUPPORT", "MEETING", "TRAINING", "LEAVE" -> kind; default -> "OTHER_BAU"; };
    if (!"TEST".equals(category)) return null;
    String title = (text(node, "title", "") + " " + text(node, "name", "")).toUpperCase(java.util.Locale.ROOT);
    if (title.contains("E2E")) return "E2E_TEST";
    if (title.contains("REGRESSION") || title.contains("REGRESYON")) return "REGRESSION_TEST";
    if (title.contains("PERFORMANCE")) return "PERFORMANCE_TEST";
    if (title.contains("FUNCTIONAL") || title.contains("FONKSIYON")) return "FUNCTIONAL_TEST";
    return "GENERAL_TEST";
  }
}
