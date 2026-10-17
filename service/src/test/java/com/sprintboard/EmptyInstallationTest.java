package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:emptyinstallation;DB_CLOSE_DELAY=-1",
    "sprintboard.auto-backup.enabled=false","sprintboard.slack.digest.scheduler-enabled=false"})
@AutoConfigureMockMvc
@Transactional
class EmptyInstallationTest {
  @Autowired JdbcTemplate db;
  @Autowired InitialDataLoader loader;
  @Autowired AccountService accounts;
  @Autowired SlackPreviewService slack;
  @Autowired MockMvc mvc;
  @Autowired WorkspaceService workspace;

  @Test void startsEmptyWithoutPrivateSeedAndStaysEmptyAfterRestart() throws Exception {
    for(String table : new String[]{"member","member_photo","sprint","backlog_item","roadmap_item","leave_record","overtime_entry","app_user"}) {
      assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM "+table,Integer.class),table);
    }
    loader.run(new DefaultApplicationArguments());
    loader.run(new DefaultApplicationArguments());
    assertEquals(0,workspace.sprints().size());
    assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM product_setting WHERE setting_key='workspace_initialized'",Integer.class));
    assertEquals("",slack.status().get("teamId"));
    assertEquals("",slack.status().get("channelId"));
    assertEquals("STOPPED",slack.status().get("state"));
    assertEquals("",db.queryForObject("SELECT channel_id FROM slack_digest_config WHERE id=1",String.class));
    mvc.perform(get("/api/auth/session")).andExpect(status().isOk()).andExpect(jsonPath("$.setupRequired").value(true));
    mvc.perform(get("/api/team")).andExpect(status().isUnauthorized());
  }

  @Test void firstAdminIsCreatedOnceAndMembersSurviveRepeatedStartup() throws Exception {
    mvc.perform(post("/api/auth/setup").with(csrf()).contentType("application/json")
      .content("{\"username\":\"installation.admin\",\"password\":\"Installation-Test-942!\"}")).andExpect(status().isCreated());
    assertFalse(accounts.setupRequired());
    assertThrows(IllegalStateException.class,()->accounts.setupAdmin(Map.of("username","another.admin","password","Installation-Test-942!")));
    var member=workspace.createMember(Map.of("name","Installation member"));
    loader.run(new DefaultApplicationArguments());
    assertEquals(1,workspace.team().size());
    assertEquals(member.get("id"),workspace.team().getFirst().get("id"));
    assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM app_user",Integer.class));
    assertEquals(0,workspace.sprints().size());
  }

  @Test void existingEmptyWorkspaceSettingsAreNotReset() {
    db.update("DELETE FROM product_setting WHERE setting_key='workspace_initialized'");
    workspace.createMember(Map.of("name","Existing member"));
    db.update("UPDATE slack_digest_config SET channel_id='CEXISTING',version=2 WHERE id=1");
    loader.run(new DefaultApplicationArguments());
    assertEquals("CEXISTING",db.queryForObject("SELECT channel_id FROM slack_digest_config WHERE id=1",String.class));
  }
}
