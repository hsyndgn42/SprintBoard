package com.sprintboard;

import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Work reaches an administrator through five independent queues spread over
 *  three pages, so the only way to notice an arrival was to open each queue in
 *  turn. This read-only summary reports every queue that is waiting on a
 *  decision. Slack rows counted as waiting include INVALID: a badly formatted
 *  message still needs an administrator to correct or reject it, and it is the
 *  same set each queue page shows under its own WAITING filter. */
@Service
public class ApprovalInboxService {
  /** The key and route are shared with the UI, which turns them into links. */
  private record Queue(String key, String label, String route, String sql) {}

  private static final List<Queue> QUEUES = List.of(
      new Queue("slack-defect", "Slack · defect bildirimi", "/backlog",
          "SELECT COUNT(*) FROM slack_inbox WHERE status IN ('PENDING','INVALID')"),
      new Queue("slack-backlog", "Slack · iş isteği", "/backlog",
          "SELECT COUNT(*) FROM slack_backlog_inbox WHERE status IN ('PENDING','INVALID')"),
      new Queue("slack-overtime", "Slack · mesai bildirimi", "/overtime",
          "SELECT COUNT(*) FROM slack_overtime_inbox WHERE status IN ('PENDING','INVALID')"),
      new Queue("leave-request", "İzin talebi", "/leaves",
          "SELECT COUNT(*) FROM leave_request WHERE status='PENDING'"),
      new Queue("overtime-request", "Mesai talebi", "/overtime",
          "SELECT COUNT(*) FROM overtime_request WHERE status='PENDING'"));

  private final JdbcTemplate db;

  public ApprovalInboxService(JdbcTemplate db) { this.db = db; }

  public Map<String, Object> summary() {
    var queues = new ArrayList<Map<String, Object>>();
    int total = 0;
    for (Queue queue : QUEUES) {
      int count = Optional.ofNullable(db.queryForObject(queue.sql(), Integer.class)).orElse(0);
      total += count;
      var row = new LinkedHashMap<String, Object>();
      row.put("key", queue.key());
      row.put("label", queue.label());
      row.put("route", queue.route());
      row.put("count", count);
      queues.add(row);
    }
    var summary = new LinkedHashMap<String, Object>();
    summary.put("total", total);
    summary.put("queues", queues);
    summary.put("checkedAt", Instant.now().toString());
    return summary;
  }
}
