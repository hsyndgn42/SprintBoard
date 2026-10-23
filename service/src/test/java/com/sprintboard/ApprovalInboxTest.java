package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:approvals;DB_CLOSE_DELAY=-1",
    "sprintboard.slack.worker-enabled=false", "sprintboard.slack.resolve-names=false",
    "sprintboard.auto-backup.enabled=false"})
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "admin", roles = "ADMIN")
class ApprovalInboxTest {
  @Autowired ApprovalInboxService service;
  @Autowired JdbcTemplate db;
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper mapper;
  @Autowired WorkspaceService workspace;

  @SuppressWarnings("unchecked")
  private Map<String, Integer> counts() {
    var queues = (List<Map<String, Object>>) service.summary().get("queues");
    var byKey = new LinkedHashMap<String, Integer>();
    for (var queue : queues) byKey.put(queue.get("key").toString(), ((Number) queue.get("count")).intValue());
    return byKey;
  }

  private int total() { return ((Number) service.summary().get("total")).intValue(); }

  private void slackRow(String table, String prefix, String status) {
    String id = prefix + "-" + UUID.randomUUID();
    String ts = String.valueOf(System.nanoTime()); // Slack timestamps are short; the column only holds 40 chars.
    db.update("INSERT INTO " + table + "(id,source_key,team_id,channel_id,message_ts,user_id,source_url,raw_text,parsed_json,config_version,received_at,status)"
        + " VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", id, prefix + "-" + ts, "T1", "C1", ts, "U1", "https://example.invalid", "metin", "{}", 1,
        Instant.now().toString(), status);
  }

  private String member() {
    String id = workspace.createMember(Map.of("name", "Onay Testi", "title", "QA")).get("id").toString();
    return id;
  }

  private String sprint() {
    return workspace.createSprint(Map.of("name", "Onay Sprint", "start", LocalDate.now().minusDays(3).toString(),
        "end", LocalDate.now().plusDays(3).toString())).get("id").toString();
  }

  @Test
  void emptyInstallationReportsEveryQueueAsZero() {
    assertEquals(0, total(), "nothing waiting must read as zero, not as missing data");
    assertEquals(List.of("slack-defect", "slack-backlog", "slack-overtime", "leave-request", "overtime-request"),
        List.copyOf(counts().keySet()), "every queue is reported even when empty so the panel can stay stable");
    assertTrue(counts().values().stream().allMatch(count -> count == 0));
  }

  @Test
  void waitingSlackRowsIncludeInvalidButNotDecidedOnes() {
    slackRow("slack_inbox", "slack-", "PENDING");
    slackRow("slack_inbox", "slack-", "INVALID");
    slackRow("slack_inbox", "slack-", "APPROVED");
    slackRow("slack_inbox", "slack-", "REJECTED");
    slackRow("slack_backlog_inbox", "slack-backlog-", "PENDING");
    slackRow("slack_overtime_inbox", "slack-ot-", "INVALID");

    var counts = counts();
    assertEquals(2, counts.get("slack-defect"), "a malformed message still needs a decision");
    assertEquals(1, counts.get("slack-backlog"));
    assertEquals(1, counts.get("slack-overtime"));
    assertEquals(4, total(), "total is the sum of what is still waiting");
  }

  @Test
  void teamRequestsCountOnlyWhilePending() {
    String member = member(), sprint = sprint();
    db.update("INSERT INTO leave_request(id,member_id,sprint_id,requester,start_on,end_on,days,leave_type,reason,status,created_at)"
        + " VALUES(?,?,?,?,?,?,?,?,?,?,?)", "leave-pending", member, sprint, "uye", java.sql.Date.valueOf(LocalDate.now()),
        java.sql.Date.valueOf(LocalDate.now()), 1.0, "ANNUAL", "QA", "PENDING", Instant.now().toString());
    db.update("INSERT INTO leave_request(id,member_id,sprint_id,requester,start_on,end_on,days,leave_type,reason,status,created_at)"
        + " VALUES(?,?,?,?,?,?,?,?,?,?,?)", "leave-approved", member, sprint, "uye", java.sql.Date.valueOf(LocalDate.now()),
        java.sql.Date.valueOf(LocalDate.now()), 1.0, "ANNUAL", "QA", "APPROVED", Instant.now().toString());
    db.update("INSERT INTO overtime_request(id,member_id,sprint_id,requester,work_date,hours,reason,status,created_at)"
        + " VALUES(?,?,?,?,?,?,?,?,?)", "ot-pending", member, sprint, "uye", java.sql.Date.valueOf(LocalDate.now()), 2.0, "QA",
        "PENDING", Instant.now().toString());
    db.update("INSERT INTO overtime_request(id,member_id,sprint_id,requester,work_date,hours,reason,status,created_at)"
        + " VALUES(?,?,?,?,?,?,?,?,?)", "ot-rejected", member, sprint, "uye", java.sql.Date.valueOf(LocalDate.now()), 2.0, "QA",
        "REJECTED", Instant.now().toString());

    var counts = counts();
    assertEquals(1, counts.get("leave-request"), "a decided request is no longer waiting");
    assertEquals(1, counts.get("overtime-request"));
    assertEquals(2, total());
  }

  @Test
  void queuesCarryTheRouteThatOwnsThem() {
    @SuppressWarnings("unchecked")
    var queues = (List<Map<String, Object>>) service.summary().get("queues");
    var routes = new LinkedHashMap<String, String>();
    for (var queue : queues) routes.put(queue.get("key").toString(), queue.get("route").toString());
    assertEquals("/backlog", routes.get("slack-defect"));
    assertEquals("/backlog", routes.get("slack-backlog"));
    assertEquals("/overtime", routes.get("slack-overtime"));
    assertEquals("/leaves", routes.get("leave-request"));
    assertEquals("/overtime", routes.get("overtime-request"));
  }

  @Test
  void endpointAnswersAdminsWithoutCachingAndRefusesOthers() throws Exception {
    slackRow("slack_inbox", "slack-", "PENDING");
    mvc.perform(get("/api/admin/approvals"))
        .andExpect(status().isOk())
        .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
        .andExpect(jsonPath("$.total").value(1))
        .andExpect(jsonPath("$.queues[0].key").value("slack-defect"));
  }

  @Test
  @WithMockUser(username = "uye", roles = "USER")
  void nonAdminsCannotReadApprovalCounts() throws Exception {
    mvc.perform(get("/api/admin/approvals")).andExpect(status().isForbidden());
  }
}
