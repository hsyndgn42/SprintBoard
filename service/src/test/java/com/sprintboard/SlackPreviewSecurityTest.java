package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:slackpreviewsecurity;DB_CLOSE_DELAY=-1","sprintboard.slack.bot-token=","sprintboard.slack.app-token="})
@AutoConfigureMockMvc
class SlackPreviewSecurityTest {
 @Autowired MockMvc mvc;@Autowired BackupService backup;@Autowired ObjectMapper mapper;
 @Test void weeklyAndHistoryAreAdminOnlyAndCsrfProtected()throws Exception{
  for(String path:new String[]{"weekly","weekly/preview","history"}){
   mvc.perform(get("/api/admin/slack/"+path)).andExpect(status().isUnauthorized());
   mvc.perform(get("/api/admin/slack/"+path).with(user("member").roles("USER"))).andExpect(status().isForbidden());
   mvc.perform(get("/api/admin/slack/"+path).with(user("admin").roles("ADMIN"))).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
  }
  for(String path:new String[]{"weekly/send","history/scan"}){
   mvc.perform(post("/api/admin/slack/"+path).with(user("admin").roles("ADMIN")).contentType("application/json").content("{}")).andExpect(status().isForbidden());
   mvc.perform(post("/api/admin/slack/"+path).with(user("member").roles("USER")).with(csrf()).contentType("application/json").content("{}")).andExpect(status().isForbidden());
  }
  mvc.perform(put("/api/admin/slack/weekly").with(user("member").roles("USER")).with(csrf()).contentType("application/json").content("{}")).andExpect(status().isForbidden());
 }
 @Test void digestAdminOnlyAndCsrf()throws Exception{
  mvc.perform(get("/api/admin/slack/digest")).andExpect(status().isUnauthorized());
  for(String endpoint:new String[]{"/api/admin/slack/digest","/api/admin/slack/digest/preview"})mvc.perform(get(endpoint).with(user("member").roles("USER"))).andExpect(status().isForbidden());
  mvc.perform(get("/api/admin/slack/digest").with(user("admin").roles("ADMIN"))).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.enabled").value(false));
  mvc.perform(post("/api/admin/slack/digest/send").with(user("admin").roles("ADMIN")).contentType("application/json").content("{}")).andExpect(status().isForbidden());
  mvc.perform(post("/api/admin/slack/digest/send").with(user("member").roles("USER")).with(csrf()).contentType("application/json").content("{}")).andExpect(status().isForbidden());
  mvc.perform(put("/api/admin/slack/digest").with(user("member").roles("USER")).with(csrf()).contentType("application/json").content("{}")).andExpect(status().isForbidden());
 }
 @Test void adminOnlyCsrfAndNoProductMutation()throws Exception{
  var before=mapper.valueToTree(backup.exportData()).path("tables");
  mvc.perform(get("/api/admin/slack")).andExpect(status().isUnauthorized());
  mvc.perform(get("/api/admin/slack").with(user("member").roles("USER"))).andExpect(status().isForbidden());
  mvc.perform(get("/api/admin/slack").with(user("admin").roles("ADMIN"))).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.mode").value("ADMIN_APPROVAL")).andExpect(jsonPath("$.botToken").doesNotExist());
  for(String action:new String[]{"start","stop","parse","reporter-names/retry"}){
   mvc.perform(post("/api/admin/slack/"+action).with(user("admin").roles("ADMIN")).contentType("application/json").content("{}")).andExpect(status().isForbidden());
   mvc.perform(post("/api/admin/slack/"+action).with(user("member").roles("USER")).with(csrf()).contentType("application/json").content("{}")).andExpect(status().isForbidden());
  }
  mvc.perform(post("/api/admin/slack/parse").with(user("admin").roles("ADMIN")).with(csrf()).contentType("application/json").content(mapper.writeValueAsString(Map.of("text",SlackPreviewTest.TEXT)))).andExpect(status().isOk()).andExpect(jsonPath("$.valid").value(true));
  mvc.perform(post("/api/admin/slack/start").with(user("admin").roles("ADMIN")).with(csrf()).with(r->{r.setRemoteAddr("10.1.2.3");return r;}).contentType("application/json").content("{}")).andExpect(status().isBadRequest());
  mvc.perform(post("/api/admin/slack/start").with(user("admin").roles("ADMIN")).with(csrf()).contentType("application/json").content("{}")).andExpect(status().isBadRequest());
  for(String action:new String[]{"credentials"}){
   mvc.perform(delete("/api/admin/slack/"+action).with(user("member").roles("USER")).with(csrf())).andExpect(status().isForbidden());
   mvc.perform(delete("/api/admin/slack/"+action).with(user("admin").roles("ADMIN"))).andExpect(status().isForbidden());
   mvc.perform(delete("/api/admin/slack/"+action).with(user("admin").roles("ADMIN")).with(csrf())).andExpect(status().isOk());
  }
  assertEquals(before,mapper.valueToTree(backup.exportData()).path("tables"));
 }
 @Test void inboxAndConfigurationRequireAdminAndCsrf()throws Exception{
  mvc.perform(get("/api/admin/slack/overtime-inbox").with(user("member").roles("USER"))).andExpect(status().isForbidden());
  mvc.perform(get("/api/admin/slack/overtime-inbox").with(user("admin").roles("ADMIN"))).andExpect(status().isOk());
  mvc.perform(post("/api/admin/slack/overtime-inbox/example/decision").with(user("admin").roles("ADMIN")).contentType("application/json").content("{}")).andExpect(status().isForbidden());
  mvc.perform(post("/api/admin/slack/overtime-inbox/example/decision").with(user("member").roles("USER")).with(csrf()).contentType("application/json").content("{}")).andExpect(status().isForbidden());
  mvc.perform(get("/api/admin/slack/inbox")).andExpect(status().isUnauthorized());
  mvc.perform(get("/api/admin/slack/inbox").with(user("member").roles("USER"))).andExpect(status().isForbidden());
  mvc.perform(get("/api/admin/slack/inbox").with(user("admin").roles("ADMIN"))).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
  mvc.perform(put("/api/admin/slack").with(user("admin").roles("ADMIN")).contentType("application/json").content("{}")).andExpect(status().isForbidden());
  mvc.perform(put("/api/admin/slack").with(user("member").roles("USER")).with(csrf()).contentType("application/json").content("{}")).andExpect(status().isForbidden());
  mvc.perform(put("/api/admin/slack").with(user("admin").roles("ADMIN")).with(csrf()).with(r->{r.setRemoteAddr("10.1.2.3");return r;}).contentType("application/json").content("{}")).andExpect(status().isBadRequest());
  mvc.perform(post("/api/admin/slack/inbox/example/decision").with(user("admin").roles("ADMIN")).contentType("application/json").content("{}")).andExpect(status().isForbidden());
  mvc.perform(post("/api/admin/slack/inbox/example/decision").with(user("member").roles("USER")).with(csrf()).contentType("application/json").content("{}")).andExpect(status().isForbidden());
 }
}
