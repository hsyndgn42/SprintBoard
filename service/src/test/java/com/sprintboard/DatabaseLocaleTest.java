package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Locale;
import java.util.UUID;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import javax.sql.DataSource;

@ResourceLock("java.util.Locale.default")
class DatabaseLocaleTest {
  @ParameterizedTest
  @ValueSource(strings = {"tr-TR", "en-US"})
  void sqlIdentifiersIgnoreHostLanguageWithoutChangingTextOrExportKeys(String language) {
    Locale previous = Locale.getDefault();
    try {
      Locale.setDefault(Locale.forLanguageTag(language));
      try (var context = new AnnotationConfigApplicationContext()) {
        context.registerBean(DataSource.class, () -> new DriverManagerDataSource(
            "jdbc:h2:mem:locale-" + UUID.randomUUID(), "sa", ""));
        context.register(DatabaseConfiguration.class);
        context.refresh();
        var db = context.getBean(JdbcTemplate.class);
        String title = "İsa · Işık · şifre değişikliği";
        var row = db.queryForMap("SELECT 42 AS ID, ? AS TITLE, 'TC-123' AS REFERENCE_ID, 9001 AS JIRA_ISSUE_ID", title);
        assertEquals(42, ((Number) row.get("id")).intValue());
        assertEquals("TC-123", row.get("reference_id"));
        assertEquals(9001, ((Number) row.get("jira_issue_id")).intValue());
        assertEquals(title, row.get("title"));
        assertEquals(title, row.get("TITLE"));
        assertEquals(java.util.List.of("ID", "TITLE", "REFERENCE_ID", "JIRA_ISSUE_ID"),
            new java.util.ArrayList<>(row.keySet()), "Original column labels used by exports must survive");
        assertEquals("saved", db.queryForList("SELECT 'saved' AS ACTION").getFirst().get("action"));
        assertEquals(Locale.forLanguageTag(language), Locale.getDefault(), "Database access must not change the application's locale");
      }
    } finally {
      Locale.setDefault(previous);
    }
  }
}
