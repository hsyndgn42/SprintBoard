package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.Map;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:accountmanagement;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class AccountManagementTest {
  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired ObjectMapper mapper;
  @Autowired AccountService accounts;
  MockHttpSession admin;
  static final String PASSWORD = "test-only-password-123";
  static final String NEW_PASSWORD = "test-only-replacement-456";

  @BeforeEach void setup() throws Exception {
    jdbc.update("DELETE FROM login_throttle");
    jdbc.update("DELETE FROM audit_event WHERE entity_type='account'");
    jdbc.update("DELETE FROM app_user");
    mvc.perform(post("/api/auth/setup").with(csrf()).contentType(MediaType.APPLICATION_JSON)
        .content(mapper.writeValueAsString(Map.of("username","admin", "password",PASSWORD))))
        .andExpect(status().isCreated());
    admin = login("admin", PASSWORD);
    mvc.perform(post("/api/admin/users").session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON)
        .content(mapper.writeValueAsString(Map.of("username","viewer", "password",PASSWORD))))
        .andExpect(status().isCreated());
  }
  MockHttpSession login(String name, String password) throws Exception {
    return (MockHttpSession) mvc.perform(formLogin().user(name).password(password))
        .andExpect(redirectedUrl("/#/overview")).andReturn().getRequest().getSession(false);
  }
  void active(boolean value) throws Exception {
    mvc.perform(put("/api/admin/users/viewer/status").session(admin).with(csrf())
        .contentType(MediaType.APPLICATION_JSON).content("{\"active\":"+value+"}"))
        .andExpect(status().isNoContent());
  }
  void reset(String value) throws Exception {
    mvc.perform(post("/api/admin/users/viewer/password").session(admin).with(csrf())
        .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("password", value))))
        .andExpect(status().isNoContent()).andExpect(content().string(""));
  }

  org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder change(MockHttpSession session, String current, String next, String repeat) throws Exception {
    return post("/api/auth/password").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
        .content(mapper.writeValueAsString(Map.of("currentPassword",current,"password",next,"confirmation",repeat,"username","admin")));
  }

  @Test void viewerCanChangeOnlyOwnPasswordAndAllOwnSessionsAreRevoked() throws Exception {
    var first=login("viewer",PASSWORD); var second=login("viewer",PASSWORD);
    var oldPrincipal=(AccountPrincipal)accounts.loadUserByUsername("viewer");
    mvc.perform(change(first,PASSWORD,NEW_PASSWORD,NEW_PASSWORD)).andExpect(status().isNoContent());
    assertTrue(first.isInvalid());
    mvc.perform(get("/api/overview").session(second)).andExpect(status().isUnauthorized());
    mvc.perform(formLogin().user("viewer").password(PASSWORD)).andExpect(redirectedUrl("/#/login?error=1"));
    assertNotNull(login("viewer",NEW_PASSWORD)); assertNotNull(login("admin",PASSWORD));
    assertThrows(IllegalStateException.class,()->accounts.changeOwnPassword(oldPrincipal,Map.of("currentPassword",NEW_PASSWORD,"password",PASSWORD,"confirmation",PASSWORD)));
    assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM audit_event WHERE action='PASSWORD_CHANGED' AND entity_id='viewer'",Integer.class));
    assertEquals("USER",jdbc.queryForObject("SELECT role FROM app_user WHERE username='viewer'",String.class));
  }

  @Test void adminCanChangeOwnPasswordAndValidationDoesNotAlterData() throws Exception {
    String before=mapper.readTree(mvc.perform(get("/api/export").session(admin)).andReturn().getResponse().getContentAsString()).path("tables").toString();
    mvc.perform(change(admin,"wrong",NEW_PASSWORD,NEW_PASSWORD)).andExpect(status().isBadRequest());
    mvc.perform(change(admin,PASSWORD,PASSWORD,PASSWORD)).andExpect(status().isBadRequest());
    mvc.perform(change(admin,PASSWORD,NEW_PASSWORD,"different")).andExpect(status().isBadRequest());
    mvc.perform(change(admin,PASSWORD,"ü".repeat(37),"ü".repeat(37))).andExpect(status().isBadRequest());
    assertEquals(0L,jdbc.queryForObject("SELECT session_version FROM app_user WHERE username='admin'",Long.class));
    mvc.perform(change(admin,PASSWORD,NEW_PASSWORD,NEW_PASSWORD)).andExpect(status().isNoContent());
    admin=login("admin",NEW_PASSWORD);
    assertEquals(before,mapper.readTree(mvc.perform(get("/api/export").session(admin)).andReturn().getResponse().getContentAsString()).path("tables").toString());
    String audit=jdbc.queryForList("SELECT detail_json FROM audit_event",String.class).toString();
    assertFalse(audit.contains(PASSWORD)); assertFalse(audit.contains(NEW_PASSWORD)); assertFalse(audit.contains("$2a$"));
  }

  @Test void ownPasswordRequiresAuthenticationAndCsrf() throws Exception {
    mvc.perform(post("/api/auth/password").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}"))
        .andExpect(status().isUnauthorized());
    mvc.perform(post("/api/auth/password").session(admin).contentType(MediaType.APPLICATION_JSON).content("{}"))
        .andExpect(status().isForbidden());
    assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM login_throttle WHERE bucket_key LIKE 'P:%'",Integer.class));
  }

  @Test void passwordChangeBudgetIsDurableIndependentOfLoginAndCannotBeResetByRelogin() throws Exception {
    var viewer=login("viewer",PASSWORD);
    for(int i=0;i<5;i++) mvc.perform(change(viewer,"wrong",NEW_PASSWORD,NEW_PASSWORD)).andExpect(status().isBadRequest());
    viewer=login("viewer",PASSWORD);
    mvc.perform(change(viewer,PASSWORD,NEW_PASSWORD,NEW_PASSWORD)).andExpect(status().isTooManyRequests()).andExpect(header().exists("Retry-After"));
    assertEquals(0L,jdbc.queryForObject("SELECT session_version FROM app_user WHERE username='viewer'",Long.class));
    jdbc.update("UPDATE login_throttle SET expires_at=0 WHERE bucket_key LIKE 'P:%'");
    mvc.perform(change(viewer,PASSWORD,NEW_PASSWORD,NEW_PASSWORD)).andExpect(status().isNoContent());
  }

  @Test void disabledAccountLosesAllSessionsAndReenablingCannotReviveThem() throws Exception {
    var first = login("viewer", PASSWORD);
    var second = login("viewer", PASSWORD);
    active(false);
    mvc.perform(get("/api/overview").session(first)).andExpect(status().isUnauthorized());
    assertTrue(first.isInvalid());
    mvc.perform(formLogin().user("viewer").password(PASSWORD)).andExpect(redirectedUrl("/#/login?error=1"));
    active(true);
    mvc.perform(get("/api/overview").session(second)).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/overview").session(login("viewer", PASSWORD))).andExpect(status().isOk());
  }

  @Test void passwordResetRevokesEverySessionAndOldPasswordWithoutEnablingDisabledAccounts() throws Exception {
    var first = login("viewer", PASSWORD);
    var second = login("viewer", PASSWORD);
    reset(NEW_PASSWORD);
    mvc.perform(get("/api/auth/session").session(first)).andExpect(status().isOk())
        .andExpect(jsonPath("$.authenticated").value(false));
    mvc.perform(get("/api/reports").session(second)).andExpect(status().isUnauthorized());
    mvc.perform(formLogin().user("viewer").password(PASSWORD)).andExpect(redirectedUrl("/#/login?error=1"));
    assertNotNull(login("viewer", NEW_PASSWORD));
    active(false); reset(PASSWORD);
    mvc.perform(formLogin().user("viewer").password(PASSWORD)).andExpect(redirectedUrl("/#/login?error=1"));
    assertFalse(jdbc.queryForObject("SELECT active FROM app_user WHERE username='viewer'", Boolean.class));
  }

  @Test void adminAndCsrfAreRequiredForEveryAccountOperation() throws Exception {
    var viewer = login("viewer", PASSWORD);
    for (String endpoint : new String[]{"/api/admin/users", "/api/admin/account-events"}) {
      mvc.perform(get(endpoint)).andExpect(status().isUnauthorized());
      mvc.perform(get(endpoint).session(viewer)).andExpect(status().isForbidden());
    }
    mvc.perform(put("/api/admin/users/viewer/status").session(viewer).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"active\":false}"))
        .andExpect(status().isForbidden());
    mvc.perform(post("/api/admin/users/viewer/password").session(viewer).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"password\":\""+NEW_PASSWORD+"\"}"))
        .andExpect(status().isForbidden());
    mvc.perform(put("/api/admin/users/viewer/status").session(admin).contentType(MediaType.APPLICATION_JSON).content("{\"active\":false}"))
        .andExpect(status().isForbidden());
    mvc.perform(post("/api/admin/users/viewer/password").session(admin).contentType(MediaType.APPLICATION_JSON).content("{\"password\":\""+NEW_PASSWORD+"\"}"))
        .andExpect(status().isForbidden());
    assertEquals(0L, jdbc.queryForObject("SELECT session_version FROM app_user WHERE username='viewer'", Long.class));
  }

  @Test void administratorIsProtectedAndInvalidRequestsDoNotChangeAccountsOrAudit() throws Exception {
    for (String name : new String[]{"admin", "missing"}) {
      mvc.perform(put("/api/admin/users/"+name+"/status").session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"active\":false}"))
          .andExpect(status().isBadRequest());
      mvc.perform(post("/api/admin/users/"+name+"/password").session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"password\":\""+NEW_PASSWORD+"\"}"))
          .andExpect(status().isBadRequest());
    }
    mvc.perform(put("/api/admin/users/viewer/status").session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}"))
        .andExpect(status().isBadRequest());
    for (String bad : new String[]{"short", "a".repeat(73), "ü".repeat(37)}) {
      mvc.perform(post("/api/admin/users/viewer/password").session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON)
          .content(mapper.writeValueAsString(Map.of("password",bad)))).andExpect(status().isBadRequest());
    }
    mvc.perform(post("/api/admin/users/viewer/password").session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"password\":null}"))
        .andExpect(status().isBadRequest());
    assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM audit_event WHERE entity_type='account'", Integer.class));
    assertNotNull(login("admin", PASSWORD)); assertNotNull(login("viewer", PASSWORD));
  }

  @Test void auditRecordsActorWithoutSecretsAndProductDataIsUnchanged() throws Exception {
    mvc.perform(get("/api/health")).andExpect(status().isOk())
        .andExpect(jsonPath("$.schemaVersion").value(43)).andExpect(jsonPath("$.backupSchemaVersion").value(40));
    String before = mapper.readTree(mvc.perform(get("/api/export").session(admin)).andReturn().getResponse().getContentAsString()).path("tables").toString();
    active(false); active(false); reset(NEW_PASSWORD); active(true);
    String history = mvc.perform(get("/api/admin/account-events").session(admin)).andExpect(status().isOk())
        .andExpect(jsonPath("$[0].actor").value("admin"))
        .andExpect(jsonPath("$[0].action").value("USER_ENABLED"))
        .andReturn().getResponse().getContentAsString();
    assertEquals(5, mapper.readTree(history).size()); // Repeated disable is a no-op.
    String users = mvc.perform(get("/api/admin/users").session(admin)).andReturn().getResponse().getContentAsString();
    String rawEvents = jdbc.queryForList("SELECT detail_json FROM audit_event WHERE entity_type='account'",String.class).toString();
    for (String output : new String[]{history, users, rawEvents}) {
      assertFalse(output.contains(PASSWORD)); assertFalse(output.contains(NEW_PASSWORD)); assertFalse(output.contains("$2a$"));
    }
    var exported = mapper.readTree(mvc.perform(get("/api/export").session(admin)).andReturn().getResponse().getContentAsString());
    assertEquals(40, exported.path("schemaVersion").asInt());
    assertEquals(before, exported.path("tables").toString());
    assertFalse(exported.path("tables").has("app_user"));
    assertFalse(exported.path("tables").has("audit_event"));
  }
}
