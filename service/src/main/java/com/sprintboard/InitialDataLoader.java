package com.sprintboard;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Production startup never imports historical or demonstration data. */
@Component
public class InitialDataLoader implements ApplicationRunner {
  private final JdbcTemplate jdbc;
  private final WorkspaceService workspace;

  public InitialDataLoader(JdbcTemplate jdbc, WorkspaceService workspace) {
    this.jdbc = jdbc;
    this.workspace = workspace;
  }

  @Override
  @Transactional
  public void run(ApplicationArguments args) {
    if (jdbc.queryForObject("SELECT COUNT(*) FROM product_setting WHERE setting_key='restore_completed' AND setting_value='true'", Integer.class) > 0) return;
    if (jdbc.queryForObject("SELECT COUNT(*) FROM sprint", Integer.class) > 0) {
      workspace.backfillHistoricalBau();
      return;
    }
    if (jdbc.queryForObject("SELECT COUNT(*) FROM product_setting WHERE setting_key='workspace_initialized'", Integer.class) > 0) return;
    // Only reset the migration's old default channel for a genuinely unused installation.
    if (jdbc.queryForObject("SELECT (SELECT COUNT(*) FROM app_user) + (SELECT COUNT(*) FROM member) + (SELECT COUNT(*) FROM slack_config)", Integer.class) == 0) {
      jdbc.update("UPDATE slack_digest_config SET channel_id='' WHERE id=1 AND enabled=FALSE AND version=1");
    }
    jdbc.update("INSERT INTO product_setting(setting_key,setting_value) VALUES ('workspace_initialized','true')");
  }
}
