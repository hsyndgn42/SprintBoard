package com.sprintboard;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;
import org.springframework.transaction.annotation.Transactional;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:confluence-backlog-api;DB_CLOSE_DELAY=-1","sprintboard.slack.worker-enabled=false","sprintboard.slack.digest.scheduler-enabled=false","sprintboard.jira.worker-enabled=false","sprintboard.auto-backup.enabled=false","sprintboard.jira.encryption-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="})
@AutoConfigureMockMvc
@Transactional
class ConfluenceBacklogApiTest {
  @Autowired MockMvc mvc;
  @Autowired WorkspaceService workspace;
  @Autowired ConfluenceConfigStore configs;
  @Autowired ObjectMapper mapper;
  @MockitoBean ConfluenceTransport transport;
  @Test void onlyAdminMayPreviewOrPublishAndWritesRequireCsrf()throws Exception{
    mvc.perform(get("/api/admin/confluence/backlog")).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/admin/confluence/backlog").with(user("reader").roles("USER"))).andExpect(status().isForbidden());
    for(String path:new String[]{"/api/admin/confluence/backlog/preview","/api/admin/confluence/backlog"}){
      mvc.perform(post(path).with(user("reader").roles("USER")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
      mvc.perform(post(path).with(user("admin").roles("ADMIN")).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
    }
    verifyNoInteractions(transport);
  }
  @Test void adminReadsStatusAndValidationErrorsWithoutExposingSecrets()throws Exception{
    mvc.perform(get("/api/admin/confluence/backlog").with(user("admin").roles("ADMIN"))).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.configured").value(false)).andExpect(jsonPath("$.pat").doesNotExist());
    mvc.perform(post("/api/admin/confluence/backlog/preview").with(user("admin").roles("ADMIN")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"itemIds\":[],\"scope\":\"Havuz\"}")).andExpect(status().isBadRequest());
    verifyNoInteractions(transport);
  }
  @Test void realBacklogCanBePreviewedAndPublishedThroughAdminEndpoints()throws Exception{
    configs.save(new ConfluenceConfigStore.Config("https://wiki.local","VIBE","10",true,0,false,"20"),"test-token");
    String id=workspace.createBacklog(Map.of("title","Wikiye gidecek iş","taskCategory","DEV","size","SMALL","estimatedHours",12)).get("id").toString();
    var page=mapper.createObjectNode().put("id","20").put("title","Backlog").put("type","page").put("status","current");
    page.putObject("space").put("key","VIBE");page.putObject("version").put("number",3);
    when(transport.get(anyString(),anyString(),eq("/rest/api/content/20"),anyMap())).thenReturn(page);
    var published=page.deepCopy();published.withObject("version").put("number",4);
    when(transport.put(anyString(),anyString(),eq("/rest/api/content/20"),any())).thenReturn(published);
    String preview=mvc.perform(post("/api/admin/confluence/backlog/preview").with(user("admin").roles("ADMIN")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("itemIds",java.util.List.of(id),"scope","Yalnız havuz"))))
      .andExpect(status().isOk()).andExpect(jsonPath("$.pool").value(1)).andExpect(jsonPath("$.rows[0].title").value("Wikiye gidecek iş")).andExpect(jsonPath("$.rows[0].estimatedHours").value(12)).andReturn().getResponse().getContentAsString();
    var input=mapper.readTree(preview);((com.fasterxml.jackson.databind.node.ObjectNode)input).put("confirmed",true);
    mvc.perform(post("/api/admin/confluence/backlog").with(user("admin").roles("ADMIN")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(input)))
      .andExpect(status().isOk()).andExpect(jsonPath("$.pageVersion").value(4)).andExpect(jsonPath("$.itemCount").value(1));
    mvc.perform(get("/api/admin/confluence/backlog").with(user("admin").roles("ADMIN"))).andExpect(jsonPath("$.lastPublish.itemCount").value(1));
  }
}
