package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;

@SpringBootTest(properties="spring.datasource.url=jdbc:h2:mem:loginsecurity;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class LoginSecurityTest {
  static class MutableClock extends Clock {
    Instant now=Instant.parse("2026-09-20T10:00:00Z");
    public ZoneId getZone(){return ZoneOffset.UTC;}
    public Clock withZone(ZoneId zone){return this;}
    public Instant instant(){return now;}
  }
  @TestConfiguration static class Config { @Bean @Primary MutableClock testClock(){return new MutableClock();} }
  @Autowired MockMvc mvc; @Autowired JdbcTemplate jdbc; @Autowired AccountService accounts;
  @Autowired LoginSecurityService security; @Autowired MutableClock clock;
  @Autowired ObjectMapper mapper; @Autowired PlatformTransactionManager manager;
  final String password="qa-valid-password-123";

  @BeforeEach void setup(){
    jdbc.update("DELETE FROM login_throttle");jdbc.update("DELETE FROM audit_event WHERE entity_type='authentication'");jdbc.update("DELETE FROM app_user");
    clock.now=Instant.parse("2026-09-20T10:00:00Z");
    accounts.setupAdmin(Map.of("username","admin","password",password));
    accounts.createUser(Map.of("username","viewer","password",password));
  }
  void failure(String name) throws Exception {
    mvc.perform(formLogin().user(name).password("qa-wrong-password"))
        .andExpect(redirectedUrl("/#/login?error=1"));
  }
  @Test void fiveFailuresBlockCorrectPasswordAndExpireWithoutChangingTheAccount() throws Exception {
    for(int i=0;i<5;i++)failure(i%2==0?" VIEWER ":"viewer");
    mvc.perform(formLogin().user("viewer").password(password)).andExpect(status().isTooManyRequests())
        .andExpect(header().string("Retry-After","900")).andExpect(content().string(org.hamcrest.Matchers.containsString("Girişe kısa bir ara")));
    clock.now=clock.now.plusSeconds(899);
    mvc.perform(formLogin().user("viewer").password(password)).andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After","1"));
    clock.now=clock.now.plusSeconds(1);
    mvc.perform(formLogin().user("viewer").password(password)).andExpect(redirectedUrl("/#/overview"));
    assertTrue(jdbc.queryForObject("SELECT active FROM app_user WHERE username='viewer'",Boolean.class));
    assertEquals(0L,jdbc.queryForObject("SELECT session_version FROM app_user WHERE username='viewer'",Long.class));
  }
  @Test void nonexistentDisabledAndWrongPasswordHaveTheSamePublicFailure() throws Exception {
    accounts.setActive("viewer",false);
    for(String name:List.of("missing","viewer","admin"))failure(name);
    for(int i=1;i<5;i++){failure("missing");failure("viewer");}
    for(String name:List.of("missing","viewer"))mvc.perform(formLogin().user(name).password(password)).andExpect(status().isTooManyRequests());
  }
  @Test void sourceLimitStopsRotatingNamesAndDoesNotTrustForwardedHeaders() throws Exception {
    for(int i=0;i<30;i++)failure("missing"+i);
    mvc.perform(post("/login").with(csrf()).param("username","admin").param("password",password)
        .header("X-Forwarded-For","203.0.113.10").header("Forwarded","for=203.0.113.11"))
        .andExpect(status().isTooManyRequests());
    mvc.perform(post("/login").with(csrf()).param("username","admin").param("password",password)
        .with(r->{r.setRemoteAddr("192.0.2.40");return r;})).andExpect(redirectedUrl("/#/overview"));
  }
  @Test void successfulLoginClearsOnlyItsAccountBudgetAndRecordsNoSecrets() throws Exception {
    failure("viewer");failure("viewer");
    var session=(MockHttpSession)mvc.perform(formLogin().user("viewer").password(password)).andExpect(redirectedUrl("/#/overview"))
        .andReturn().getRequest().getSession(false);
    for(int i=0;i<5;i++)failure("viewer");
    mvc.perform(get("/api/overview").session(session)).andExpect(status().isOk()); // Existing sessions are not disabled by login limits.
    assertEquals(8,jdbc.queryForObject("SELECT attempt_count FROM login_throttle WHERE bucket_key=?",Integer.class,"S:"+LoginSecurityService.hash("127.0.0.1")));
    String logs=mapper.writeValueAsString(security.events());
    assertFalse(logs.contains(password));assertFalse(logs.contains("qa-wrong-password"));assertFalse(logs.contains("127.0.0.1"));
    assertTrue(logs.contains("LOGIN_SUCCESS"));assertTrue(logs.contains("LOGIN_FAILURE"));
  }
  @Test void limiterSurvivesServiceRecreationAndConcurrentRequestsCannotExceedSlots() throws Exception {
    try(var pool=Executors.newFixedThreadPool(12)){
      List<Future<LoginSecurityService.Permit>> results=new ArrayList<>();
      for(int i=0;i<12;i++)results.add(pool.submit(()->security.reserve("viewer","192.0.2.1")));
      int allowed=0;for(var result:results)if(result.get().allowed())allowed++;
      assertEquals(5,allowed);
    }
    var restarted=new LoginSecurityService(jdbc,mapper,manager,clock,5,30,900);
    assertFalse(restarted.reserve("viewer","192.0.2.2").allowed());
    assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM audit_event WHERE entity_type='authentication' AND action='LOGIN_BLOCKED'",Integer.class));
  }
  @Test void delayedSuccessCannotClearNewerReservations() {
    var first=security.reserve("viewer","192.0.2.1");
    for(int i=0;i<4;i++)security.reserve("viewer","192.0.2.1");
    security.success(first,"viewer","192.0.2.1");
    assertFalse(security.reserve("viewer","192.0.2.1").allowed());
    clock.now=clock.now.plusSeconds(900);
    var fresh=security.reserve("viewer","192.0.2.1");
    security.success(first,"viewer","192.0.2.1");
    assertEquals(1,jdbc.queryForObject("SELECT attempt_count FROM login_throttle WHERE bucket_key=?",Integer.class,fresh.accountKey()));
  }
  @Test void csrfProtectedAndAuditReadIsAdminOnlyAndExcludedFromBackup() throws Exception {
    mvc.perform(post("/login").param("username","viewer").param("password",password)).andExpect(status().isForbidden());
    assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM login_throttle",Integer.class));
    mvc.perform(get("/api/admin/login-events")).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/admin/login-events").with(user("viewer").roles("USER"))).andExpect(status().isForbidden());
    mvc.perform(get("/api/admin/login-events").with(user("admin").roles("ADMIN"))).andExpect(status().isOk());
    String backup=mvc.perform(get("/api/export").with(user("admin").roles("ADMIN"))).andReturn().getResponse().getContentAsString();
    assertFalse(mapper.readTree(backup).path("tables").has("login_throttle"));
    assertFalse(mapper.readTree(backup).path("tables").has("audit_event"));
  }
  @Test void invalidNamesAreRedactedAndAuditRetentionAndLimitAreBounded() {
    security.failure("<script>bad</script>","192.0.2.1");
    assertEquals("(geçersiz kullanıcı adı)",security.events().getFirst().get("username"));
    clock.now=clock.now.plusSeconds(31L*86400);
    security.failure("viewer","192.0.2.1");
    assertEquals(1,security.events().size());
    jdbc.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) SELECT ?,'authentication','viewer','LOGIN_FAILURE','{}' FROM SYSTEM_RANGE(1,2001)",java.sql.Timestamp.from(clock.instant()));
    security.failure("viewer","192.0.2.1");
    assertEquals(2000,jdbc.queryForObject("SELECT COUNT(*) FROM audit_event WHERE entity_type='authentication'",Integer.class));
    assertEquals(100,security.events().size());
  }
}
