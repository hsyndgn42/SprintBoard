package com.sprintboard;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@org.junit.jupiter.api.Tag("historical")
@org.springframework.test.context.ActiveProfiles("historical-tests")
@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:sprintboardsecurity;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class SecurityFlowTest {
  @Autowired MockMvc mvc;

  @Test void roadmapIdentityWritesAreAdminOnlyAndReportIsReadable() throws Exception {
    mvc.perform(get("/api/reports/roadmap")).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/reports/roadmap").with(user("viewer").roles("USER"))).andExpect(status().isOk());
    mvc.perform(put("/api/roadmap/missing").with(user("viewer").roles("USER")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
    mvc.perform(put("/api/roadmap/missing").with(user("admin").roles("ADMIN")).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
  }

  @Test
  void firstRunAdminAndReadOnlyUserAreEnforcedByServer() throws Exception {
    mvc.perform(get("/api/auth/session")).andExpect(status().isOk())
        .andExpect(jsonPath("$.setupRequired").value(true));
    mvc.perform(get("/api/overview")).andExpect(status().isUnauthorized());
    mvc.perform(post("/api/auth/setup").contentType(MediaType.APPLICATION_JSON)
        .content("{\"username\":\"admin\",\"password\":\"long-safe-password\"}"))
        .andExpect(status().isForbidden());
    mvc.perform(post("/api/auth/setup").with(csrf()).contentType(MediaType.APPLICATION_JSON)
        .content("{\"username\":\"admin\",\"password\":\"long-safe-password\"}"))
        .andExpect(status().isCreated());
    mvc.perform(post("/api/auth/setup").with(csrf()).contentType(MediaType.APPLICATION_JSON)
        .content("{\"username\":\"second\",\"password\":\"long-safe-password\"}"))
        .andExpect(status().isConflict());
    mvc.perform(formLogin().user("admin").password("long-safe-password"))
        .andExpect(status().is3xxRedirection()).andExpect(redirectedUrl("/#/overview"));
    mvc.perform(post("/api/admin/users").with(user("admin").roles("ADMIN")).with(csrf())
        .contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"viewer\",\"password\":\"viewer-safe-password\"}"))
        .andExpect(status().isCreated());
    mvc.perform(formLogin().user("viewer").password("viewer-safe-password"))
        .andExpect(status().is3xxRedirection());
    mvc.perform(get("/api/overview").with(user("viewer").roles("USER")))
        .andExpect(status().isOk()).andExpect(jsonPath("$.totalSprints").value(14));
    mvc.perform(get("/api/export").with(user("viewer").roles("USER"))).andExpect(status().isForbidden());
    for(String endpoint:new String[]{"/api/tasks/missing/blocker","/api/sprints/legacy-sprint-14/flow"}){
      mvc.perform(put(endpoint).with(user("viewer").roles("USER")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
      mvc.perform(put(endpoint).with(user("admin").roles("ADMIN")).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
    }
    mvc.perform(post("/api/tasks/missing/remove").with(user("viewer").roles("USER")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
    mvc.perform(post("/api/tasks/missing/remove").with(user("admin").roles("ADMIN")).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
    mvc.perform(put("/api/backlog/any/defect").with(user("viewer").roles("USER")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}")) .andExpect(status().isForbidden());
    mvc.perform(get("/api/sprints/legacy-sprint-14/retro/actions").with(user("viewer").roles("USER"))).andExpect(status().isOk());
    mvc.perform(post("/api/sprints/legacy-sprint-14/retro/actions").with(user("viewer").roles("USER")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
    mvc.perform(put("/api/sprints/legacy-sprint-14/retro/actions/missing").with(user("viewer").roles("USER")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
    mvc.perform(post("/api/sprints/legacy-sprint-14/retro/actions/missing/backlog").with(user("viewer").roles("USER")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
    mvc.perform(get("/api/task-subtypes").with(user("viewer").roles("USER"))).andExpect(status().isOk());
    mvc.perform(post("/api/task-subtypes").with(user("viewer").roles("USER")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
    mvc.perform(put("/api/task-subtypes/GENERAL_TEST").with(user("viewer").roles("USER")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"active\":false}")).andExpect(status().isForbidden());
    mvc.perform(get("/api/reports/defects").with(user("viewer").roles("USER"))).andExpect(status().isOk());
    mvc.perform(post("/api/sprints/legacy-sprint-14/complete").with(user("viewer").roles("USER")).with(csrf())
        .contentType(MediaType.APPLICATION_JSON).content("{}")) .andExpect(status().isForbidden());
    for (String endpoint : new String[]{"/api/admin/backups/preview","/api/admin/backups/restore"}) {
      mvc.perform(post(endpoint).with(user("viewer").roles("USER")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}"))
          .andExpect(status().isForbidden());
      mvc.perform(post(endpoint).with(user("admin").roles("ADMIN")).contentType(MediaType.APPLICATION_JSON).content("{}"))
          .andExpect(status().isForbidden());
    }
    mvc.perform(put("/api/settings").with(user("viewer").roles("USER")).with(csrf())
        .contentType(MediaType.APPLICATION_JSON).content("{\"estimationMode\":\"POINTS_AND_HOURS\"}"))
        .andExpect(status().isForbidden());
    mvc.perform(put("/api/team/legacy-member-akin").with(user("viewer").roles("USER")).with(csrf())
        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Changed\"}"))
        .andExpect(status().isForbidden());
    mvc.perform(put("/api/sprints/legacy-sprint-14/capacity/legacy-member-akin").with(user("viewer").roles("USER")).with(csrf())
        .contentType(MediaType.APPLICATION_JSON).content("{\"allocatedDays\":5}"))
        .andExpect(status().isForbidden());
    mvc.perform(post("/api/backlog").with(user("viewer").roles("USER")).with(csrf())
        .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Forbidden\"}"))
        .andExpect(status().isForbidden());
    mvc.perform(post("/api/bau-templates").with(user("viewer").roles("USER")).with(csrf())
        .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Forbidden BAU\",\"mode\":\"MANUAL\",\"daysPerMember\":0}"))
        .andExpect(status().isForbidden());
    mvc.perform(post("/api/bau-templates").with(user("admin").roles("ADMIN")).with(csrf())
        .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Custom BAU\",\"mode\":\"MANUAL\",\"daysPerMember\":0}"))
        .andExpect(status().isCreated()).andExpect(jsonPath("$.title").value("Custom BAU"));
    mvc.perform(post("/api/backlog").with(user("admin").roles("ADMIN")).with(csrf())
        .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Allowed\",\"size\":\"MEDIUM\"}"))
        .andExpect(status().isCreated());
    mvc.perform(put("/api/settings").with(user("admin").roles("ADMIN")).with(csrf())
        .contentType(MediaType.APPLICATION_JSON).content("{\"estimationMode\":\"POINTS_AND_HOURS\"}"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.estimationMode").value("POINTS_AND_HOURS"));
  }
}
